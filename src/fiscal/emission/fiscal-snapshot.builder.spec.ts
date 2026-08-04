import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, TaxRegimeCode } from '@prisma/client';
import {
  buildFiscalSnapshot,
  CompanyForSnapshot,
  SaleForSnapshot,
} from './fiscal-snapshot.builder';
import { somar } from './fiscal-rules';

const empresa = (overrides: Record<string, unknown> = {}): CompanyForSnapshot =>
  ({
    id: 'company-1',
    name: 'Empresa Teste',
    razaoSocial: 'Empresa Teste Comércio de Bebidas LTDA',
    nomeFantasia: 'Empresa Teste',
    cnpj: '11222333000181',
    inscricaoEstadual: '123456789',
    crt: TaxRegimeCode.SIMPLES_NACIONAL,
    codigoIbgeMunicipio: '3550308',
    telefoneFiscal: '(11) 3333-4444',
    emailFiscal: 'fiscal@empresa.com.br',
    phone: null,
    ...overrides,
  }) as unknown as CompanyForSnapshot;

const produto = (overrides: Record<string, unknown> = {}) => ({
  id: 'prod-1',
  name: 'Refrigerante Lata 350ml',
  sku: 'REF350',
  barcode: '7891000100103',
  unit: 'UN',
  ncm: '22021000',
  cest: null,
  cfop: '5102',
  origin: 0,
  csosn: '102',
  cstIcms: null,
  ...overrides,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  productId: 'prod-1',
  quantity: 2,
  unitPrice: 5,
  total: 10,
  product: produto(),
  ...overrides,
});

const venda = (overrides: Record<string, unknown> = {}): SaleForSnapshot =>
  ({
    id: 'sale-1',
    saleNumber: 1001,
    subtotal: 10,
    discount: 0,
    totalAmount: 10,
    paymentMethod: PaymentMethod.DINHEIRO,
    saleDate: new Date('2026-08-04T12:00:00Z'),
    customer: null,
    items: [item()],
    payments: [{ method: PaymentMethod.DINHEIRO, amount: 10 }],
    establishment: {
      id: 'estab-1',
      name: 'Matriz',
      cnpj: '11222333000181',
      inscricaoEstadual: '123456789',
      street: 'Rua das Flores',
      number: '100',
      complement: 'Loja 2',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      cep: '01001-000',
      ibgeCode: '3550308',
    },
    ...overrides,
  }) as unknown as SaleForSnapshot;

