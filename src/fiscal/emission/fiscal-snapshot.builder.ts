import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, Prisma, TaxRegimeCode } from '@prisma/client';
import {
  NfceDestinatario,
  NfceEmitente,
  NfceItem,
  NfcePagamento,
} from '../fiscal-engine/fiscal-engine.interface';
import {
  apenasDigitos,
  arredondar,
  isCepValido,
  isCestValido,
  isCfopValido,
  isCodigoIbgeValido,
  isNcmValido,
  isOrigemValida,
  mapCrt,
  mapFormaPagamento,
  normalizarGtin,
  situacaoTributaria,
  somar,
  TOLERANCIA_MONETARIA,
  usaCsosn,
} from './fiscal-rules';

/**
 * Retrato imutável da venda no formato que o motor fiscal consome.
 *
 * O snapshot é montado uma única vez, na criação do `FiscalDocument`, e é o
 * que vale dali em diante: alterar cadastro de produto, empresa ou cliente
 * depois não muda nota já emitida.
 */
export interface FiscalSnapshot {
  versao: 1;
  venda: {
    id: string;
    numero: number;
    subtotal: number;
    desconto: number;
    total: number;
    data: string;
  };
  emitente: NfceEmitente;
  destinatario?: NfceDestinatario;
  itens: NfceItem[];
  pagamentos: NfcePagamento[];
  /** Σ dos itens já com o desconto rateado */
  valorTotal: number;
}

/** Recorte da venda necessário para montar o snapshot. */
export type SaleForSnapshot = Prisma.SaleGetPayload<{
  include: {
    items: { include: { product: true } };
    payments: true;
    customer: true;
    establishment: true;
  };
}>;

export type CompanyForSnapshot = Prisma.CompanyGetPayload<null>;

/**
 * Monta o snapshot fiscal da venda, aplicando as mesmas regras do motor.
 *
 * Falha com todos os problemas de uma vez (400) em vez de queimar um número
 * de nota para descobrir a rejeição depois.
 */
export function buildFiscalSnapshot(
  company: CompanyForSnapshot,
  sale: SaleForSnapshot,
): FiscalSnapshot {
  const problemas: string[] = [];

  const crt = resolverCrt(company, problemas);
  const emitente = montarEmitente(company, sale, crt, problemas);
  const { itens, valorTotal, subtotal, desconto } = montarItens(
    sale,
    crt,
    problemas,
  );
  const pagamentos = montarPagamentos(sale, valorTotal, problemas);

  if (problemas.length > 0) {
    throw new BadRequestException(
      `Não é possível emitir a NFC-e: ${problemas.join('; ')}`,
    );
  }

  return {
    versao: 1,
    venda: {
      id: sale.id,
      numero: sale.saleNumber,
      subtotal,
      desconto,
      total: arredondar(Number(sale.totalAmount)),
      data: sale.saleDate.toISOString(),
    },
    emitente,
    destinatario: montarDestinatario(sale),
    itens,
    pagamentos,
    valorTotal,
  };
}

// ──────────────────────────────────────────────
// Emitente
// ──────────────────────────────────────────────

function resolverCrt(
  company: CompanyForSnapshot,
  problemas: string[],
): ReturnType<typeof mapCrt> {
  if (!company.crt) {
    problemas.push('informe o CRT (regime tributário) da empresa');
    return mapCrt(TaxRegimeCode.SIMPLES_NACIONAL);
  }
  return mapCrt(company.crt);
}

