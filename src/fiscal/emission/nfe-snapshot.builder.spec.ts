import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, TaxRegimeCode } from '@prisma/client';
import {
  buildNfeSnapshot,
  CompanyForSnapshot,
  NATUREZA_OPERACAO_PADRAO_NFE,
  SaleForSnapshot,
} from './fiscal-snapshot.builder';

/**
 * O recorte da NF-e — operação interna, destinatário pessoa jurídica — é recusa
 * nomeada, não silêncio. E acontece **antes** de reservar numeração: o motor
 * recusaria de novo, mas aí o número já teria sido queimado.
 */

const empresa = (): CompanyForSnapshot =>
  ({
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
  }) as unknown as CompanyForSnapshot;

const produto = () => ({
  id: 'prod-1',
  name: 'Espeto de Picanha',
  sku: 'ESP-001',
  barcode: null,
  unit: 'UN',
  ncm: '16025000',
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
});

/** Cliente pessoa jurídica completo, contribuinte, na mesma UF do emitente. */
const cliente = (overrides: Record<string, unknown> = {}) => ({
  id: 'partner-1',
  name: 'Construtora Norte Mineira LTDA',
  personType: 'PJ',
  cpfCnpj: '11223344000186',
  rgIe: '0011223340012',
  indIeDest: 1,
  email: null,
  phone: '3832211000',
  cep: '39400001',
  street: 'Avenida Ovidio de Abreu',
  number: '1200',
  complement: null,
  neighborhood: 'Centro',
  city: 'Montes Claros',
  state: 'MG',
  ibgeCode: '3143302',
  ...overrides,
});

const venda = (overrides: Record<string, unknown> = {}): SaleForSnapshot =>
  ({
    id: 'sale-1',
    saleNumber: 1,
    subtotal: 100,
    discount: 0,
    totalAmount: 100,
    paymentMethod: PaymentMethod.DINHEIRO,
    saleDate: new Date('2026-08-13T12:00:00Z'),
    customer: cliente(),
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        quantity: 2,
        unitPrice: 50,
        total: 100,
        product: produto(),
      },
    ],
    payments: [{ method: PaymentMethod.DINHEIRO, amount: 100 }],
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
      cep: '39400-347',
      ibgeCode: '3143302',
    },
    ...overrides,
  }) as unknown as SaleForSnapshot;

const opcoes = { consumidorFinal: false };

/** Mensagem do BadRequest, para afirmar sobre o texto que o lojista vai ler. */
const recusa = (sale: SaleForSnapshot): string => {
  try {
    buildNfeSnapshot(empresa(), sale, opcoes);
  } catch (erro) {
    expect(erro).toBeInstanceOf(BadRequestException);
    return (erro as BadRequestException).message;
  }
  throw new Error('esperava recusa, mas o snapshot foi montado');
};

describe('buildNfeSnapshot — caminho feliz', () => {
  it('monta o snapshot no modelo NFE com o cabeçalho da operação', () => {
    const snapshot = buildNfeSnapshot(empresa(), venda(), opcoes);

    expect(snapshot.modelo).toBe('NFE');
    expect(snapshot.nfe).toEqual({
      naturezaOperacao: NATUREZA_OPERACAO_PADRAO_NFE,
      tipoOperacao: 1,
      finalidade: 1,
      consumidorFinal: false,
      presenca: 1,
      transporte: undefined,
      cobranca: undefined,
    });
  });

  it('leva o destinatário completo, com indicador de IE e inscrição', () => {
    const snapshot = buildNfeSnapshot(empresa(), venda(), opcoes);

    expect(snapshot.destinatarioNfe).toMatchObject({
      cpfCnpj: '11223344000186',
      nome: 'Construtora Norte Mineira LTDA',
      logradouro: 'Avenida Ovidio de Abreu',
      codigoMunicipio: '3143302',
      uf: 'MG',
      cep: '39400001',
      indicadorIe: 1,
      inscricaoEstadual: '0011223340012',
    });
  });

  it('reaproveita o quadro tributário do item sem alterá-lo', () => {
    const snapshot = buildNfeSnapshot(empresa(), venda(), opcoes);

    expect(snapshot.itens[0].imposto.icms).toMatchObject({
      situacao: '102',
      origem: 0,
    });
    expect(snapshot.totais).toMatchObject({ vProd: 100, vNF: 100 });
  });

  it('respeita a natureza da operação e o indicador de presença informados', () => {
    const snapshot = buildNfeSnapshot(empresa(), venda(), {
      consumidorFinal: true,
      naturezaOperacao: 'VENDA DE PRODUCAO DO ESTABELECIMENTO',
      presenca: 2,
    });

    expect(snapshot.nfe?.naturezaOperacao).toBe(
      'VENDA DE PRODUCAO DO ESTABELECIMENTO',
    );
    expect(snapshot.nfe?.consumidorFinal).toBe(true);
    expect(snapshot.nfe?.presenca).toBe(2);
  });
});

