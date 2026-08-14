import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FiscalDocumentStatus, FiscalEnvironment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { DfeNetFiscalEngine } from '../fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from '../certificates/fiscal-certificate.service';
import { FiscalEventsService } from './fiscal-events.service';

/**
 * As regras que o motor não tem como impor, porque é stateless: a sequência da
 * CC-e, o limite de 20, e a guarda contra inutilizar número que virou nota.
 */

const documento = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  modelo: 'NFE',
  serie: 1,
  numero: 3,
  status: FiscalDocumentStatus.AUTORIZADO,
  ambiente: FiscalEnvironment.HOMOLOGACAO,
  chaveAcesso: '31260851720322000146550010000000031458732971',
  protocolo: '131260152620587',
  deletedAt: null,
  ...overrides,
});

const mockPrisma = {
  fiscalDocument: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  fiscalCorrectionLetter: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  fiscalInutilization: { create: jest.fn(), findMany: jest.fn() },
  fiscalDocumentEvent: { create: jest.fn() },
  fiscalStatusHistory: { create: jest.fn() },
  fiscalSettings: { findFirst: jest.fn() },
  establishment: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

const mockEngine = { cartaCorrecao: jest.fn(), inutilizar: jest.fn() };
const mockCertificates = { loadCredentials: jest.fn() };
const mockStorage = {
  isConfigured: jest.fn(),
  upload: jest.fn(),
  download: jest.fn(),
};

describe('FiscalEventsService', () => {
  let service: FiscalEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalEventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DfeNetFiscalEngine, useValue: mockEngine },
        { provide: FiscalCertificateService, useValue: mockCertificates },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get(FiscalEventsService);

    jest.clearAllMocks();
    mockPrisma.fiscalDocument.findFirst.mockResolvedValue(documento());
    mockPrisma.fiscalCorrectionLetter.count.mockResolvedValue(0);
    mockPrisma.establishment.findFirst.mockResolvedValue({
      cnpj: '51720322000146',
      state: 'MG',
      company: { cnpj: '51720322000146' },
    });
    mockCertificates.loadCredentials.mockResolvedValue({
      certificadoBase64: 'x',
      certificadoSenha: 'y',
    });
    mockStorage.isConfigured.mockReturnValue(false);
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.resolve(ops.map(() => ({ id: 'novo' }))),
    );
    mockEngine.cartaCorrecao.mockResolvedValue({
      sucesso: true,
      protocolo: '131260000000001',
      condicaoDeUso: 'A Carta de Correcao e disciplinada...',
    });
  });

  describe('carta de correção', () => {
    it('atribui a sequência a partir das correções anteriores', async () => {
      mockPrisma.fiscalCorrectionLetter.count.mockResolvedValue(2);

      await service.createCorrectionLetter('company-1', 'doc-1', {
        correcao: 'Corrigir o nome do bairro do destinatario',
      });

      // O usuário não escolhe a sequência: ela precisa ser a próxima da nota,
      // e só este lado conhece as anteriores.
      expect(mockEngine.cartaCorrecao).toHaveBeenCalledWith(
        expect.objectContaining({ sequenciaEvento: 3 }),
      );
    });

    it('recusa documento que não está autorizado', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({ status: FiscalDocumentStatus.REJEITADO }),
      );

      await expect(
        service.createCorrectionLetter('company-1', 'doc-1', {
          correcao: 'Corrigir o nome do bairro do destinatario',
        }),
      ).rejects.toThrow(/Somente documento autorizado/);

      expect(mockEngine.cartaCorrecao).not.toHaveBeenCalled();
    });

    it('recusa a vigésima primeira correção, citando o limite legal', async () => {
      mockPrisma.fiscalCorrectionLetter.count.mockResolvedValue(20);

      await expect(
        service.createCorrectionLetter('company-1', 'doc-1', {
          correcao: 'Corrigir o nome do bairro do destinatario',
        }),
      ).rejects.toThrow(/limite legal/);

      expect(mockEngine.cartaCorrecao).not.toHaveBeenCalled();
    });

    it('guarda a condição de uso vigente junto da carta', async () => {
      await service.createCorrectionLetter('company-1', 'doc-1', {
        correcao: 'Corrigir o nome do bairro do destinatario',
      });

      const [operacoes] = mockPrisma.$transaction.mock.calls[0] as [unknown[]];
      expect(operacoes).toHaveLength(2);

      const [argumento] = mockPrisma.fiscalCorrectionLetter.create.mock
        .calls[0] as [{ data: { condicaoDeUso: string } }];
      expect(argumento.data.condicaoDeUso).toBe(
        'A Carta de Correcao e disciplinada...',
      );
    });

    it('registra a recusa da SEFAZ como evento antes de falhar', async () => {
      mockEngine.cartaCorrecao.mockResolvedValue({
        sucesso: false,
        motivoRejeicao: 'Rejeicao 573: duplicidade de evento',
      });

      await expect(
        service.createCorrectionLetter('company-1', 'doc-1', {
          correcao: 'Corrigir o nome do bairro do destinatario',
        }),
      ).rejects.toThrow(/573/);

      expect(mockPrisma.fiscalDocumentEvent.create).toHaveBeenCalled();
      expect(mockPrisma.fiscalCorrectionLetter.create).not.toHaveBeenCalled();
    });

    it('recusa documento inexistente', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.createCorrectionLetter('company-1', 'doc-1', {
          correcao: 'Corrigir o nome do bairro do destinatario',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('XML da carta de correção', () => {
    it('devolve o conteúdo gravado na coluna quando não há storage', async () => {
      mockPrisma.fiscalCorrectionLetter.findFirst.mockResolvedValue({
        xmlEvento: '<procEventoNFe>cce</procEventoNFe>',
      });

      await expect(
        service.getCorrectionLetterXml('company-1', 'doc-1', 1),
      ).resolves.toBe('<procEventoNFe>cce</procEventoNFe>');
    });

    it('baixa do storage quando o que está gravado é uma chave', async () => {
      mockPrisma.fiscalCorrectionLetter.findFirst.mockResolvedValue({
        xmlEvento: 'fiscal/company-1/2026/08/chave-cce-1.xml',
      });
      mockStorage.download.mockResolvedValue(
        '<procEventoNFe>do s3</procEventoNFe>',
      );

      await expect(
        service.getCorrectionLetterXml('company-1', 'doc-1', 1),
      ).resolves.toContain('do s3');
    });

    it('recusa sequência que não existe, dizendo qual', async () => {
      mockPrisma.fiscalCorrectionLetter.findFirst.mockResolvedValue(null);

      await expect(
        service.getCorrectionLetterXml('company-1', 'doc-1', 7),
      ).rejects.toThrow(/correção 7/);
    });
  });

  describe('inutilização', () => {
    const pedido = {
      establishmentId: 'estab-1',
      modelo: 'NFE' as const,
      serie: 1,
      numeroInicial: 1,
      numeroFinal: 1,
      justificativa: 'Numeracao reservada e nao utilizada por falha na emissao',
    };

    beforeEach(() => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
        id: 'settings-1',
        ambiente: FiscalEnvironment.HOMOLOGACAO,
        serieNfce: 1,
        proximoNumeroNfce: 5,
        serieNfe: 1,
        proximoNumeroNfe: 4,
      });
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([]);
      mockPrisma.fiscalInutilization.create.mockResolvedValue({ id: 'inut-1' });
      mockEngine.inutilizar.mockResolvedValue({
        sucesso: true,
        protocolo: '131260000000002',
      });
    });

    it('inutiliza a faixa livre', async () => {
      await service.inutilize('company-1', pedido);

      expect(mockEngine.inutilizar).toHaveBeenCalledWith(
        expect.objectContaining({
          modelo: 55,
          numeroInicial: 1,
          numeroFinal: 1,
        }),
      );
    });

    it('recusa faixa que inclui documento autorizado, nomeando o número', async () => {
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([
        {
          numero: 3,
          chaveAcesso: '31260851720322000146550010000000031458732971',
          status: FiscalDocumentStatus.AUTORIZADO,
        },
      ]);

      await expect(
        service.inutilize('company-1', {
          ...pedido,
          numeroInicial: 1,
          numeroFinal: 5,
        }),
      ).rejects.toThrow(/número 3/);

      // A SEFAZ recusaria também, mas depois e sem dizer qual número.
      expect(mockEngine.inutilizar).not.toHaveBeenCalled();
    });

    it('recusa faixa invertida antes de qualquer consulta', async () => {
      await expect(
        service.inutilize('company-1', {
          ...pedido,
          numeroInicial: 9,
          numeroFinal: 2,
        }),
      ).rejects.toThrow(/maior ou igual ao inicial/);

      expect(mockPrisma.fiscalSettings.findFirst).not.toHaveBeenCalled();
    });

    it('recusa estabelecimento sem configuração fiscal ativa', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(null);

      await expect(service.inutilize('company-1', pedido)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('usa o ano corrente quando nenhum é informado', async () => {
      await service.inutilize('company-1', pedido);

      expect(mockEngine.inutilizar).toHaveBeenCalledWith(
        expect.objectContaining({ ano: new Date().getFullYear() }),
      );
    });

    it('manda a UF do estabelecimento — não há chave de onde deduzi-la', async () => {
      await service.inutilize('company-1', pedido);

      expect(mockEngine.inutilizar).toHaveBeenCalledWith(
        expect.objectContaining({ uf: 'MG' }),
      );
    });

    it('recusa quando o estabelecimento não tem UF', async () => {
      mockPrisma.establishment.findFirst.mockImplementation(
        ({ select }: { select?: Record<string, boolean> }) =>
          select?.state
            ? Promise.resolve({ state: '' })
            : Promise.resolve({
                cnpj: '51720322000146',
                company: { cnpj: '51720322000146' },
              }),
      );

      await expect(service.inutilize('company-1', pedido)).rejects.toThrow(
        /UF do estabelecimento/,
      );
    });
  });

  describe('faixas pendentes', () => {
    it('sugere o número reservado que nunca virou documento', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
        ambiente: FiscalEnvironment.HOMOLOGACAO,
        serieNfce: 1,
        proximoNumeroNfce: 1,
        serieNfe: 1,
        proximoNumeroNfe: 4,
      });
      // NF-e: existem os números 2 e 3; o 1 foi reservado e perdido.
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([
        { numero: 2 },
        { numero: 3 },
      ]);
      mockPrisma.fiscalInutilization.findMany.mockResolvedValue([]);

      const faixas = await service.pendingRanges('company-1', 'estab-1');

      expect(faixas).toEqual([
        { modelo: 'NFE', serie: 1, faixas: [{ inicio: 1, fim: 1 }] },
      ]);
    });

    it('não sugere de novo o que já foi inutilizado', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
        ambiente: FiscalEnvironment.HOMOLOGACAO,
        serieNfce: 1,
        proximoNumeroNfce: 1,
        serieNfe: 1,
        proximoNumeroNfe: 4,
      });
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([
        { numero: 2 },
        { numero: 3 },
      ]);
      mockPrisma.fiscalInutilization.findMany.mockResolvedValue([
        { numeroInicial: 1, numeroFinal: 1 },
      ]);

      expect(await service.pendingRanges('company-1', 'estab-1')).toEqual([]);
    });

    it('devolve vazio quando o estabelecimento não tem configuração', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(null);

      expect(await service.pendingRanges('company-1', 'estab-1')).toEqual([]);
    });
  });
});
