import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  FiscalDocumentStatus,
  FiscalEnvironment,
  FiscalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { DfeNetFiscalEngine } from '../fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from '../certificates/fiscal-certificate.service';
import { FiscalEngineTransportError } from '../fiscal-engine/fiscal-engine.interface';
import { FiscalSnapshot } from '../emission/fiscal-snapshot.builder';
import {
  FiscalEmissionJobData,
  FiscalEmissionProcessor,
} from './fiscal-emission.processor';

const CHAVE = '3'.repeat(44);

const snapshot: FiscalSnapshot = {
  versao: 1,
  venda: {
    id: 'sale-1',
    numero: 1001,
    subtotal: 10,
    desconto: 0,
    total: 10,
    data: '2026-08-04T12:00:00.000Z',
  },
  emitente: {
    cnpj: '11222333000181',
    razaoSocial: 'Empresa Teste LTDA',
    inscricaoEstadual: '123456789',
    crt: '1',
    logradouro: 'Rua das Flores',
    numero: '100',
    bairro: 'Centro',
    codigoMunicipio: '3550308',
    municipio: 'São Paulo',
    uf: 'SP',
    cep: '01001000',
  },
  itens: [
    {
      numeroItem: 1,
      codigoProduto: 'REF350',
      descricao: 'Refrigerante Lata 350ml',
      ncm: '22021000',
      cfop: '5102',
      unidadeComercial: 'UN',
      quantidade: 2,
      valorUnitario: 5,
      origem: 0,
      csosn: '102',
    },
  ],
  pagamentos: [{ tipo: 'dinheiro', valor: 10 }],
  valorTotal: 10,
};

const documento = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  saleId: 'sale-1',
  serie: 1,
  numero: 42,
  ambiente: FiscalEnvironment.HOMOLOGACAO,
  status: FiscalDocumentStatus.PENDENTE,
  attempts: 0,
  snapshot,
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

const mockEngine = { emitir: jest.fn() };
const mockCertificates = { loadCredentials: jest.fn() };
const mockStorage = { isConfigured: jest.fn(), upload: jest.fn() };

const job = () =>
  ({
    data: { fiscalDocumentId: 'doc-1', companyId: 'company-1' },
    attemptsMade: 0,
  }) as Job<FiscalEmissionJobData>;

/** Dados passados ao update do documento fiscal na conclusão da emissão. */
const dadosDoUpdate = (indice: number): Record<string, unknown> => {
  const [argumento] = mockPrisma.fiscalDocument.update.mock.calls[indice] as [
    { data: Record<string, unknown> },
  ];
  return argumento.data;
};

