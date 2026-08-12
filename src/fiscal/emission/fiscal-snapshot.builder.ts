import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, Prisma, TaxRegimeCode } from '@prisma/client';
import {
  NfceCofins,
  NfceDestinatario,
  NfceEmitente,
  NfceIcms,
  NfceItem,
  NfceItemImposto,
  NfcePagamento,
  NfcePis,
} from '../fiscal-engine/fiscal-engine.interface';
import {
  apenasDigitos,
  arredondar,
  camposExigidosIcms,
  formaDaContribuicao,
  isCepValido,
  isCestValido,
  isCfopValido,
  isCodigoIbgeValido,
  isCpfCnpjValido,
  isInscricaoEstadualValida,
  isNcmValido,
  isOrigemValida,
  isUfValida,
  mapCrt,
  mapFormaPagamento,
  normalizarGtin,
  somar,
  TOLERANCIA_MONETARIA,
  usaCsosn,
  validarQuadroTributario,
} from './fiscal-rules';
import {
  ContextoFiscal,
  IRegraFiscal,
  QuadroResolvido,
} from '../rules/fiscal-rules.port';
import { ProductFallbackRule } from '../rules/product-fallback-rule.service';

/**
 * Retrato imutável da venda no formato que o motor fiscal consome.
 *
 * O snapshot é montado uma única vez, na criação do `FiscalDocument`, e é o
 * que vale dali em diante: alterar cadastro de produto, empresa ou cliente
 * depois não muda nota já emitida.
 */
/**
 * Versões do snapshot.
 *
 * - **1** — item sem quadro tributário. Formato da Fase A; ainda é **lido**
 *   para consulta e exibição de documento antigo, mas **não emite**: o motor
 *   passou a exigir o bloco `imposto` e não tem mais o caminho antigo.
 * - **2** — item com quadro tributário e totais fiscais. Todo documento novo
 *   nasce aqui.
 */
export type FiscalSnapshotVersao = 1 | 2;

/** Versão gravada em todo documento criado a partir desta change. */
export const VERSAO_SNAPSHOT_ATUAL = 2 satisfies FiscalSnapshotVersao;

/**
 * Totais fiscais da nota, somados dos itens.
 *
 * Não vão no payload do motor: o contrato de `POST /api/nfce/emit` só tem
 * `valorTotal`, e o próprio motor compõe o grupo `<total>` do XML a partir dos
 * itens. Ficam no snapshot para auditoria e para a conferência local — e
 * porque a NF-e da etapa 3 vai precisar deles.
 */
export interface FiscalTotais {
  /** Σ do valor dos produtos */
  vProd: number;
  /** Σ da base de cálculo do ICMS */
  vBC: number;
  /** Σ do ICMS próprio */
  vICMS: number;
  /** Σ do ICMS por substituição tributária */
  vST: number;
  vPIS: number;
  vCOFINS: number;
  /** Valor total da nota */
  vNF: number;
}

export interface FiscalSnapshot {
  versao: FiscalSnapshotVersao;
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
  /**
   * Totais fiscais somados dos itens. Ausente nos snapshots versão 1, que
   * nasceram antes de o item carregar imposto.
   */
  totais?: FiscalTotais;
  /**
   * Qual regra determinou o quadro tributário de cada item, por `numeroItem`.
   *
   * Fica fora de `itens` porque `NfceItem` é o contrato do motor e ele não tem
   * esse campo. Quando uma nota sair com imposto errado, a primeira pergunta vai
   * ser "por que saiu assim" — e isto é a resposta.
   */
  regrasAplicadas?: Record<number, string>;
  /**
   * Valor recebido e troco do pagamento em dinheiro.
   *
   * Fica no snapshot só para auditoria e reimpressão: o contrato do motor não
   * tem grupo de troco (`vTroco`), então isto **não** é enviado na emissão.
   */
  recebimento?: FiscalRecebimento;
}

