import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  NfeImportMatch,
  NfeImportStatus,
  PurchaseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NfeImportService } from './nfe-import.service';

/**
 * O que estes testes protegem é o que custa caro em produção: nota entrando
 * duas vezes (dobra estoque e contas a pagar), mercadoria caindo no
 * estabelecimento errado, e a importação movimentando estoque sem ninguém
 * conferir.
 */

const CHAVE = '31260851720322000146550010000000051234567890';
const CNPJ_EMITENTE = '51720322000146';
const CNPJ_DESTINATARIO = '11222333000181';

const xml = (over: { cProd?: string; cEAN?: string; cobr?: string } = {}) => `
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
    <ide><mod>55</mod><serie>1</serie><nNF>4321</nNF><dhEmi>2026-08-15T09:30:00-03:00</dhEmi></ide>
    <emit>
      <CNPJ>${CNPJ_EMITENTE}</CNPJ>
      <xNome>Distribuidora Teste LTDA</xNome>
      <enderEmit><xLgr>Rua das Bebidas</xLgr><nro>500</nro><xMun>Montes Claros</xMun><UF>MG</UF><CEP>39400000</CEP></enderEmit>
      <IE>0011234560012</IE>
    </emit>
    <dest><CNPJ>${CNPJ_DESTINATARIO}</CNPJ></dest>
    <det nItem="1"><prod>
      <cProd>${over.cProd ?? '007'}</cProd>
      <cEAN>${over.cEAN ?? '7891234567895'}</cEAN>
      <xProd>REFRIG LATA 350</xProd><NCM>22021000</NCM><CFOP>1102</CFOP>
      <uCom>CX</uCom><qCom>10.0000</qCom><vUnCom>25.5000</vUnCom><vProd>255.00</vProd>
    </prod></det>
    <total><ICMSTot><vNF>255.00</vNF></ICMSTot></total>
    ${over.cobr ?? ''}
  </infNFe></NFe>
</nfeProc>`;

