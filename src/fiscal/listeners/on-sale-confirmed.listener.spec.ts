import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { FiscalEnvironment, PersonType, TaxRegimeCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FISCAL_EMISSION_QUEUE } from '../../queue/queue.constants';
import { OnSaleConfirmedListener } from './on-sale-confirmed.listener';

/**
 * Venda a pessoa jurídica sai como NF-e, não como NFC-e — é o recorte da etapa
 * 3: PF → NFC-e, PJ → NF-e.
 *
 * A emissão da NF-e **não** é automática porque `indFinal` (revenda ou consumo)
 * não tem resposta segura sem perguntar. Mas a NFC-e automática também não pode
 * acontecer: `fiscal_documents.sale_id` é único, então o documento de NFC-e
 * ocuparia a vaga e tornaria a NF-e daquela venda impossível de emitir.
 *
 * Foi assim que o defeito apareceu, ao emitir a primeira NF-e de verdade em
 * 13/08/2026: o endpoint existia e era inalcançável pelo fluxo normal.
 */

const amanha = new Date(Date.now() + 86_400_000);

const mockPrisma = {
  fiscalSettings: { findFirst: jest.fn(), update: jest.fn() },
  sale: { findFirst: jest.fn(), update: jest.fn() },
  company: { findFirst: jest.fn() },
  fiscalDocument: { create: jest.fn() },
  fiscalStatusHistory: { create: jest.fn() },
  fiscalDocumentEvent: { create: jest.fn() },
};

const mockQueue = { add: jest.fn() };

const evento = {
  saleId: 'sale-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
};

const cliente = (personType: PersonType) => ({
  id: 'partner-1',
  name: personType === PersonType.PJ ? 'Colégio Sao Judas LTDA' : 'Ana Paula',
  personType,
  cpfCnpj: personType === PersonType.PJ ? '33445566000186' : '11144477735',
  indIeDest: personType === PersonType.PJ ? 9 : null,
  rgIe: null,
  cep: '39400128',
  street: 'Rua Doutor Santos',
  number: '340',
  neighborhood: 'Centro',
  city: 'Montes Claros',
  state: 'MG',
  ibgeCode: '3143302',
  phone: null,
  email: null,
});

const venda = (customer: ReturnType<typeof cliente> | null) => ({
  id: 'sale-1',
  saleNumber: 1,
  totalAmount: 10,
  saleDate: new Date('2026-08-13T12:00:00Z'),
  paymentMethod: 'DINHEIRO',
  customer,
  items: [
    {
      id: 'item-1',
      quantity: 1,
      total: 10,
      product: {
        id: 'prod-1',
        name: 'Água Mineral 500ml',
        sku: 'BEB-003',
        barcode: null,
        unit: 'UN',
        ncm: '22011000',
        cest: null,
        cfop: '5102',
        origin: 0,
        csosn: '102',
        cstIcms: null,
        cstPis: '07',
        cstCofins: '07',
        aliquotaIcms: null,
        aliquotaPis: null,
        aliquotaCofins: null,
      },
    },
  ],
  payments: [{ method: 'DINHEIRO', amount: 10 }],
  establishment: {
    id: 'estab-1',
    name: 'Sal e Fogo Braga LTDA',
    cnpj: '51720322000146',
    inscricaoEstadual: '0046845300054',
    street: 'Rua Joviniano Ramos',
    number: '446',
    complement: null,
    neighborhood: 'São José',
    city: 'Montes Claros',
    state: 'MG',
    cep: '39400347',
    ibgeCode: '3143302',
  },
});

describe('OnSaleConfirmedListener — escolha do modelo', () => {
  let listener: OnSaleConfirmedListener;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnSaleConfirmedListener,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(FISCAL_EMISSION_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    listener = module.get(OnSaleConfirmedListener);
    jest.clearAllMocks();

    mockPrisma.fiscalSettings.findFirst.mockResolvedValue({
      id: 'settings-1',
      ambiente: FiscalEnvironment.HOMOLOGACAO,
      serieNfce: 1,
      proximoNumeroNfce: 1,
      codigoCsc: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
      idCsc: '000001',
      certificadoRef: 'enc(pfx)',
      certificadoSenhaRef: 'enc(senha)',
      certificadoValidade: amanha,
      producaoLiberada: false,
      ativo: true,
    });
    mockPrisma.company.findFirst.mockResolvedValue({
      id: 'company-1',
      name: 'Sal e Fogo Braga LTDA',
      razaoSocial: 'Sal e Fogo Braga LTDA',
      nomeFantasia: 'Sal e Fogo',
      cnpj: '51720322000146',
      inscricaoEstadual: '0046845300054',
      crt: TaxRegimeCode.SIMPLES_NACIONAL,
      codigoIbgeMunicipio: '3143302',
      telefoneFiscal: '3898842804',
      emailFiscal: null,
      phone: null,
    });
    mockPrisma.fiscalDocument.create.mockResolvedValue({ id: 'doc-1' });
    mockPrisma.fiscalStatusHistory.create.mockResolvedValue({});
    mockPrisma.fiscalDocumentEvent.create.mockResolvedValue({});
    mockPrisma.sale.update.mockResolvedValue({});
    mockPrisma.fiscalSettings.update.mockResolvedValue({});
  });

  it('não emite NFC-e automática para cliente pessoa jurídica', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(venda(cliente(PersonType.PJ)));

    await listener.handleSaleConfirmed(evento);

    expect(mockPrisma.fiscalDocument.create).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('não consome numeração de NFC-e na venda a pessoa jurídica', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(venda(cliente(PersonType.PJ)));

    await listener.handleSaleConfirmed(evento);

    expect(mockPrisma.fiscalSettings.update).not.toHaveBeenCalled();
  });

  it('continua emitindo NFC-e para cliente pessoa física', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(venda(cliente(PersonType.PF)));

    await listener.handleSaleConfirmed(evento);

    expect(mockPrisma.fiscalDocument.create).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
  });

  it('continua emitindo NFC-e para venda sem cliente identificado', async () => {
    mockPrisma.sale.findFirst.mockResolvedValue(venda(null));

    await listener.handleSaleConfirmed(evento);

    expect(mockPrisma.fiscalDocument.create).toHaveBeenCalled();
  });
});