describe('buildFiscalSnapshot', () => {
  it('monta emitente, itens e pagamentos no formato do motor', () => {
    const snapshot = buildFiscalSnapshot(empresa(), venda());

    expect(snapshot.versao).toBe(1);
    expect(snapshot.emitente).toMatchObject({
      cnpj: '11222333000181',
      crt: '1',
      codigoMunicipio: '3550308',
      cep: '01001000',
      uf: 'SP',
      logradouro: 'Rua das Flores',
      telefone: '1133334444',
    });
    expect(snapshot.itens).toEqual([
      {
        numeroItem: 1,
        codigoProduto: 'REF350',
        descricao: 'Refrigerante Lata 350ml',
        ncm: '22021000',
        cest: undefined,
        cfop: '5102',
        unidadeComercial: 'UN',
        quantidade: 2,
        valorUnitario: 5,
        gtin: '7891000100103',
        origem: 0,
        csosn: '102',
      },
    ]);
    expect(snapshot.pagamentos).toEqual([{ tipo: 'dinheiro', valor: 10 }]);
    expect(snapshot.valorTotal).toBe(10);
  });

  it('omite o destinatário sem cliente e preenche quando há', () => {
    expect(
      buildFiscalSnapshot(empresa(), venda()).destinatario,
    ).toBeUndefined();

    const comCliente = buildFiscalSnapshot(
      empresa(),
      venda({
        customer: {
          id: 'p1',
          name: 'João da Silva',
          cpfCnpj: '529.982.247-25',
        },
      }),
    );

    expect(comCliente.destinatario).toEqual({
      cpfCnpj: '52998224725',
      nome: 'João da Silva',
    });
  });

  it('usa CST de ICMS quando o emitente é do regime normal', () => {
    const snapshot = buildFiscalSnapshot(
      empresa({ crt: TaxRegimeCode.REGIME_NORMAL }),
      venda({
        items: [item({ product: produto({ csosn: null, cstIcms: '40' }) })],
      }),
    );

    expect(snapshot.emitente.crt).toBe('3');
    expect(snapshot.itens[0].csosn).toBe('40');
  });

  describe('rateio do desconto', () => {
    it('distribui o desconto no valor unitário mantendo o total da venda', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          subtotal: 30,
          discount: 5,
          totalAmount: 25,
          items: [item({ quantity: 3, unitPrice: 10, total: 30 })],
          payments: [{ method: PaymentMethod.PIX, amount: 25 }],
        }),
      );

      expect(snapshot.valorTotal).toBe(25);
      expect(snapshot.venda.desconto).toBe(5);
      expect(
        somar(snapshot.pagamentos.map((pagamento) => pagamento.valor)),
      ).toBe(25);
    });

    it('fecha o centavo residual entre vários itens', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          subtotal: 30,
          discount: 10,
          totalAmount: 20,
          items: [
            item({ id: 'i1', quantity: 3, unitPrice: 3.33, total: 9.99 }),
            item({ id: 'i2', quantity: 3, unitPrice: 3.34, total: 10.02 }),
            item({ id: 'i3', quantity: 3, unitPrice: 3.33, total: 9.99 }),
          ],
          payments: [{ method: PaymentMethod.DINHEIRO, amount: 20 }],
        }),
      );

      const totalItens = somar(
        snapshot.itens.map((linha) => linha.quantidade * linha.valorUnitario),
      );

      expect(snapshot.itens).toHaveLength(3);
      expect(Math.abs(totalItens - 20)).toBeLessThanOrEqual(0.01);
      expect(snapshot.valorTotal).toBeCloseTo(20, 2);
    });

    it('não altera os valores quando não há desconto', () => {
      const snapshot = buildFiscalSnapshot(empresa(), venda());

      expect(snapshot.itens[0].valorUnitario).toBe(5);
      expect(snapshot.venda.desconto).toBe(0);
    });
  });

  describe('pagamentos', () => {
    it('traduz cada forma de pagamento para o tipo textual do motor', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          payments: [
            { method: PaymentMethod.PIX, amount: 4 },
            { method: PaymentMethod.CARTAO_CREDITO, amount: 3 },
            { method: PaymentMethod.CARTAO_DEBITO, amount: 2 },
            { method: PaymentMethod.BOLETO, amount: 1 },
          ],
        }),
      );

      expect(snapshot.pagamentos).toEqual([
        { tipo: 'pix', valor: 4 },
        { tipo: 'cartao_credito', valor: 3 },
        { tipo: 'cartao_debito', valor: 2 },
        { tipo: 'boleto', valor: 1 },
      ]);
    });

    it('usa a forma de pagamento da venda quando não há baixas registradas', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({ payments: [], paymentMethod: PaymentMethod.BOLETO }),
      );

      expect(snapshot.pagamentos).toEqual([{ tipo: 'boleto', valor: 10 }]);
    });

    it('recusa quando a soma dos pagamentos diverge do total', () => {
      expect(() =>
        buildFiscalSnapshot(
          empresa(),
          venda({ payments: [{ method: PaymentMethod.PIX, amount: 7 }] }),
        ),
      ).toThrow(/soma dos pagamentos diverge/);
    });
  });

  describe('recebimento e troco', () => {
    it('não registra recebimento quando a venda não informa valor recebido', () => {
      expect(buildFiscalSnapshot(empresa(), venda()).recebimento).toBeUndefined();
    });

    it('usa o troco registrado pelo caixa', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          payments: [
            {
              method: PaymentMethod.DINHEIRO,
              amount: 10,
              amountReceived: 20,
              changeGiven: 10,
            },
          ],
        }),
      );

      expect(snapshot.recebimento).toEqual({ valorRecebido: 20, troco: 10 });
    });

    it('deriva o troco do valor recebido quando o caixa não registrou', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          payments: [
            { method: PaymentMethod.DINHEIRO, amount: 10, amountReceived: 15 },
          ],
        }),
      );

      expect(snapshot.recebimento).toEqual({ valorRecebido: 15, troco: 5 });
    });

    it('ignora as formas sem recebimento no pagamento dividido', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          payments: [
            { method: PaymentMethod.PIX, amount: 6 },
            {
              method: PaymentMethod.DINHEIRO,
              amount: 4,
              amountReceived: 10,
              changeGiven: 6,
            },
          ],
        }),
      );

      expect(snapshot.recebimento).toEqual({ valorRecebido: 10, troco: 6 });
    });

    it('não envia o troco ao motor — os pagamentos seguem só com tipo e valor', () => {
      const snapshot = buildFiscalSnapshot(
        empresa(),
        venda({
          payments: [
            {
              method: PaymentMethod.DINHEIRO,
              amount: 10,
              amountReceived: 20,
              changeGiven: 10,
            },
          ],
        }),
      );

      expect(snapshot.pagamentos).toEqual([{ tipo: 'dinheiro', valor: 10 }]);
    });
  });

  describe('pré-condições', () => {
    it('exige o CRT da empresa', () => {
      expect(() =>
        buildFiscalSnapshot(empresa({ crt: null }), venda()),
      ).toThrow(/CRT/);
    });

    it('recusa NCM, CFOP e origem inválidos de uma vez só', () => {
      let mensagem = '';
      try {
        buildFiscalSnapshot(
          empresa(),
          venda({
            items: [
              item({
                product: produto({ ncm: '123', cfop: '1102', origin: null }),
              }),
            ],
          }),
        );
      } catch (error) {
        mensagem = error instanceof Error ? error.message : '';
      }

      expect(mensagem).toContain('NCM deve ter 8 dígitos');
      expect(mensagem).toContain('CFOP deve ter 4 dígitos e começar com 5');
      expect(mensagem).toContain('origem da mercadoria');
    });

    it('recusa CSOSN fora do conjunto suportado pelo motor', () => {
      expect(() =>
        buildFiscalSnapshot(
          empresa(),
          venda({ items: [item({ product: produto({ csosn: '101' }) })] }),
        ),
      ).toThrow(/CSOSN não suportado/);
    });

    it('recusa endereço incompleto do emitente', () => {
      expect(() =>
        buildFiscalSnapshot(
          empresa(),
          venda({
            establishment: {
              id: 'estab-1',
              name: 'Matriz',
              cnpj: '11222333000181',
              inscricaoEstadual: '123456789',
              street: null,
              number: null,
              neighborhood: null,
              city: null,
              state: null,
              cep: null,
              ibgeCode: null,
            },
          }),
        ),
      ).toThrow(BadRequestException);
    });

    it('recusa venda sem itens', () => {
      expect(() =>
        buildFiscalSnapshot(empresa(), venda({ items: [] })),
      ).toThrow(/não tem itens/);
    });
  });
});