function montarEmitente(
  company: CompanyForSnapshot,
  sale: SaleForSnapshot,
  crt: ReturnType<typeof mapCrt>,
  problemas: string[],
): NfceEmitente {
  const establishment = sale.establishment;

  const cnpj = apenasDigitos(establishment.cnpj ?? company.cnpj);
  const inscricaoEstadual = apenasDigitos(
    establishment.inscricaoEstadual ?? company.inscricaoEstadual,
  );
  const codigoMunicipio = apenasDigitos(
    establishment.ibgeCode ?? company.codigoIbgeMunicipio,
  );
  const cep = apenasDigitos(establishment.cep);
  const uf = (establishment.state ?? '').trim().toUpperCase();

  if (cnpj.length !== 14) {
    problemas.push('CNPJ do estabelecimento emitente inválido');
  }
  if (!inscricaoEstadual) {
    problemas.push('informe a inscrição estadual do emitente');
  }
  if (!isCodigoIbgeValido(codigoMunicipio)) {
    problemas.push(
      'informe o código IBGE (7 dígitos) do município do emitente',
    );
  }
  if (!isCepValido(cep)) {
    problemas.push('informe o CEP do estabelecimento emitente');
  }
  if (uf.length !== 2) {
    problemas.push('informe a UF do estabelecimento emitente');
  }
  if (!establishment.street || !establishment.number) {
    problemas.push('informe logradouro e número do estabelecimento emitente');
  }
  if (!establishment.neighborhood) {
    problemas.push('informe o bairro do estabelecimento emitente');
  }
  if (!establishment.city) {
    problemas.push('informe o município do estabelecimento emitente');
  }

  return {
    cnpj,
    razaoSocial: limitar(company.razaoSocial ?? company.name, 60),
    nomeFantasia: company.nomeFantasia ?? establishment.name,
    inscricaoEstadual: limitar(inscricaoEstadual, 14),
    crt,
    logradouro: establishment.street ?? '',
    numero: establishment.number ?? '',
    complemento: establishment.complement ?? undefined,
    bairro: establishment.neighborhood ?? '',
    codigoMunicipio,
    municipio: establishment.city ?? '',
    uf,
    cep,
    telefone:
      apenasDigitos(company.telefoneFiscal ?? company.phone) || undefined,
    email: company.emailFiscal ?? undefined,
  };
}

/** Consumidor não identificado: o bloco inteiro é omitido. */
function montarDestinatario(
  sale: SaleForSnapshot,
): NfceDestinatario | undefined {
  if (!sale.customer) return undefined;

  const cpfCnpj = apenasDigitos(sale.customer.cpfCnpj);

  return {
    cpfCnpj:
      cpfCnpj.length === 11 || cpfCnpj.length === 14 ? cpfCnpj : undefined,
    nome: sale.customer.name,
  };
}

// ──────────────────────────────────────────────
// Itens e rateio do desconto
// ──────────────────────────────────────────────

