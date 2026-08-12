import { Readable } from 'stream';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FiscalDocumentStatus, FiscalEnvironment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FiscalService } from './fiscal.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from './certificates/fiscal-certificate.service';

const documento = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  status: FiscalDocumentStatus.REJEITADO,
  rejeicaoCodigo: '539',
  rejeicaoMensagem: 'Duplicidade de NF-e',
  attempts: 2,
  statusHistory: [
    {
      createdAt: new Date('2026-08-04T12:00:00Z'),
      usuarioId: 'user-1',
      motivo: 'Rejeição: 539 - Duplicidade de NF-e',
    },
  ],
  ...overrides,
});

const amanha = new Date(Date.now() + 86_400_000);

const configuracao = (overrides: Record<string, unknown> = {}) => ({
  id: 'settings-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  ambiente: FiscalEnvironment.HOMOLOGACAO,
  serieNfce: 1,
  proximoNumeroNfce: 1,
  codigoCsc: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  idCsc: '000001',
  certificadoRef: 'enc(pfx)',
  certificadoSenhaRef: 'enc(senha)',
  certificadoValidade: amanha,
  ativo: true,
  producaoLiberada: false,
  producaoLiberadaEm: null,
  ...overrides,
});

const mockPrisma = {
  fiscalDocument: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  fiscalSettings: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  fiscalSettingsEvent: { create: jest.fn(), findMany: jest.fn() },
  company: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

const mockStorage = { isConfigured: jest.fn(), download: jest.fn() };
const mockEngine = { consultar: jest.fn() };
const mockCertificates = { loadCredentials: jest.fn() };

/** Filtro `where` usado na consulta da central. */
const whereDaConsulta = (): Record<string, unknown> => {
  const [argumento] = mockPrisma.fiscalDocument.findMany.mock.calls[0] as [
    { where: Record<string, unknown> },
  ];
  return argumento.where;
};

describe('FiscalService', () => {
  let service: FiscalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: DfeNetFiscalEngine, useValue: mockEngine },
        { provide: FiscalCertificateService, useValue: mockCertificates },
      ],
    }).compile();

    service = module.get<FiscalService>(FiscalService);

    jest.clearAllMocks();
    mockPrisma.fiscalDocument.findMany.mockResolvedValue([documento()]);
    mockPrisma.fiscalDocument.count.mockResolvedValue(1);
    mockPrisma.fiscalSettings.findFirst.mockResolvedValue(configuracao());
    mockPrisma.fiscalSettings.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...configuracao(), ...data }),
    );
    mockPrisma.$transaction.mockImplementation(
      (operacoes: Promise<unknown>[]) => Promise.all(operacoes),
    );
    mockPrisma.company.findFirst.mockResolvedValue({
      name: 'Empresa Teste',
      nomeFantasia: null,
      razaoSocial: null,
    });
  });

  describe('findRejections', () => {
    it('traz REJEITADO e ERRO quando nenhum status é informado', async () => {
      await service.findRejections('company-1', {});

      expect(whereDaConsulta()).toMatchObject({
        companyId: 'company-1',
        deletedAt: null,
        status: {
          in: [FiscalDocumentStatus.REJEITADO, FiscalDocumentStatus.ERRO],
        },
      });
    });

    it('restringe ao status informado', async () => {
      await service.findRejections('company-1', { status: 'ERRO' });

      expect(whereDaConsulta()).toMatchObject({
        status: FiscalDocumentStatus.ERRO,
      });
    });

    it('filtra por estabelecimento, código de rejeição e período', async () => {
      await service.findRejections('company-1', {
        establishmentId: 'estab-1',
        rejeicaoCodigo: '539',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      expect(whereDaConsulta()).toMatchObject({
        establishmentId: 'estab-1',
        rejeicaoCodigo: '539',
        createdAt: {
          gte: new Date('2026-08-01'),
          lte: new Date('2026-08-31'),
        },
      });
    });

    it('busca pelo texto da mensagem de rejeição', async () => {
      await service.findRejections('company-1', { search: 'Duplicidade' });

      expect(whereDaConsulta()).toMatchObject({
        rejeicaoMensagem: { contains: 'Duplicidade', mode: 'insensitive' },
      });
    });

    it('devolve a última tentativa e marca o documento como reprocessável', async () => {
      const resultado = await service.findRejections('company-1', {});

      expect(resultado.total).toBe(1);
      expect(resultado.data[0].reprocessavel).toBe(true);
      expect(resultado.data[0].ultimaTentativa).toEqual({
        data: new Date('2026-08-04T12:00:00Z'),
        usuarioId: 'user-1',
        motivo: 'Rejeição: 539 - Duplicidade de NF-e',
      });
    });

    it('não expõe o histórico bruto na listagem', async () => {
      const resultado = await service.findRejections('company-1', {});

      expect(resultado.data[0]).not.toHaveProperty('statusHistory');
    });

    it('marca como não reprocessável o documento já cancelado', async () => {
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([
        documento({ status: FiscalDocumentStatus.CANCELADO }),
      ]);

      const resultado = await service.findRejections('company-1', {});

      expect(resultado.data[0].reprocessavel).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('recusa trocar de ambiente pelo update', async () => {
      await expect(
        service.updateSettings('company-1', 'estab-1', {
          ambiente: FiscalEnvironment.PRODUCAO,
        }),
      ).rejects.toThrow(/ativar/);
    });

    it('audita a troca de série com o valor anterior e o novo', async () => {
      await service.updateSettings(
        'company-1',
        'estab-1',
        { serieNfce: 2 },
        'user-1',
      );

      expect(mockPrisma.fiscalSettingsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: 'serie',
          valorAnterior: '1',
          valorNovo: '2',
          usuarioId: 'user-1',
        }),
      });
    });

    it('audita a troca de CSC sem gravar o código', async () => {
      await service.updateSettings(
        'company-1',
        'estab-1',
        { codigoCsc: '0F1E2D3C4B5A69788796A5B4C3D2E1F0', idCsc: '000002' },
        'user-1',
      );

      const [chamada] = mockPrisma.fiscalSettingsEvent.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(chamada.data).toMatchObject({
        tipo: 'csc',
        valorAnterior: 'idCSC 000001',
        valorNovo: 'idCSC 000002',
      });
      expect(JSON.stringify(chamada.data)).not.toContain(
        '0F1E2D3C4B5A69788796A5B4C3D2E1F0',
      );
    });

    it('não gera evento quando série e CSC não mudam', async () => {
      await service.updateSettings('company-1', 'estab-1', { serieNfce: 1 });

      expect(mockPrisma.fiscalSettingsEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('activateEnvironment', () => {
    it('recusa ativar produção sem liberação', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: false,
        }),
      );

      await expect(
        service.activateEnvironment(
          'company-1',
          'estab-1',
          FiscalEnvironment.PRODUCAO,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('ativa o ambiente, desativa os demais e registra a troca', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          id: 'settings-prod',
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: true,
        }),
      );

      await service.activateEnvironment(
        'company-1',
        'estab-1',
        FiscalEnvironment.PRODUCAO,
        'user-1',
      );

      expect(mockPrisma.fiscalSettings.update).toHaveBeenCalledWith({
        where: { id: 'settings-prod' },
        data: { ativo: true },
      });
      expect(mockPrisma.fiscalSettings.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ativo: false } }),
      );
      expect(mockPrisma.fiscalSettingsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: 'ambiente',
          valorNovo: FiscalEnvironment.PRODUCAO,
          usuarioId: 'user-1',
        }),
      });
    });

    it('exige que a configuração do ambiente exista', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(null);

      await expect(
        service.activateEnvironment(
          'company-1',
          'estab-1',
          FiscalEnvironment.PRODUCAO,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('releaseProduction', () => {
    it('recusa liberar com o checklist incompleto', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          codigoCsc: null,
        }),
      );

      await expect(
        service.releaseProduction('company-1', 'estab-1'),
      ).rejects.toThrow(/csc e id do csc de produção/i);
    });

    it('libera e carimba quem liberou', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({ ambiente: FiscalEnvironment.PRODUCAO }),
      );

      await service.releaseProduction('company-1', 'estab-1', 'user-1');

      expect(mockPrisma.fiscalSettings.update).toHaveBeenCalledWith({
        where: { id: 'settings-1' },
        data: expect.objectContaining({
          producaoLiberada: true,
          producaoLiberadaPor: 'user-1',
          producaoLiberadaEm: expect.any(Date) as unknown,
        }),
      });
      expect(mockPrisma.fiscalSettingsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tipo: 'producao_liberada' }),
      });
    });

    it('exige a configuração de produção antes', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(null);

      await expect(
        service.releaseProduction('company-1', 'estab-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeProduction', () => {
    it('revoga a liberação e volta para homologação', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: true,
        }),
      );

      await service.revokeProduction('company-1', 'estab-1', 'user-1');

      expect(mockPrisma.fiscalSettings.update).toHaveBeenCalledWith({
        where: { id: 'settings-1' },
        data: expect.objectContaining({
          producaoLiberada: false,
          ativo: false,
        }),
      });
      expect(mockPrisma.fiscalSettings.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ambiente: FiscalEnvironment.HOMOLOGACAO,
          }),
          data: { ativo: true },
        }),
      );
      expect(mockPrisma.fiscalSettingsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tipo: 'producao_revogada' }),
      });
    });
  });

  describe('getProductionChecklist', () => {
    it('devolve os itens e a situação da liberação', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: true,
          producaoLiberadaEm: new Date('2026-08-04T12:00:00Z'),
        }),
      );

      const resultado = await service.getProductionChecklist(
        'company-1',
        'estab-1',
      );

      expect(resultado.liberada).toBe(true);
      expect(resultado.liberadaEm).toEqual(new Date('2026-08-04T12:00:00Z'));
      expect(resultado.itens).toHaveLength(6);
    });

    it('inclui o item de consulta pública validada', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: true,
          consultaPublicaValidadaEm: null,
        }),
      );

      const resultado = await service.getProductionChecklist(
        'company-1',
        'estab-1',
      );

      const itemConsulta = resultado.itens.find(
        (i) => i.item === 'Consulta pública validada em produção',
      );
      expect(itemConsulta).toBeDefined();
      expect(itemConsulta?.ok).toBe(false);
    });
  });

  describe('validarConsultaPublica', () => {
    beforeEach(() => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: true,
        }),
      );
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(
        documento({
          status: FiscalDocumentStatus.AUTORIZADO,
          chaveAcesso: '1'.repeat(44),
          ambiente: FiscalEnvironment.PRODUCAO,
        }),
      );
      mockCertificates.loadCredentials.mockResolvedValue({
        certificadoBase64: 'cert',
        certificadoSenha: 'senha',
      });
      mockEngine.consultar.mockResolvedValue({
        sucesso: true,
        status: 'Autorizado o uso da NF-e',
        protocolo: '135210000123456',
      });
    });

    it('valida a consulta pública e registra a validação', async () => {
      const resultado = await service.validarConsultaPublica(
        'company-1',
        'estab-1',
        'user-1',
      );

      expect(resultado.validada).toBe(true);
      expect(resultado.chaveAcesso).toBe('1'.repeat(44));
      expect(mockEngine.consultar).toHaveBeenCalledWith({
        chaveAcesso: '1'.repeat(44),
        ambiente: 'producao',
        certificadoBase64: 'cert',
        certificadoSenha: 'senha',
      });
      expect(mockPrisma.fiscalSettings.update).toHaveBeenCalledWith({
        where: { id: 'settings-1' },
        data: expect.objectContaining({
          consultaPublicaValidadaEm: expect.any(Date),
          consultaPublicaValidadaPor: 'user-1',
        }),
      });
      expect(mockPrisma.fiscalSettingsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: 'consulta_publica_validada',
          valorNovo: '1'.repeat(44),
        }),
      });
    });

    it('recusa validar sem produção liberada', async () => {
      mockPrisma.fiscalSettings.findFirst.mockResolvedValue(
        configuracao({
          ambiente: FiscalEnvironment.PRODUCAO,
          producaoLiberada: false,
        }),
      );

      await expect(
        service.validarConsultaPublica('company-1', 'estab-1'),
      ).rejects.toThrow(/Libere a produção/);
    });

    it('recusa validar sem nota autorizada em produção', async () => {
      mockPrisma.fiscalDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.validarConsultaPublica('company-1', 'estab-1'),
      ).rejects.toThrow(/Nenhuma nota autorizada/);
    });

    it('recusa quando a SEFAZ não confirma a autorização', async () => {
      mockEngine.consultar.mockResolvedValue({
        sucesso: true,
        status: 'Cancelamento homologado',
      });

      await expect(
        service.validarConsultaPublica('company-1', 'estab-1'),
      ).rejects.toThrow(/não está autorizada/);
    });

    it('propaga falha de comunicação com a SEFAZ', async () => {
      mockEngine.consultar.mockResolvedValue({
        sucesso: false,
        mensagemErro: 'Serviço indisponível',
      });

      await expect(
        service.validarConsultaPublica('company-1', 'estab-1'),
      ).rejects.toThrow(/Serviço indisponível/);
    });
  });

  describe('exportarXmls', () => {
    /** Filtro `where` com que a exportação contou os documentos. */
    const whereDaExportacao = (): Record<string, unknown> => {
      const [argumento] = mockPrisma.fiscalDocument.count.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      return argumento.where;
    };

    /** Consome o ZIP inteiro para conferir que o stream fecha de verdade. */
    const lerZip = async (arquivo: Readable): Promise<Buffer> => {
      const partes: Buffer[] = [];
      for await (const parte of arquivo) {
        partes.push(Buffer.from(parte as Buffer));
      }
      return Buffer.concat(partes);
    };

    const periodo = { dataInicio: '2026-08-01', dataFim: '2026-08-31' };

    beforeEach(() => {
      mockPrisma.fiscalDocument.count.mockResolvedValue(0);
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([]);
    });

    it('exporta apenas AUTORIZADO e CANCELADO, da empresa ativa', async () => {
      await service.exportarXmls('company-1', periodo);

      expect(whereDaExportacao()).toMatchObject({
        companyId: 'company-1',
        deletedAt: null,
        ambiente: FiscalEnvironment.PRODUCAO,
        status: {
          in: [FiscalDocumentStatus.AUTORIZADO, FiscalDocumentStatus.CANCELADO],
        },
      });
    });

    it('recorta o período pela data de emissão, com o dia final inteiro', async () => {
      await service.exportarXmls('company-1', periodo);

      expect(whereDaExportacao().dataEmissao).toEqual({
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-31T23:59:59.999Z'),
      });
    });

    it('assume produção quando o ambiente não é informado', async () => {
      const { nomeArquivo } = await service.exportarXmls('company-1', periodo);

      expect(whereDaExportacao().ambiente).toBe(FiscalEnvironment.PRODUCAO);
      expect(nomeArquivo).not.toContain('HOMOLOGACAO');
    });

    it('exporta homologação só quando pedida explicitamente', async () => {
      const { nomeArquivo } = await service.exportarXmls('company-1', {
        ...periodo,
        ambiente: FiscalEnvironment.HOMOLOGACAO,
      });

      expect(whereDaExportacao().ambiente).toBe(FiscalEnvironment.HOMOLOGACAO);
      expect(nomeArquivo).toContain('HOMOLOGACAO-SEM-VALOR-FISCAL');
    });

    it('mantém o companyId mesmo com estabelecimento de outra empresa', async () => {
      await service.exportarXmls('company-1', {
        ...periodo,
        establishmentId: 'estab-de-outra-empresa',
      });

      // O filtro do tenant não é substituível por parâmetro de query.
      expect(whereDaExportacao()).toMatchObject({
        companyId: 'company-1',
        establishmentId: 'estab-de-outra-empresa',
      });
    });

    it('recusa período acima de 92 dias antes de consultar o banco', async () => {
      await expect(
        service.exportarXmls('company-1', {
          dataInicio: '2026-01-01',
          dataFim: '2026-12-31',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.fiscalDocument.count).not.toHaveBeenCalled();
    });

    it('recusa lote acima de 5.000 documentos antes de montar o ZIP', async () => {
      mockPrisma.fiscalDocument.count.mockResolvedValue(5001);

      await expect(service.exportarXmls('company-1', periodo)).rejects.toThrow(
        /5000/,
      );

      expect(mockPrisma.fiscalDocument.findMany).not.toHaveBeenCalled();
    });

    it('devolve um ZIP válido quando o período não tem documentos', async () => {
      const { arquivo } = await service.exportarXmls('company-1', periodo);
      const zip = await lerZip(arquivo);

      // Assinatura de arquivo ZIP: o período vazio devolve o manifesto, não erro.
      expect(zip.subarray(0, 2).toString()).toBe('PK');
      expect(zip.includes('_relacao.csv')).toBe(true);
    });

    it('monta o ZIP com o XML autorizado e o do cancelamento', async () => {
      mockPrisma.fiscalDocument.count.mockResolvedValue(2);
      mockPrisma.fiscalDocument.findMany.mockResolvedValue([
        {
          chaveAcesso: '31260851720322000146650010000000071009048390',
          numero: 7,
          serie: 1,
          modelo: 'NFCE',
          status: FiscalDocumentStatus.CANCELADO,
          dataAutorizacao: new Date('2026-08-10T14:32:05Z'),
          valorTotal: null,
          xmlAutorizado: '<nfeProc>autorizado</nfeProc>',
          xmlCancelamento: '<procEventoNFe>cancelado</procEventoNFe>',
        },
      ]);

      const { arquivo } = await service.exportarXmls('company-1', periodo);
      const zip = await lerZip(arquivo);

      // Os nomes ficam legíveis no ZIP mesmo com o conteúdo comprimido.
      expect(
        zip.includes('31260851720322000146650010000000071009048390-nfe.xml'),
      ).toBe(true);
      expect(
        zip.includes(
          '31260851720322000146650010000000071009048390-cancelamento.xml',
        ),
      ).toBe(true);
    });
  });
});
