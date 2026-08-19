import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import {
  FiscalDocumentStatus,
  FiscalEnvironment,
  FiscalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from './certificates/fiscal-certificate.service';
import { FiscalOperationsService } from './fiscal-operations.service';
import { FISCAL_EMISSION_QUEUE } from '../queue/queue.constants';

const CHAVE = '3'.repeat(44);

const documento = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  saleId: 'sale-1',
  status: FiscalDocumentStatus.AUTORIZADO,
  chaveAcesso: CHAVE,
  protocolo: '135210000123456',
  ambiente: FiscalEnvironment.HOMOLOGACAO,
  dataAutorizacao: new Date('2026-08-04T12:00:00Z'),
  attempts: 1,
  ...overrides,
});

const mockPrisma = {
  fiscalDocument: { findFirst: jest.fn(), update: jest.fn() },
  fiscalSettings: { findFirst: jest.fn() },
  fiscalStatusHistory: { create: jest.fn() },
  fiscalDocumentEvent: { create: jest.fn() },
  sale: { update: jest.fn() },
  $transaction: jest.fn(),
};

const mockEngine = {
  cancelar: jest.fn(),
  consultar: jest.fn(),
  statusServico: jest.fn(),
  health: jest.fn(),
};
const mockCertificates = { loadCredentials: jest.fn() };
const mockStorage = { isConfigured: jest.fn(), upload: jest.fn() };
const mockQueue = { add: jest.fn(), remove: jest.fn() };

/** Dados do update do documento fiscal na chamada indicada. */
const dadosDoUpdate = (indice = 0): Record<string, unknown> => {
  const [argumento] = mockPrisma.fiscalDocument.update.mock.calls[indice] as [
    { data: Record<string, unknown> },
  ];
  return argumento.data;
};