describe('FiscalEmissionProcessor', () => {
  let processor: FiscalEmissionProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalEmissionProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DfeNetFiscalEngine, useValue: mockEngine },
        { provide: FiscalCertificateService, useValue: mockCertificates },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    processor = module.get<FiscalEmissionProcessor>(FiscalEmissionProcessor);

    jest.clearAllMocks();
    mockPrisma.fiscalDocument.findFirst.mockResolvedValue(documento());
    mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
      codigoCsc: 'CSC123',
      idCsc: '000001',
    });
    mockPrisma.$transaction.mockImplementation(
      (callback: (client: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );
    mockCertificates.loadCredentials.mockResolvedValue({
      certificadoBase64: 'cert',
      certificadoSenha: 'senha',
    });
    mockStorage.isConfigured.mockReturnValue(true);
    mockStorage.upload.mockResolvedValue('url');
  });

  describe('emissão autorizada', () => {
    beforeEach(() => {
      mockEngine.emitir.mockResolvedValue({
        sucesso: true,
        chaveAcesso: CHAVE,
        protocolo: '135210000123456',
        xmlAutorizadoBase64: Buffer.from('<nfeProc/>').toString('base64'),
        danfeBase64: Buffer.from('%PDF-1.4').toString('base64'),
        qrCode: 'https://nfce.fazenda.sp.gov.br/qrcode?p=1',
      });
    });

    it('grava chave, protocolo, QR Code e data de autorização', async () => {
      await processor.process(job());

      expect(dadosDoUpdate(1)).toMatchObject({
        status: FiscalDocumentStatus.AUTORIZADO,
        chaveAcesso: CHAVE,
        protocolo: '135210000123456',
        qrCode: 'https://nfce.fazenda.sp.gov.br/qrcode?p=1',
      });
      expect(dadosDoUpdate(1).dataAutorizacao).toBeInstanceOf(Date);
    });

    it('sobe XML e DANFE para o storage e guarda as referências', async () => {
      await processor.process(job());

      const chaves = mockStorage.upload.mock.calls.map(
        (chamada) => (chamada as [string, unknown, string])[0],
      );

      expect(chaves[0]).toMatch(
        new RegExp(`^fiscal/company-1/\\d{4}/\\d{2}/${CHAVE}\\.xml$`),
      );
      expect(chaves[1]).toMatch(
        new RegExp(`^fiscal/company-1/\\d{4}/\\d{2}/${CHAVE}\\.pdf$`),
      );
      expect(dadosDoUpdate(1)).toMatchObject({
        xmlAutorizado: chaves[0],
        danfeUrl: chaves[1],
      });
    });

    it('decodifica o XML de base64 antes de subir', async () => {
      await processor.process(job());

      const [, conteudo, contentType] = mockStorage.upload.mock.calls[0] as [
        string,
        string,
        string,
      ];

      expect(conteudo).toBe('<nfeProc/>');
      expect(contentType).toBe('application/xml');
    });

    it('grava o XML na coluna quando o storage não está configurado', async () => {
      mockStorage.isConfigured.mockReturnValue(false);

      await processor.process(job());

      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(dadosDoUpdate(1)).toMatchObject({ xmlAutorizado: '<nfeProc/>' });
    });

    it('mantém a nota autorizada mesmo se o storage falhar', async () => {
      mockStorage.upload.mockRejectedValue(new Error('bucket indisponível'));

      await processor.process(job());

      expect(dadosDoUpdate(1)).toMatchObject({
        status: FiscalDocumentStatus.AUTORIZADO,
        xmlAutorizado: '<nfeProc/>',
      });
    });

    it('atualiza a venda para PROCESSANDO e depois AUTORIZADO', async () => {
      await processor.process(job());

      expect(mockPrisma.sale.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'sale-1' },
        data: { fiscalStatus: FiscalStatus.PROCESSANDO },
      });
      expect(mockPrisma.sale.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'sale-1' },
        data: { fiscalStatus: FiscalStatus.AUTORIZADO },
      });
    });
  });

  describe('rejeição da SEFAZ', () => {
    it('marca REJEITADO com código e mensagem, sem subir arquivos', async () => {
      mockEngine.emitir.mockResolvedValue({
        sucesso: false,
        rejeicao: { codigo: '539', mensagem: 'Duplicidade de NF-e' },
      });

      await processor.process(job());

      expect(dadosDoUpdate(1)).toMatchObject({
        status: FiscalDocumentStatus.REJEITADO,
        rejeicaoCodigo: '539',
        rejeicaoMensagem: 'Duplicidade de NF-e',
      });
      expect(dadosDoUpdate(1).dataAutorizacao).toBeUndefined();
      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(mockPrisma.sale.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'sale-1' },
        data: { fiscalStatus: FiscalStatus.REJEITADO },
      });
    });
  });

  describe('falhas antes do envio', () => {
    it('marca ERRO sem reprocessar quando o certificado está vencido', async () => {
      mockCertificates.loadCredentials.mockRejectedValue(
        new BadRequestException('Certificado digital vencido em 01/01/2026'),
      );

      await expect(processor.process(job())).resolves.toBeUndefined();

      expect(mockEngine.emitir).not.toHaveBeenCalled();
      expect(dadosDoUpdate(1)).toEqual({
        status: FiscalDocumentStatus.ERRO,
      });
    });

    it('marca ERRO sem reprocessar quando falta CSC', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
        codigoCsc: null,
        idCsc: null,
      });

      await expect(processor.process(job())).resolves.toBeUndefined();

      expect(mockEngine.emitir).not.toHaveBeenCalled();
      expect(mockPrisma.fiscalStatusHistory.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          statusTo: FiscalDocumentStatus.ERRO,
        }) as unknown,
      });
    });
  });

  describe('falha de transporte', () => {
    it('marca ERRO e repropaga para a fila reprocessar', async () => {
      mockEngine.emitir.mockRejectedValue(
        new FiscalEngineTransportError('Motor fora do ar', 'NETWORK'),
      );

      await expect(processor.process(job())).rejects.toThrow(
        'Motor fora do ar',
      );

      expect(dadosDoUpdate(1)).toEqual({ status: FiscalDocumentStatus.ERRO });
    });
  });

  describe('auditoria das tentativas', () => {
    const jobComUsuario = () =>
      ({
        data: {
          fiscalDocumentId: 'doc-1',
          companyId: 'company-1',
          usuarioId: 'user-1',
        },
        attemptsMade: 0,
      }) as Job<FiscalEmissionJobData>;

    it('conta a tentativa e registra quem a originou', async () => {
      mockEngine.emitir.mockResolvedValue({
        sucesso: true,
        chaveAcesso: CHAVE,
        protocolo: '135210000123456',
      });

      await processor.process(jobComUsuario());

      expect(dadosDoUpdate(0)).toEqual({
        attempts: { increment: 1 },
        status: FiscalDocumentStatus.PROCESSANDO,
      });
      expect(mockPrisma.fiscalStatusHistory.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          statusTo: FiscalDocumentStatus.PROCESSANDO,
          motivo: 'Tentativa de emissão #1',
          usuarioId: 'user-1',
        }),
      });
    });

    it('registra o usuário também no desfecho da tentativa', async () => {
      mockEngine.emitir.mockResolvedValue({
        sucesso: false,
        rejeicao: { codigo: '539', mensagem: 'Duplicidade de NF-e' },
      });

      await processor.process(jobComUsuario());

      expect(mockPrisma.fiscalStatusHistory.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          statusTo: FiscalDocumentStatus.REJEITADO,
          usuarioId: 'user-1',
        }),
      });
    });

    it('mantém a emissão sem usuário quando o job não informa', async () => {
      mockEngine.emitir.mockResolvedValue({
        sucesso: true,
        chaveAcesso: CHAVE,
        protocolo: '135210000123456',
      });

      await processor.process(job());

      expect(mockPrisma.fiscalStatusHistory.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({ usuarioId: undefined }),
      });
    });
  });

  describe('guarda de status', () => {
    it('ignora documento que não está PENDENTE nem ERRO', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({ status: FiscalDocumentStatus.AUTORIZADO }),
      );

      await processor.process(job());

      expect(mockPrisma.fiscalDocument.update).not.toHaveBeenCalled();
      expect(mockEngine.emitir).not.toHaveBeenCalled();
    });
  });
});