const mockPrisma = {
  nfeImport: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  nfeImportItem: { update: jest.fn() },
  partnerProductCode: { findMany: jest.fn(), upsert: jest.fn() },
  establishment: { findMany: jest.fn() },
  partner: { findMany: jest.fn(), create: jest.fn() },
  product: { findMany: jest.fn(), findFirst: jest.fn() },
  purchase: { aggregate: jest.fn(), create: jest.fn() },
  // Presentes só para provar que **não** são chamados: a importação não
  // movimenta estoque nem gera títulos.
  stockMovement: { create: jest.fn() },
  financialEntry: { create: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockStorage = {
  isConfigured: jest.fn(),
  upload: jest.fn(),
  download: jest.fn(),
};

const importacao = (overrides: Record<string, unknown> = {}) => ({
  id: 'import-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  supplierId: 'partner-1',
  status: NfeImportStatus.READY,
  chaveAcesso: CHAVE,
  number: 4321,
  series: 1,
  issuedAt: new Date('2026-08-15T12:30:00Z'),
  totalAmount: 255,
  duplicatas: [],
  purchase: null,
  items: [
    {
      id: 'item-1',
      itemNumber: 1,
      supplierCode: '007',
      description: 'REFRIG LATA 350',
      quantity: 10,
      unitPrice: 25.5,
      totalAmount: 255,
      productId: 'prod-1',
      match: NfeImportMatch.GTIN,
    },
  ],
  ...overrides,
});

describe('NfeImportService', () => {
  let service: NfeImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfeImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<NfeImportService>(NfeImportService);

    jest.clearAllMocks();
    mockStorage.isConfigured.mockReturnValue(false);
    mockPrisma.nfeImport.findFirst.mockResolvedValue(null);
    mockPrisma.establishment.findMany.mockResolvedValue([
      { id: 'estab-1', name: 'Matriz', cnpj: CNPJ_DESTINATARIO },
    ]);
    mockPrisma.partner.findMany.mockResolvedValue([
      { id: 'partner-1', cpfCnpj: CNPJ_EMITENTE },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.partnerProductCode.findMany.mockResolvedValue([]);
    mockPrisma.nfeImport.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...importacao(), ...data }),
    );
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
    );
  });

  describe('importXml', () => {
    it('registra a importação com o que leu do XML', async () => {
      await service.importXml('company-1', xml(), 'user-1');

      const [{ data }] = mockPrisma.nfeImport.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(data.chaveAcesso).toBe(CHAVE);
      expect(data.issuerCnpj).toBe(CNPJ_EMITENTE);
      expect(data.number).toBe(4321);
      expect(data.totalAmount).toBe(255);
    });

    it('casa o item pelo GTIN quando o produto tem o código de barras', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', barcode: '7891234567895' },
      ]);

      await service.importXml('company-1', xml());

      const [{ data }] = mockPrisma.nfeImport.create.mock.calls[0] as [
        { data: { status: string; items: { create: { match: string }[] } } },
      ];
      expect(data.items.create[0].match).toBe(NfeImportMatch.GTIN);
      expect(data.status).toBe(NfeImportStatus.READY);
    });

    it('casa pelo código memorizado daquele fornecedor', async () => {
      mockPrisma.partnerProductCode.findMany.mockResolvedValue([
        { code: '007', productId: 'prod-9' },
      ]);

      await service.importXml('company-1', xml({ cEAN: 'SEM GTIN' }));

      const [{ data }] = mockPrisma.nfeImport.create.mock.calls[0] as [
        {
          data: { items: { create: { match: string; productId: string }[] } };
        },
      ];
      expect(data.items.create[0].match).toBe(NfeImportMatch.SUPPLIER_CODE);
      expect(data.items.create[0].productId).toBe('prod-9');
    });

    it('procura o de-para só do fornecedor da nota', async () => {
      // O mesmo `cProd` "007" em fornecedores diferentes é produto diferente.
      // Se a consulta não filtrasse por parceiro, a nota de um fornecedor
      // casaria item com o produto de outro — e ninguém desconfiaria.
      await service.importXml('company-1', xml());

      const [argumento] = mockPrisma.partnerProductCode.findMany.mock
        .calls[0] as [{ where: { partnerId: string; companyId: string } }];
      expect(argumento.where.partnerId).toBe('partner-1');
      expect(argumento.where.companyId).toBe('company-1');
    });

    it('ignora de-para de outro fornecedor com o mesmo código', async () => {
      // O repositório devolve vazio porque o filtro é por parceiro; o item de
      // "007" fica pendente em vez de casar com o produto do outro fornecedor.
      mockPrisma.partnerProductCode.findMany.mockResolvedValue([]);

      await service.importXml('company-1', xml({ cEAN: 'SEM GTIN' }));

      const [{ data }] = mockPrisma.nfeImport.create.mock.calls[0] as [
        {
          data: {
            status: string;
            items: { create: { match: string; productId: string | null }[] };
          };
        },
      ];
      expect(data.items.create[0].match).toBe(NfeImportMatch.UNMATCHED);
      expect(data.items.create[0].productId).toBeNull();
      expect(data.status).toBe(NfeImportStatus.PENDING);
    });

    it('item sem casar deixa a importação pendente', async () => {
      await service.importXml('company-1', xml({ cEAN: 'SEM GTIN' }));

      const [{ data }] = mockPrisma.nfeImport.create.mock.calls[0] as [
        { data: { status: string } },
      ];
      expect(data.status).toBe(NfeImportStatus.PENDING);
    });

    it('recusa a mesma chave duas vezes, nomeando a compra que já existe', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue({
        id: 'import-0',
        purchase: { purchaseNumber: 7 },
      });

      await expect(service.importXml('company-1', xml())).rejects.toThrow(
        /compra #7/,
      );
      expect(mockPrisma.nfeImport.create).not.toHaveBeenCalled();
    });

    it('recusa nota emitida para CNPJ de outra empresa', async () => {
      mockPrisma.establishment.findMany.mockResolvedValue([
        { id: 'estab-1', name: 'Matriz', cnpj: '99999999000199' },
      ]);

      await expect(service.importXml('company-1', xml())).rejects.toThrow(
        new RegExp(CNPJ_DESTINATARIO),
      );
    });

    it('cria o fornecedor quando o CNPJ do emitente é novo', async () => {
      mockPrisma.partner.findMany.mockResolvedValue([]);
      mockPrisma.partner.create.mockResolvedValue({
        id: 'partner-novo',
        cpfCnpj: CNPJ_EMITENTE,
      });

      await service.importXml('company-1', xml());

      const [{ data }] = mockPrisma.partner.create.mock.calls[0] as [
        { data: { cpfCnpj: string; name: string; city: string } },
      ];
      expect(data.cpfCnpj).toBe(CNPJ_EMITENTE);
      expect(data.name).toBe('Distribuidora Teste LTDA');
      expect(data.city).toBe('Montes Claros');
    });

    it('não duplica fornecedor já cadastrado', async () => {
      await service.importXml('company-1', xml());

      expect(mockPrisma.partner.create).not.toHaveBeenCalled();
    });

    it('storage indisponível não derruba a importação', async () => {
      mockStorage.isConfigured.mockReturnValue(true);
      mockStorage.upload.mockRejectedValue(new Error('bucket indisponível'));

      await service.importXml('company-1', xml());

      const [{ data }] = mockPrisma.nfeImport.create.mock.calls[0] as [
        { data: { xmlKey: string | null } },
      ];
      expect(data.xmlKey).toBeNull();
    });
  });

  describe('confirm', () => {
    beforeEach(() => {
      mockPrisma.purchase.aggregate.mockResolvedValue({
        _max: { purchaseNumber: 12 },
      });
      mockPrisma.purchase.create.mockResolvedValue({
        id: 'purchase-1',
        purchaseNumber: 13,
      });
    });

    it('cria a compra em RASCUNHO, sem tocar no estoque', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(importacao());

      await service.confirm('company-1', 'import-1');

      const [{ data }] = mockPrisma.purchase.create.mock.calls[0] as [
        { data: { status: string; purchaseNumber: number } },
      ];
      expect(data.status).toBe(PurchaseStatus.DRAFT);
      expect(data.purchaseNumber).toBe(13);
      // A importação não movimenta estoque nem gera títulos: quem faz isso é a
      // confirmação da compra, que é outro ato, de outra pessoa.
      expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
      expect(mockPrisma.financialEntry.create).not.toHaveBeenCalled();
      expect(mockPrisma.financialEntry.createMany).not.toHaveBeenCalled();
    });

    it('recusa com item pendente, nomeando o que falta', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(
        importacao({
          status: NfeImportStatus.PENDING,
          items: [
            {
              id: 'item-1',
              itemNumber: 1,
              description: 'REFRIG LATA 350',
              productId: null,
            },
          ],
        }),
      );

      await expect(service.confirm('company-1', 'import-1')).rejects.toThrow(
        /REFRIG LATA 350/,
      );
      expect(mockPrisma.purchase.create).not.toHaveBeenCalled();
    });

    it('recusa importação que já virou compra', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(
        importacao({
          status: NfeImportStatus.IMPORTED,
          purchase: { id: 'p-1', purchaseNumber: 9, status: 'DRAFT' },
        }),
      );

      await expect(service.confirm('company-1', 'import-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('duplicatas viram parcelas a prazo', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(
        importacao({
          duplicatas: [
            {
              numero: '001',
              vencimento: '2026-09-15T00:00:00.000Z',
              valor: 127.5,
            },
            {
              numero: '002',
              vencimento: '2026-10-15T00:00:00.000Z',
              valor: 127.5,
            },
          ],
        }),
      );

      await service.confirm('company-1', 'import-1');

      const [{ data }] = mockPrisma.purchase.create.mock.calls[0] as [
        {
          data: {
            paymentCondition: string;
            installments: number;
            intervalDays: number;
          };
        },
      ];
      expect(data.paymentCondition).toBe('A_PRAZO');
      expect(data.installments).toBe(2);
      expect(data.intervalDays).toBe(30);
    });

    it('nota sem duplicata vira compra à vista', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(importacao());

      await service.confirm('company-1', 'import-1');

      const [{ data }] = mockPrisma.purchase.create.mock.calls[0] as [
        { data: { paymentCondition: string } },
      ];
      expect(data.paymentCondition).toBe('A_VISTA');
    });
  });

  describe('setItemProduct', () => {
    beforeEach(() => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(
        importacao({
          status: NfeImportStatus.PENDING,
          items: [
            {
              id: 'item-1',
              itemNumber: 1,
              supplierCode: '007',
              description: 'REFRIG LATA 350',
              productId: null,
            },
          ],
        }),
      );
      mockPrisma.product.findFirst.mockResolvedValue({ id: 'prod-5' });
    });

    it('memoriza a escolha para as próximas notas do fornecedor', async () => {
      await service.setItemProduct('company-1', 'import-1', 'item-1', 'prod-5');

      const [argumento] = mockPrisma.partnerProductCode.upsert.mock
        .calls[0] as [
        {
          where: { partnerId_code: { partnerId: string; code: string } };
          create: { productId: string };
        },
      ];
      expect(argumento.where.partnerId_code).toEqual({
        partnerId: 'partner-1',
        code: '007',
      });
      expect(argumento.create.productId).toBe('prod-5');
    });

    it('item resolvido deixa a importação pronta', async () => {
      await service.setItemProduct('company-1', 'import-1', 'item-1', 'prod-5');

      const chamada = mockPrisma.nfeImport.update.mock.calls[0] as [
        { data: { status: string } },
      ];
      expect(chamada[0].data.status).toBe(NfeImportStatus.READY);
    });

    it('recusa produto de outra empresa', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.setItemProduct('company-1', 'import-1', 'item-1', 'prod-x'),
      ).rejects.toThrow(NotFoundException);
    });

    it('recusa mexer em importação que já virou compra', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(
        importacao({ status: NfeImportStatus.IMPORTED }),
      );

      await expect(
        service.setItemProduct('company-1', 'import-1', 'item-1', 'prod-5'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('não devolve importação de outra empresa', async () => {
      mockPrisma.nfeImport.findFirst.mockResolvedValue(null);

      await expect(service.findOne('company-1', 'import-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
