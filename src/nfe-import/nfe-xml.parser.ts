import { BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

/**
 * Leitura do XML da NF-e de entrada (leiaute 4.00).
 *
 * **Roda aqui, não no motor .NET.** O motor existe por causa de SEFAZ,
 * certificado e assinatura; ler um arquivo que já está na nossa mão não tem
 * nada disso, e mandá-lo para lá acrescentaria rede e contrato a um trabalho
 * local.
 *
 * Tudo é lido como **texto** (`parseTagValue: false`). Deixar o parser adivinhar
 * tipos transformaria `cProd` "007" em `7` e a chave de acesso de 44 dígitos num
 * número que perde precisão — os dois viram bug silencioso de casamento.
 *
 * Os nomes seguem o padrão do projeto: inglês, com exceção dos termos do
 * leiaute fiscal brasileiro que não têm equivalente fiel — `chaveAcesso`,
 * `cfop`, `ncm`, `duplicatas`, `inscricaoEstadual`.
 */

/** Endereço como a nota o traz. */
export interface NfeAddress {
  street?: string;
  number?: string;
  district?: string;
  city?: string;
  cityCode?: string;
  state?: string;
  zipCode?: string;
}

export interface NfeIssuer extends NfeAddress {
  cnpj: string;
  legalName: string;
  tradeName?: string;
  inscricaoEstadual?: string;
}

/**
 * Quadro tributário do item, como o **fornecedor** o declarou.
 *
 * Transfere-se com segurança para o nosso cadastro a `origem`: ela é
 * propriedade da mercadoria (nacional, importada…), não da operação.
 *
 * Já `situacaoIcms`, `cstPis` e `cstCofins` são a tributação **da venda dele**,
 * sob o regime dele — um fornecedor no Regime Normal manda CST 00 onde a nossa
 * empresa do Simples usaria CSOSN 102. Servem de ponto de partida, e a
 * interface precisa dizer isso: quem decide a nossa situação é o contador.
 */
export interface IncomingNfeItemTax {
  /** `orig` — 0 a 8. */
  origem: number | null;
  /** `CST` (Regime Normal) ou `CSOSN` (Simples), como veio. */
  situacaoIcms: string | null;
  cstPis: string | null;
  cstCofins: string | null;
}

export interface IncomingNfeItem {
  itemNumber: number;
  /** `cProd` — código do produto no cadastro **do fornecedor**. */
  supplierCode: string;
  /** `cEAN`. Nulo quando a nota diz "SEM GTIN" ou traz valor inválido. */
  gtin: string | null;
  description: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  /** O que o `imposto` do item trouxe. Nunca é usado sem conferência. */
  tax: IncomingNfeItemTax;
}

/**
 * Duplicata do grupo de cobrança.
 *
 * Fica em português porque é instrumento de crédito brasileiro do leiaute da
 * NF-e — "installment" diria outra coisa.
 */
export interface NfeDuplicata {
  number: string | null;
  dueDate: Date | null;
  amount: number;
}

export interface IncomingNfe {
  chaveAcesso: string;
  number: number;
  series: number;
  issuedAt: Date;
  issuer: NfeIssuer;
  /** CNPJ ou CPF do destinatário, só dígitos. */
  recipientDocument: string;
  items: IncomingNfeItem[];
  duplicatas: NfeDuplicata[];
  totalAmount: number;
}

const NFE_MODEL = '55';

/** GTIN válido tem 8, 12, 13 ou 14 dígitos. Qualquer outra coisa não é chave. */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Emissores diferentes usam `<nfe:NFe>` ou `<NFe>`. Sem isto, metade das
  // notas reais não seria encontrada.
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type Node = Record<string, unknown>;

function asNode(value: unknown): Node | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Node)
    : null;
}

/**
 * Valor de uma tag como texto.
 *
 * Só aceita primitivo: com `parseTagValue: false` tudo vem string, e um nó
 * aninhado onde se esperava valor (`<CNPJ><x>1</x></CNPJ>`) viraria
 * "[object Object]" e seguiria adiante como se fosse dado.
 */