/** Dinheiro entregue pelo consumidor e troco devolvido. */
export interface FiscalRecebimento {
  valorRecebido: number;
  troco: number;
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
export async function buildFiscalSnapshot(
  company: CompanyForSnapshot,
  sale: SaleForSnapshot,
  // O padrão responde com o cadastro do produto — o comportamento anterior à
  // etapa 2. Quem tiver uma implementação de regra fiscal a injeta aqui.
  regraFiscal: IRegraFiscal = new ProductFallbackRule(),
): Promise<FiscalSnapshot> {
  const problemas: string[] = [];

  const crt = resolverCrt(company, problemas);
  const emitente = montarEmitente(company, sale, crt, problemas);
  const { itens, valorTotal, subtotal, desconto, regrasAplicadas } =
    await montarItens(sale, company, crt, regraFiscal, problemas);
  const pagamentos = montarPagamentos(sale, valorTotal, problemas);

  if (problemas.length > 0) {
    throw new BadRequestException(
      `Não é possível emitir a NFC-e: ${problemas.join('; ')}`,
    );
  }

  return {
    versao: VERSAO_SNAPSHOT_ATUAL,
    venda: {
      id: sale.id,
      numero: sale.saleNumber,
      subtotal,
      desconto,
      total: arredondar(Number(sale.totalAmount)),
      data: sale.saleDate.toISOString(),
    },
    emitente,
    destinatario: montarDestinatario(sale, problemas),
    itens,
    pagamentos,
    valorTotal,
    totais: montarTotais(itens, valorTotal),
    regrasAplicadas,
    recebimento: montarRecebimento(sale),
  };
}

/**
 * Totais fiscais como soma dos itens — nunca número solto.
 *
 * Somar aqui é o que permite `conferirSomatorios` recusar a emissão quando o
 * total e os itens divergem, em vez de a SEFAZ recusar depois.
 */
function montarTotais(itens: NfceItem[], valorTotal: number): FiscalTotais {
  const somarPorItem = (extrair: (item: NfceItem) => number | undefined) =>
    somar(itens.map((item) => extrair(item) ?? 0));

  return {
    vProd: somar(
      itens.map((item) => arredondar(item.quantidade * item.valorUnitario)),
    ),
    vBC: somarPorItem((item) => item.imposto.icms.vBC),
    vICMS: somarPorItem((item) => item.imposto.icms.vICMS),
    vST: somarPorItem((item) => item.imposto.icms.vICMSST),
    vPIS: somarPorItem((item) => item.imposto.pis.vPIS),
    vCOFINS: somarPorItem((item) => item.imposto.cofins.vCOFINS),
    vNF: valorTotal,
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

  if (!isCpfCnpjValido(cnpj) || cnpj.length !== 14) {
    problemas.push('CNPJ do estabelecimento emitente inválido');
  }
  if (!isInscricaoEstadualValida(inscricaoEstadual)) {
    problemas.push('informe a inscrição estadual do emitente (2 a 14 dígitos)');
  }
  if (!isCodigoIbgeValido(codigoMunicipio)) {
    problemas.push(
      'informe o código IBGE (7 dígitos) do município do emitente',
    );
  }
  if (!isCepValido(cep)) {
    problemas.push('informe o CEP do estabelecimento emitente');
  }
  if (!isUfValida(uf)) {
    problemas.push('informe uma UF válida no estabelecimento emitente');
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

/**
 * Consumidor não identificado: o bloco inteiro é omitido.
 *
 * Com cliente na venda, um CPF/CNPJ inválido para a emissão em vez de virar
 * nota anônima — quem pediu o documento na nota espera vê-lo lá, e a SEFAZ
 * rejeitaria a nota inteira depois de consumir a numeração.
 */
function montarDestinatario(
  sale: SaleForSnapshot,
  problemas: string[],
): NfceDestinatario | undefined {
  if (!sale.customer) return undefined;

  const cpfCnpj = apenasDigitos(sale.customer.cpfCnpj);

  if (cpfCnpj && !isCpfCnpjValido(cpfCnpj)) {
    problemas.push('CPF/CNPJ do cliente da venda é inválido');
  }

  return {
    cpfCnpj: isCpfCnpjValido(cpfCnpj) ? cpfCnpj : undefined,
    nome: sale.customer.name,
  };
}

// ──────────────────────────────────────────────
// Itens e rateio do desconto
// ──────────────────────────────────────────────

async function montarItens(
  sale: SaleForSnapshot,
  company: CompanyForSnapshot,
  crt: ReturnType<typeof mapCrt>,
  regraFiscal: IRegraFiscal,
  problemas: string[],
): Promise<{
  itens: NfceItem[];
  valorTotal: number;
  subtotal: number;
  desconto: number;
  regrasAplicadas: Record<number, string>;
}> {
  if (sale.items.length === 0) {
    problemas.push('a venda não tem itens');
    return {
      itens: [],
      valorTotal: 0,
      subtotal: 0,
      desconto: 0,
      regrasAplicadas: {},
    };
  }

  const totaisBrutos = sale.items.map((item) => arredondar(Number(item.total)));
  const subtotal = somar(totaisBrutos);
  const total = arredondar(Number(sale.totalAmount));
  const desconto = arredondar(subtotal - total);

  const totaisLiquidos = ratear(totaisBrutos, subtotal, total);

  const regrasAplicadas: Record<number, string> = {};
  const itens: NfceItem[] = [];

  // Sequencial, não `Promise.all`: os problemas são acumulados numa lista só e
  // a ordem das mensagens é a ordem dos itens da venda.
  for (const [indice, item] of sale.items.entries()) {
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

    // A resposta fiscal vem da porta, não do cadastro: é ela que sabe o que
    // vale para esta operação. Sem regra cadastrada, ela devolve o cadastro do
    // produto — e o resultado é idêntico ao de antes da etapa 2.
    const quadro = await regraFiscal.resolver(
      montarContextoFiscal(produto, company, sale, crt),
    );
    regrasAplicadas[posicao] = quadro.regraAplicada;

    const situacao = quadro.situacaoIcms;
    if (!situacao) {
      problemas.push(
        usaCsosn(crt)
          ? `item ${posicao} (${produto.name}): CSOSN não suportado — use 102, 103, 300, 400 ou 500`
          : `item ${posicao} (${produto.name}): CST de ICMS não suportado — use 40, 41 ou 50`,
      );
    }

    if (!isCfopValido(quadro.cfop)) {
      problemas.push(
        `item ${posicao} (${produto.name}): CFOP deve ter 4 dígitos e começar com 5`,
      );
    }

    const valorUnitario =
      quantidade > 0 ? arredondar(totaisLiquidos[indice] / quantidade, 6) : 0;

    if (valorUnitario <= 0) {
      problemas.push(
        `item ${posicao} (${produto.name}): valor unitário deve ser maior que zero`,
      );
    }

    const rotulo = `item ${posicao} (${produto.name})`;
    const problemasAntes = problemas.length;
    const imposto = montarImposto(
      produto,
      quadro,
      totaisLiquidos[indice],
      quantidade,
      rotulo,
      problemas,
    );

    // A conferência final só roda quando a montagem não achou nada: se ela já
    // explicou por que o quadro está incompleto, revalidar só repetiria a
    // mesma queixa com outras palavras.
    if (problemas.length === problemasAntes) {
      problemas.push(...validarQuadroTributario(imposto, rotulo));
    }

    itens.push({
      numeroItem: posicao,
      codigoProduto: limitar(produto.sku ?? produto.id, 60),
      descricao: limitar(produto.name, 120),
      ncm: apenasDigitos(produto.ncm),
      cest: produto.cest ? apenasDigitos(produto.cest) : undefined,
      cfop: apenasDigitos(quadro.cfop),
      unidadeComercial: limitar(produto.unit, 6),
      quantidade,
      valorUnitario,
      gtin: normalizarGtin(produto.barcode),
      imposto,
    } satisfies NfceItem);
  }

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

  return { itens, valorTotal, subtotal, desconto, regrasAplicadas };
}

// ──────────────────────────────────────────────
// Quadro tributário do item
// ──────────────────────────────────────────────

/** Modalidade da base de cálculo: 3 = valor da operação. */
const MOD_BC_VALOR_DA_OPERACAO = 3;

/**
 * Monta o contexto que a regra fiscal recebe.
 *
 * Hoje a NFC-e é sempre operação interna a consumidor final: sem cliente na
 * venda, o destinatário é a própria UF do emitente e não é contribuinte. Quando
 * a etapa 3 trouxer NF-e interestadual, é aqui que a UF de destino real passa a
 * entrar — e a porta já a espera.
 */
function montarContextoFiscal(
  produto: SaleForSnapshot['items'][number]['product'],
  company: CompanyForSnapshot,
  sale: SaleForSnapshot,
  crt: ReturnType<typeof mapCrt>,
): ContextoFiscal {
  const ufEmitente = (sale.establishment.state ?? '').trim().toUpperCase();

  return {
    produto: {
      ncm: produto.ncm,
      cest: produto.cest,
      origem: produto.origin,
      cfopPadrao: produto.cfop,
      csosnPadrao: produto.csosn,
      cstIcmsPadrao: produto.cstIcms,
      cstPis: produto.cstPis,
      cstCofins: produto.cstCofins,
      aliquotaIcms: numeroOuNulo(produto.aliquotaIcms),
      aliquotaPis: numeroOuNulo(produto.aliquotaPis),
      aliquotaCofins: numeroOuNulo(produto.aliquotaCofins),
    },
    emitente: {
      crt,
      uf: ufEmitente,
      contribuinteIcms: company.contribuinteIcms,
    },
    destinatario: {
      uf: ufEmitente,
      contribuinte: false,
      consumidorFinal: true,
    },
    operacao: { tipo: 'VENDA' },
  };
}

/** `Decimal` do Prisma para número, preservando a ausência. */
function numeroOuNulo(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}

/**
 * Compõe o quadro tributário do item a partir do cadastro do produto.
 *
 * **Esta etapa não calcula imposto — ela captura o dado.** O que sai daqui é
 * aritmética sobre o que o cadastro já sabe: base é o valor do item, alíquota é
 * a cadastrada, valor é o produto dos dois.
 *
 * O que exige regra fiscal de verdade — substituição tributária, MVA, redução
 * de base, crédito do Simples — **não** é adivinhado: o item é recusado
 * nomeando o campo que falta. Quem resolve isso é a etapa 2 do roteiro fiscal
 * (`regra-fiscal-por-operacao`), e inventar aqui um valor plausível seria
 * gravá-lo num snapshot congelado que ninguém mais revisa.
 */
function montarImposto(
  produto: SaleForSnapshot['items'][number]['product'],
  quadro: QuadroResolvido,
  valorLiquido: number,
  quantidade: number,
  rotulo: string,
  problemas: string[],
): NfceItemImposto {
  return {
    icms: montarIcms(produto, quadro, valorLiquido, rotulo, problemas),
    pis: montarPis(quadro, valorLiquido, quantidade, rotulo, problemas),
    cofins: montarCofins(quadro, valorLiquido, quantidade, rotulo, problemas),
  };
}

function montarIcms(
  produto: SaleForSnapshot['items'][number]['product'],
  quadro: QuadroResolvido,
  valorLiquido: number,
  rotulo: string,
  problemas: string[],
): NfceIcms {
  const icms: NfceIcms = {
    situacao: quadro.situacaoIcms ?? '',
    origem: produto.origin ?? 0,
  };

  const exigidos = camposExigidosIcms(quadro.situacaoIcms);
  if (!exigidos) return icms;

  // Campos que dependem de matriz tributária, não do cadastro do produto.
  const foraDoAlcance = exigidos.filter((campo) =>
    (
      [
        'modBCST',
        'vBCST',
        'pICMSST',
        'vICMSST',
        'vBCSTRet',
        'vICMSSTRet',
        'pCredSN',
        'vCredICMSSN',
        'pRedBC',
      ] as readonly string[]
    ).includes(campo),
  );

  if (foraDoAlcance.length > 0) {
    problemas.push(
      `${rotulo}: a situação de ICMS ${icms.situacao} exige ${foraDoAlcance.join(', ')}, ` +
        'que dependem da regra fiscal por operação e ainda não são calculados',
    );
    return icms;
  }

  if (exigidos.includes('vBC')) {
    const aliquota = quadro.aliquotaIcms;

    if (aliquota === null) {
      problemas.push(
        `${rotulo}: informe a alíquota de ICMS — a situação ${icms.situacao} exige base e valor`,
      );
      return icms;
    }

    const percentual = aliquota;
    icms.modBC = MOD_BC_VALOR_DA_OPERACAO;
    icms.vBC = arredondar(valorLiquido);
    icms.pICMS = percentual;
    icms.vICMS = arredondar((icms.vBC * percentual) / 100);
  }

  return icms;
}

function montarPis(
  quadro: QuadroResolvido,
  valorLiquido: number,
  quantidade: number,
  rotulo: string,
  problemas: string[],
): NfcePis {
  const apurada = apurarContribuicao(
    'PIS',
    quadro.cstPis,
    quadro.aliquotaPis,
    valorLiquido,
    quantidade,
    rotulo,
    problemas,
  );

  return {
    situacao: apurada.situacao,
    vBC: apurada.vBC,
    pPIS: apurada.aliquota,
    qBCProd: apurada.qBCProd,
    vAliqProd: apurada.vAliqProd,
    vPIS: apurada.valor,
  };
}

function montarCofins(
  quadro: QuadroResolvido,
  valorLiquido: number,
  quantidade: number,
  rotulo: string,
  problemas: string[],
): NfceCofins {
  const apurada = apurarContribuicao(
    'COFINS',
    quadro.cstCofins,
    quadro.aliquotaCofins,
    valorLiquido,
    quantidade,
    rotulo,
    problemas,
  );

  return {
    situacao: apurada.situacao,
    vBC: apurada.vBC,
    pCOFINS: apurada.aliquota,
    qBCProd: apurada.qBCProd,
    vAliqProd: apurada.vAliqProd,
    vCOFINS: apurada.valor,
  };
}

/** Resultado comum de PIS e COFINS — os dois apuram igual, só mudam os nomes. */
interface ContribuicaoApurada {
  situacao: string;
  vBC?: number;
  aliquota?: number;
  qBCProd?: number;
  vAliqProd?: number;
  valor?: number;
}

function apurarContribuicao(
  nome: string,
  cst: string | null,
  aliquotaCadastrada: number | null,
  valorLiquido: number,
  quantidade: number,
  rotulo: string,
  problemas: string[],
): ContribuicaoApurada {
  const situacao = cst?.trim() ?? '';
  const forma = formaDaContribuicao(situacao);

  if (!forma) {
    problemas.push(
      `${rotulo}: informe o CST de ${nome} no cadastro do produto`,
    );
    return { situacao };
  }

  // Situação não tributada não comporta base, alíquota nem valor.
  if (forma === 'nenhuma') {
    return { situacao };
  }

  if (aliquotaCadastrada === null) {
    problemas.push(
      `${rotulo}: informe a alíquota de ${nome} — o CST ${situacao} é tributado`,
    );
    return { situacao };
  }

  const aliquota = aliquotaCadastrada;

  // Apuração por quantidade: a alíquota cadastrada é valor por unidade.
  if (forma === 'quantidade') {
    return {
      situacao,
      qBCProd: quantidade,
      vAliqProd: aliquota,
      valor: arredondar(quantidade * aliquota),
    };
  }

  // `percentual` e `qualquer` apuram igual; "outras operações" aceitaria a
  // forma por quantidade também, mas o cadastro só descreve uma alíquota.
  const vBC = arredondar(valorLiquido);

  return {
    situacao,
    vBC,
    aliquota,
    valor: arredondar((vBC * aliquota) / 100),
  };
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

/**
 * Recebido e troco a partir dos pagamentos da venda.
 *
 * `changeGiven` é o que o caixa registrou e tem prioridade; sem ele, o troco
 * é a sobra do valor recebido. Devolve `undefined` quando nenhum pagamento
 * registrou recebimento — não há troco a documentar.
 */
function montarRecebimento(
  sale: SaleForSnapshot,
): FiscalRecebimento | undefined {
  const informado = (valor: unknown) => valor !== null && valor !== undefined;

  const comRecebimento = sale.payments.filter(
    (pagamento) =>
      informado(pagamento.amountReceived) || informado(pagamento.changeGiven),
  );

  if (comRecebimento.length === 0) return undefined;

  const valorRecebido = arredondar(
    somar(
      comRecebimento.map((pagamento) =>
        Number(pagamento.amountReceived ?? pagamento.amount),
      ),
    ),
  );

  const trocoRegistrado = somar(
    comRecebimento.map((pagamento) => Number(pagamento.changeGiven ?? 0)),
  );

  const pago = somar(
    comRecebimento.map((pagamento) => Number(pagamento.amount)),
  );

  const troco = arredondar(
    trocoRegistrado > 0 ? trocoRegistrado : Math.max(0, valorRecebido - pago),
  );

  return { valorRecebido, troco };
}

function limitar(valor: string, tamanho: number): string {
  return valor.trim().slice(0, tamanho);
}
