import { Test, TestingModule } from '@nestjs/testing';
import { FiscalDocumentStatus } from '@prisma/client';
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

const mockPrisma = {
  fiscalDocument: { findMany: jest.fn(), count: jest.fn() },
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
});
