import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FiscalDocumentStatus, FiscalEnvironment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FiscalService } from './fiscal.service';

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
  codigoCsc: 'CSC123',
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
  fiscalDocument: { findMany: jest.fn(), count: jest.fn() },
  fiscalSettings: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  fiscalSettingsEvent: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockStorage = { isConfigured: jest.fn(), download: jest.fn() };

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
    mockPrisma.$transaction.mockImplementation((operacoes: Promise<unknown>[]) =>
      Promise.all(operacoes),
    );
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
        { codigoCsc: 'NOVO-CSC', idCsc: '000002' },
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
      expect(JSON.stringify(chamada.data)).not.toContain('NOVO-CSC');
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
      expect(resultado.itens.every((item) => item.ok)).toBe(true);
    });
  });
});