function text(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const raw = value.trim();
    return raw.length > 0 ? raw : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function digits(value: unknown): string {
  return (text(value) ?? '').replace(/\D/g, '');
}

/** `det` vem como objeto quando a nota tem um item só, e array quando tem vários. */
function asList(value: unknown): Node[] {
  if (Array.isArray(value)) {
    return value.map(asNode).filter((node): node is Node => !!node);
  }
  const single = asNode(value);
  return single ? [single] : [];
}

function decimal(value: unknown, field: string): number {
  const parsed = Number(text(value));
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(
      `O XML não traz um valor numérico válido em ${field}`,
    );
  }
  return parsed;
}

function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function refuse(message: string): never {
  throw new BadRequestException(message);
}

/**
 * Localiza `infNFe` dentro das cascas possíveis.
 *
 * O arquivo pode vir como `nfeProc` (nota autorizada, com protocolo) ou como
 * `NFe` solta. As duas são notas legítimas na mão do usuário — recusar uma
 * delas seria recusar por formato do e-mail.
 */
function findInfNFe(root: Node): Node {
  const nfeProc = asNode(root.nfeProc);
  const nfe = asNode(nfeProc?.NFe ?? root.NFe);
  const inf = asNode(nfe?.infNFe);

  if (!inf) {
    refuse(
      'O arquivo não é um XML de NF-e: não foi encontrado o grupo infNFe. ' +
        'Envie o XML da nota, não o DANFE nem o recibo do e-mail',
    );
  }

  return inf;
}

function readIssuer(inf: Node): NfeIssuer {
  const emit = asNode(inf.emit);
  if (!emit) refuse('O XML não traz o grupo do emitente');

  const cnpj = digits(emit.CNPJ);
  if (cnpj.length !== 14) {
    refuse(
      'O emitente do XML não tem CNPJ — nota de produtor rural com CPF ainda não é importável',
    );
  }

  const address = asNode(emit.enderEmit) ?? {};

  return {
    cnpj,
    legalName: text(emit.xNome) ?? 'Fornecedor sem nome na nota',
    tradeName: text(emit.xFant),
    inscricaoEstadual: text(emit.IE),
    street: text(address.xLgr),
    number: text(address.nro),
    district: text(address.xBairro),
    city: text(address.xMun),
    cityCode: text(address.cMun),
    state: text(address.UF),
    zipCode: digits(address.CEP) || undefined,
  };
}

/**
 * O grupo do imposto tem um filho por situação tributária (`ICMS00`, `ICMS60`,
 * `ICMSSN102`, `PISAliq`, `PISNT`…). Não dá para procurar por nome: são dezenas,
 * e a NT seguinte acrescenta outros. Procura-se pelo **conteúdo** — o primeiro
 * filho que tenha `CST` ou `CSOSN`.
 */
function readTaxGroup(group: Node | null): Node | null {
  if (!group) return null;

  for (const value of Object.values(group)) {
    const child = asNode(value);
    if (child && (child.CST !== undefined || child.CSOSN !== undefined)) {
      return child;
    }
  }

  return null;
}

function readTax(det: Node): IncomingNfeItemTax {
  const imposto = asNode(det.imposto);
  const icms = readTaxGroup(asNode(imposto?.ICMS));
  const pis = readTaxGroup(asNode(imposto?.PIS));
  const cofins = readTaxGroup(asNode(imposto?.COFINS));

  const origem = text(icms?.orig);

  return {
    origem: origem !== undefined ? Number(origem) : null,
    situacaoIcms: text(icms?.CSOSN) ?? text(icms?.CST) ?? null,
    cstPis: text(pis?.CST) ?? null,
    cstCofins: text(cofins?.CST) ?? null,
  };
}