describe('FiscalOperationsService', () => {
  let service: FiscalOperationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalOperationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DfeNetFiscalEngine, useValue: mockEngine },
        { provide: FiscalCertificateService, useValue: mockCertificates },
        { provide: StorageService, useValue: mockStorage },
        { provide: getQueueToken(FISCAL_EMISSION_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FiscalOperationsService>(FiscalOperationsService);

    jest.clearAllMocks();
    mockPrisma.fiscalDocument.findFirst.mockResolvedValue(documento());
    mockPrisma.fiscalDocument.update.mockResolvedValue(documento());
    mockPrisma.$transaction.mockImplementation(
      (operacoes: Promise<unknown>[]) => Promise.all(operacoes),
    );
    mockCertificates.loadCredentials.mockResolvedValue({
      certificadoBase64: 'cert',
      certificadoSenha: 'senha',
    });
    mockStorage.isConfigured.mockReturnValue(false);
    mockQueue.remove.mockResolvedValue(1);
  });

  describe('cancel', () => {
    it('cancela na SEFAZ e reflete no documento e na venda', async () => {
      mockEngine.cancelar.mockResolvedValue({
        sucesso: true,
        protocolo: '135210000999999',
        xmlCancelamentoBase64: Buffer.from('<evento/>').toString('base64'),
      });

      await service.cancel(
        'company-1',
        'doc-1',
        'Cancelamento por erro de digitação no pedido',
        'user-1',
      );

      expect(mockEngine.cancelar).toHaveBeenCalledWith({
        chaveAcesso: CHAVE,
        protocoloAutorizacao: '135210000123456',
        justificativa: 'Cancelamento por erro de digitação no pedido',
        ambiente: 'homologacao',
        certificadoBase64: 'cert',
        certificadoSenha: 'senha',
      });
      expect(dadosDoUpdate()).toMatchObject({
        status: FiscalDocumentStatus.CANCELADO,
        xmlCancelamento: '<evento/>',
      });
      expect(mockPrisma.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: { fiscalStatus: FiscalStatus.CANCELADO },
      });
    });

    it('guarda o XML de cancelamento no storage quando configurado', async () => {
      mockStorage.isConfigured.mockReturnValue(true);
      mockStorage.upload.mockResolvedValue('url');
      mockEngine.cancelar.mockResolvedValue({
        sucesso: true,
        xmlCancelamentoBase64: Buffer.from('<evento/>').toString('base64'),
      });

      await service.cancel('company-1', 'doc-1', 'x'.repeat(20));

      const [chave] = mockStorage.upload.mock.calls[0] as [string];
      expect(chave).toMatch(
        new RegExp(
          `^fiscal/company-1/\\d{4}/\\d{2}/${CHAVE}-cancelamento\\.xml$`,
        ),
      );
      expect(dadosDoUpdate()).toMatchObject({ xmlCancelamento: chave });
    });

    it('recusa cancelar documento já cancelado', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({ status: FiscalDocumentStatus.CANCELADO }),
      );

      await expect(
        service.cancel('company-1', 'doc-1', 'x'.repeat(20)),
      ).rejects.toThrow(/já está cancelado/);
      expect(mockEngine.cancelar).not.toHaveBeenCalled();
    });

    it('recusa cancelar documento que não foi autorizado', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({ status: FiscalDocumentStatus.REJEITADO }),
      );

      await expect(
        service.cancel('company-1', 'doc-1', 'x'.repeat(20)),
      ).rejects.toThrow(/Somente documento autorizado/);
    });

    it('propaga a recusa da SEFAZ e registra o evento', async () => {
      mockEngine.cancelar.mockResolvedValue({
        sucesso: false,
        motivoRejeicao: 'Prazo de cancelamento expirado',
      });

      await expect(
        service.cancel('company-1', 'doc-1', 'x'.repeat(20)),
      ).rejects.toThrow(/Prazo de cancelamento expirado/);
      expect(mockPrisma.fiscalDocumentEvent.create).toHaveBeenCalled();
      expect(mockPrisma.fiscalDocument.update).not.toHaveBeenCalled();
    });

    it('exige documento existente da empresa', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel('company-1', 'doc-1', 'x'.repeat(20)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('consultar', () => {
    it('reconcilia documento em erro que a SEFAZ já autorizou', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({
          status: FiscalDocumentStatus.ERRO,
          dataAutorizacao: null,
        }),
      );
      mockEngine.consultar.mockResolvedValue({
        sucesso: true,
        status: 'Autorizado o uso da NF-e',
        protocolo: '135210000123456',
      });

      const resultado = await service.consultar('company-1', 'doc-1', 'user-1');

      expect(resultado).toMatchObject({
        status: FiscalDocumentStatus.AUTORIZADO,
        atualizado: true,
      });
      expect(dadosDoUpdate()).toMatchObject({
        status: FiscalDocumentStatus.AUTORIZADO,
        protocolo: '135210000123456',
      });
      expect(mockPrisma.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: { fiscalStatus: FiscalStatus.AUTORIZADO },
      });
    });

    it('reconhece cancelamento homologado na SEFAZ', async () => {
      mockEngine.consultar.mockResolvedValue({
        sucesso: true,
        status: 'Cancelamento de NF-e homologado',
      });

      const resultado = await service.consultar('company-1', 'doc-1');

      expect(resultado.status).toBe(FiscalDocumentStatus.CANCELADO);
    });

    it('não altera nada quando a situação já corresponde', async () => {
      mockEngine.consultar.mockResolvedValue({
        sucesso: true,
        status: 'Autorizado o uso da NF-e',
      });

      const resultado = await service.consultar('company-1', 'doc-1');

      expect(resultado.atualizado).toBe(false);
      expect(mockPrisma.fiscalDocument.update).not.toHaveBeenCalled();
    });

    it('devolve a mensagem de erro sem alterar o status', async () => {
      mockEngine.consultar.mockResolvedValue({
        sucesso: false,
        mensagemErro: 'Chave de acesso inexistente',
      });

      const resultado = await service.consultar('company-1', 'doc-1');

      expect(resultado).toMatchObject({
        atualizado: false,
        mensagem: 'Chave de acesso inexistente',
      });
      expect(mockPrisma.fiscalDocument.update).not.toHaveBeenCalled();
    });

    it('exige chave de acesso', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({ chaveAcesso: null }),
      );

      await expect(service.consultar('company-1', 'doc-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('retry', () => {
    it('volta o documento para PENDENTE e reenfileira o mesmo job', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({ status: FiscalDocumentStatus.REJEITADO }),
      );

      await service.retry('company-1', 'doc-1', 'user-1');

      expect(dadosDoUpdate()).toEqual({
        status: FiscalDocumentStatus.PENDENTE,
        rejeicaoCodigo: null,
        rejeicaoMensagem: null,
      });
      expect(mockQueue.remove).toHaveBeenCalledWith('fiscal-doc-1');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'emitir',
        {
          fiscalDocumentId: 'doc-1',
          companyId: 'company-1',
          usuarioId: 'user-1',
        },
        expect.objectContaining({ jobId: 'fiscal-doc-1' }) as unknown,
      );
    });

    it('recusa reprocessar documento autorizado', async () => {
      await expect(service.retry('company-1', 'doc-1')).rejects.toThrow(
        /não pode ser reprocessado/,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('statusServico', () => {
    it('consulta a disponibilidade com a UF do estabelecimento', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
        ambiente: FiscalEnvironment.PRODUCAO,
        establishment: { state: 'sp' },
      });
      mockEngine.statusServico.mockResolvedValue({
        disponivel: true,
        mensagem: 'Serviço em Operação',
      });

      const resultado = await service.statusServico('company-1', 'estab-1');

      expect(mockEngine.statusServico).toHaveBeenCalledWith({
        ambiente: 'producao',
        uf: 'SP',
        certificadoBase64: 'cert',
        certificadoSenha: 'senha',
      });
      expect(resultado.disponivel).toBe(true);
    });

    it('exige UF configurada no estabelecimento', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
        ambiente: FiscalEnvironment.HOMOLOGACAO,
        establishment: { state: null },
      });

      await expect(
        service.statusServico('company-1', 'estab-1'),
      ).rejects.toThrow(/UF do estabelecimento/);
    });

    it('exige configuração fiscal do estabelecimento', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(null);

      await expect(
        service.statusServico('company-1', 'estab-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('engineHealth', () => {
    it('sonda o motor sem exigir certificado nem estabelecimento', async () => {
      mockEngine.health.mockResolvedValue({
        disponivel: true,
        status: 'Healthy',
        latenciaMs: 12,
      });

      const resultado = await service.engineHealth();

      expect(mockEngine.health).toHaveBeenCalledWith();
      expect(mockCertificates.loadCredentials).not.toHaveBeenCalled();
      expect(resultado).toEqual({
        disponivel: true,
        status: 'Healthy',
        latenciaMs: 12,
      });
    });
  });
});