describe('buildNfeSnapshot — o recorte vira recusa nomeada', () => {
  it('recusa venda sem cliente identificado', () => {
    expect(recusa(venda({ customer: null }))).toContain(
      'a NF-e exige destinatário identificado',
    );
  });

  it('recusa cliente pessoa física apontando a NFC-e', () => {
    const mensagem = recusa(
      venda({
        customer: cliente({
          personType: 'PF',
          cpfCnpj: '11144477735',
          indIeDest: 9,
          rgIe: null,
        }),
      }),
    );

    expect(mensagem).toContain('não é pessoa jurídica');
    expect(mensagem).toContain('emita NFC-e');
  });

  it('recusa destinatário em outra UF, nomeando as duas', () => {
    const mensagem = recusa(
      venda({ customer: cliente({ state: 'SP', ibgeCode: '3550308' }) }),
    );

    expect(mensagem).toContain('interestadual');
    expect(mensagem).toContain('MG');
    expect(mensagem).toContain('SP');
  });
});

describe('buildNfeSnapshot — indicador de inscrição estadual', () => {
  it('recusa cliente sem indicador informado', () => {
    expect(recusa(venda({ customer: cliente({ indIeDest: null }) }))).toContain(
      'indicador de inscrição estadual',
    );
  });

  it('recusa contribuinte sem inscrição estadual', () => {
    expect(recusa(venda({ customer: cliente({ rgIe: null }) }))).toContain(
      'declarado como contribuinte',
    );
  });

  it.each([
    ['isento', 2],
    ['não contribuinte', 9],
  ])('aceita %s sem inscrição estadual', (_rotulo, indicador) => {
    const snapshot = buildNfeSnapshot(
      empresa(),
      venda({ customer: cliente({ indIeDest: indicador, rgIe: null }) }),
      opcoes,
    );

    expect(snapshot.destinatarioNfe?.indicadorIe).toBe(indicador);
    expect(snapshot.destinatarioNfe?.inscricaoEstadual).toBeUndefined();
  });

  it('não envia a inscrição de quem não é contribuinte, mesmo cadastrada', () => {
    const snapshot = buildNfeSnapshot(
      empresa(),
      venda({ customer: cliente({ indIeDest: 9, rgIe: '0011223340012' }) }),
      opcoes,
    );

    // O campo `rgIe` guarda RG ou IE conforme o tipo de pessoa. Mandá-lo para
    // um não contribuinte faria o motor recusar: a declaração e o dado se
    // contradiriam.
    expect(snapshot.destinatarioNfe?.inscricaoEstadual).toBeUndefined();
  });
});

describe('buildNfeSnapshot — endereço do destinatário', () => {
  it('recusa cliente sem código IBGE, que a NFC-e nunca exigiu', () => {
    expect(recusa(venda({ customer: cliente({ ibgeCode: null }) }))).toContain(
      'código IBGE',
    );
  });

  it('nomeia cada campo de endereço que falta, de uma vez', () => {
    const mensagem = recusa(
      venda({
        customer: cliente({
          street: null,
          number: null,
          neighborhood: null,
          cep: null,
        }),
      }),
    );

    expect(mensagem).toContain('logradouro e número');
    expect(mensagem).toContain('bairro');
    expect(mensagem).toContain('CEP');
  });
});