function readItem(det: Node): IncomingNfeItem {
  const prod = asNode(det.prod);
  if (!prod) refuse('O XML traz um item sem o grupo de produto');

  const itemNumber = Number(text(det['@_nItem']) ?? '0');
  const rawGtin = digits(prod.cEAN);

  return {
    itemNumber: Number.isFinite(itemNumber) && itemNumber > 0 ? itemNumber : 1,
    supplierCode: text(prod.cProd) ?? '',
    // "SEM GTIN" vira string vazia depois de tirar as letras; comprimento
    // inválido também não serve de chave, e é melhor não existir do que casar
    // errado.
    gtin: GTIN_LENGTHS.has(rawGtin.length) ? rawGtin : null,
    description: text(prod.xProd) ?? 'Item sem descrição na nota',
    ncm: text(prod.NCM) ?? null,
    cest: text(prod.CEST) ?? null,
    cfop: text(prod.CFOP) ?? null,
    unit: text(prod.uCom) ?? 'UN',
    quantity: decimal(prod.qCom, 'qCom'),
    unitPrice: decimal(prod.vUnCom, 'vUnCom'),
    totalAmount: decimal(prod.vProd, 'vProd'),
    tax: readTax(det),
  };
}

function readDuplicatas(inf: Node): NfeDuplicata[] {
  const cobr = asNode(inf.cobr);
  if (!cobr) return [];

  return asList(cobr.dup).map((dup) => ({
    number: text(dup.nDup) ?? null,
    dueDate: parseDate(dup.dVenc),
    amount: decimal(dup.vDup, 'vDup'),
  }));
}

/**
 * Lê o XML de uma NF-e de entrada.
 *
 * As recusas são em português e dizem **o que o arquivo é**, não só que ele é
 * inválido: quem recebe "XML inválido" não sabe se mandou o DANFE, o XML de
 * outra nota ou um arquivo corrompido.
 */
export function parseIncomingNfe(xml: string): IncomingNfe {
  if (!xml || xml.trim().length === 0) {
    refuse('O arquivo enviado está vazio');
  }

  let root: Node | null;
  try {
    root = asNode(parser.parse(xml));
  } catch {
    refuse('O arquivo enviado não é um XML válido');
  }

  if (!root) refuse('O arquivo enviado não é um XML válido');

  const inf = findInfNFe(root);
  const ide = asNode(inf.ide);
  if (!ide) refuse('O XML não traz o grupo de identificação da nota');

  const model = text(ide.mod);
  if (model !== NFE_MODEL) {
    refuse(
      `Só é possível importar NF-e modelo 55; este arquivo é do modelo ${model ?? 'desconhecido'}`,
    );
  }

  // A chave está no atributo `Id` como "NFe" + 44 dígitos.
  const chaveAcesso = digits(inf['@_Id']);
  if (chaveAcesso.length !== 44) {
    refuse('O XML não traz uma chave de acesso de 44 dígitos');
  }

  const dest = asNode(inf.dest);
  const recipientDocument = digits(dest?.CNPJ ?? dest?.CPF);
  if (!recipientDocument) {
    refuse('O XML não traz o CNPJ nem o CPF do destinatário');
  }

  const items = asList(inf.det).map(readItem);
  if (items.length === 0) {
    refuse('O XML não traz nenhum item');
  }

  const issuedAt = parseDate(ide.dhEmi) ?? parseDate(ide.dEmi);
  if (!issuedAt) {
    refuse('O XML não traz a data de emissão');
  }

  const totals = asNode(asNode(inf.total)?.ICMSTot);

  return {
    chaveAcesso,
    number: decimal(ide.nNF, 'nNF'),
    series: decimal(ide.serie, 'serie'),
    issuedAt,
    issuer: readIssuer(inf),
    recipientDocument,
    items,
    duplicatas: readDuplicatas(inf),
    // Sem `vNF`, a soma dos itens é a melhor verdade disponível — e é conferida
    // contra ele quando ele existe.
    totalAmount: totals
      ? decimal(totals.vNF, 'vNF')
      : items.reduce((sum, item) => sum + item.totalAmount, 0),
  };
}

/**
 * Diferença entre o total declarado e a soma dos itens.
 *
 * Não recusa: nota real tem frete, desconto e seguro no total, e barrar por isso
 * impediria importação legítima. Mas quem confere precisa ver.
 */
export function totalMismatch(nfe: IncomingNfe): number {
  const sum = nfe.items.reduce((total, item) => total + item.totalAmount, 0);
  return Number((nfe.totalAmount - sum).toFixed(2));
}