function montarItens(
  sale: SaleForSnapshot,
  crt: ReturnType<typeof mapCrt>,
  problemas: string[],
): {
  itens: NfceItem[];
  valorTotal: number;
  subtotal: number;
  desconto: number;
} {
  if (sale.items.length === 0) {
    problemas.push('a venda não tem itens');
    return { itens: [], valorTotal: 0, subtotal: 0, desconto: 0 };
  }

  const totaisBrutos = sale.items.map((item) => arredondar(Number(item.total)));
  const subtotal = somar(totaisBrutos);
  const total = arredondar(Number(sale.totalAmount));
  const desconto = arredondar(subtotal - total);

  const totaisLiquidos = ratear(totaisBrutos, subtotal, total);

  const itens = sale.items.map((item, indice) => {
    const produto = item.product;
    const quantidade = Number(item.quantity);
    const posicao = indice + 1;

    if (!isNcmValido(produto.ncm)) {
      problemas.push(
        `item ${posicao} (${produto.name}): NCM deve ter 8 dígitos`,
      );
    }
    if (!isCestValido(produto.cest)) {
      problemas.push(
        `item ${posicao} (${produto.name}): CEST deve ter 7 dígitos`,
      );
    }
    if (!isCfopValido(produto.cfop)) {
      problemas.push(
        `item ${posicao} (${produto.name}): CFOP deve ter 4 dígitos e começar com 5`,
      );
    }
    if (!isOrigemValida(produto.origin)) {
      problemas.push(
        `item ${posicao} (${produto.name}): informe a origem da mercadoria (0 a 8)`,
      );
    }
    if (quantidade <= 0) {
      problemas.push(
        `item ${posicao} (${produto.name}): quantidade deve ser maior que zero`,
      );
    }

    const situacao = situacaoTributaria(crt, produto.csosn, produto.cstIcms);
    if (!situacao) {
      problemas.push(
        usaCsosn(crt)
          ? `item ${posicao} (${produto.name}): CSOSN não suportado — use 102, 103, 300, 400 ou 500`
          : `item ${posicao} (${produto.name}): CST de ICMS não suportado — use 40, 41 ou 50`,
      );
    }

    const valorUnitario =
      quantidade > 0 ? arredondar(totaisLiquidos[indice] / quantidade, 6) : 0;

    if (valorUnitario <= 0) {
      problemas.push(
        `item ${posicao} (${produto.name}): valor unitário deve ser maior que zero`,
      );
    }

    return {
      numeroItem: posicao,
      codigoProduto: limitar(produto.sku ?? produto.id, 60),
      descricao: limitar(produto.name, 120),
      ncm: apenasDigitos(produto.ncm),
      cest: produto.cest ? apenasDigitos(produto.cest) : undefined,
      cfop: apenasDigitos(produto.cfop),
      unidadeComercial: limitar(produto.unit, 6),
      quantidade,
      valorUnitario,
      gtin: normalizarGtin(produto.barcode),
      origem: produto.origin ?? 0,
      csosn: situacao ?? '',
    } satisfies NfceItem;
  });

  // O motor recalcula o valor do item como quantidade × valor unitário:
  // o total enviado precisa fechar pela mesma conta.
  const valorTotal = somar(
    itens.map((item) => arredondar(item.quantidade * item.valorUnitario)),
  );

  if (Math.abs(valorTotal - total) > TOLERANCIA_MONETARIA) {
    problemas.push(
      `divergência entre o total dos itens (${valorTotal.toFixed(2)}) e o total da venda (${total.toFixed(2)})`,
    );
  }

  return { itens, valorTotal, subtotal, desconto };
}

/**
 * Rateia o desconto da venda proporcionalmente entre os itens.
 *
 * O motor não tem campo de desconto: o abatimento entra no valor unitário. A
 * sobra de arredondamento cai no último item para o somatório fechar exato.
 */
function ratear(
  totaisBrutos: number[],
  subtotal: number,
  total: number,
): number[] {
  if (subtotal <= 0 || Math.abs(subtotal - total) <= TOLERANCIA_MONETARIA) {
    return totaisBrutos;
  }

  const liquidos = totaisBrutos.map((bruto) =>
    arredondar((bruto * total) / subtotal),
  );

  const ultimo = liquidos.length - 1;
  liquidos[ultimo] = arredondar(liquidos[ultimo] + (total - somar(liquidos)));

  return liquidos;
}

// ──────────────────────────────────────────────
// Pagamentos
// ──────────────────────────────────────────────

function montarPagamentos(
  sale: SaleForSnapshot,
  valorTotal: number,
  problemas: string[],
): NfcePagamento[] {
  const pagamentos: NfcePagamento[] =
    sale.payments.length > 0
      ? sale.payments.map((pagamento) => ({
          tipo: mapFormaPagamento(pagamento.method),
          valor: arredondar(Number(pagamento.amount)),
        }))
      : [
          {
            tipo: mapFormaPagamento(sale.paymentMethod ?? PaymentMethod.OUTRO),
            valor: valorTotal,
          },
        ];

  const diferenca = arredondar(
    valorTotal - somar(pagamentos.map((pagamento) => pagamento.valor)),
  );

  if (Math.abs(diferenca) > TOLERANCIA_MONETARIA) {
    problemas.push(
      `soma dos pagamentos diverge do total dos itens em ${Math.abs(diferenca).toFixed(2)}`,
    );
    return pagamentos;
  }

  // Fecha o centavo de arredondamento no último pagamento.
  if (diferenca !== 0) {
    const ultimo = pagamentos.length - 1;
    pagamentos[ultimo] = {
      ...pagamentos[ultimo],
      valor: arredondar(pagamentos[ultimo].valor + diferenca),
    };
  }

  return pagamentos;
}

function limitar(valor: string, tamanho: number): string {
  return valor.trim().slice(0, tamanho);
}
