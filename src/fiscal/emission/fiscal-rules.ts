import {
  FiscalEnvironment,
  PaymentMethod,
  TaxRegimeCode,
} from '@prisma/client';
import { cnpj, cpf } from 'cpf-cnpj-validator';
import { isUf } from '../../common/validators/is-uf.validator';
import {
  CSOSN_SUPORTADOS,
  CST_ICMS_SUPORTADOS,
  FiscalAmbiente,
  FiscalCrt,
  FiscalPaymentType,
  NfceIcms,
  NfceItemImposto,
} from '../fiscal-engine/fiscal-engine.interface';

/**
 * Regras aceitas pelo motor .NET, num lugar só.
 *
 * Estas validações são as mesmas aplicadas pelo `fiscal_service`: repeti-las
 * aqui faz a emissão falhar cedo, com mensagem em português, em vez de virar
 * rejeição da SEFAZ depois de consumir um número de nota.
 */

/** Diferença máxima tolerada pelo motor entre somatórios (R$ 0,01). */
export const TOLERANCIA_MONETARIA = 0.01;

/** Arredonda para centavos, evitando o erro clássico de ponto flutuante. */
export function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/** Soma valores monetários já arredondando o resultado. */
export function somar(valores: number[]): number {
  return arredondar(valores.reduce((total, valor) => total + valor, 0));
}

/** NCM tem 8 dígitos. */
export function isNcmValido(ncm?: string | null): boolean {
  return !!ncm && /^\d{8}$/.test(ncm);
}

/** CEST, quando informado, tem 7 dígitos. */
export function isCestValido(cest?: string | null): boolean {
  return !cest || /^\d{7}$/.test(cest);
}

/** NFC-e é sempre operação interna: o CFOP tem 4 dígitos e começa com 5. */
export function isCfopValido(cfop?: string | null): boolean {
  return !!cfop && /^5\d{3}$/.test(cfop);
}

/** Origem da mercadoria vai de 0 a 8. */
export function isOrigemValida(origem?: number | null): boolean {
  return (
    origem !== null &&
    origem !== undefined &&
    Number.isInteger(origem) &&
    origem >= 0 &&
    origem <= 8
  );
}

/** Simples Nacional aceita apenas os CSOSN de operação sem crédito de ICMS. */
export function isCsosnSuportado(csosn?: string | null): boolean {
  return (
    !!csosn && (CSOSN_SUPORTADOS as readonly string[]).includes(csosn.trim())
  );
}

/** Regime normal aceita apenas os CST de ICMS isento/não tributado/diferido. */
export function isCstIcmsSuportado(cst?: string | null): boolean {
  return (
    !!cst && (CST_ICMS_SUPORTADOS as readonly string[]).includes(cst.trim())
  );
}

/**
 * Emitente do Simples usa CSOSN; só o Regime Normal (CRT 3) usa CST.
 *
 * Vale para CRT 1, 2 e 4 (MEI) — o MEI é Simples Nacional, apenas com
 * enquadramento próprio.
 */
export function usaCsosn(crt: FiscalCrt): boolean {
  return crt !== '3';
}

/**
 * Situação tributária aceita para o regime do emitente.
 * Devolve `undefined` quando o produto não tem o código válido para o regime.
 */
export function situacaoTributaria(
  crt: FiscalCrt,
  csosn?: string | null,
  cstIcms?: string | null,
): string | undefined {
  if (usaCsosn(crt)) {
    return isCsosnSuportado(csosn) ? csosn!.trim() : undefined;
  }
  return isCstIcmsSuportado(cstIcms) ? cstIcms!.trim() : undefined;
}

// ──────────────────────────────────────────────
// Quadro tributário do item
// ──────────────────────────────────────────────

/**
 * Campos do grupo de ICMS que uma situação tributária pode exigir.
 *
 * A tabela abaixo é espelho da que vive em
 * `FiscalService.Domain.Tributacao.SituacaoIcms`, no motor. Duplicar é
 * deliberado: lá porque ele monta o XML, aqui porque é onde o erro ainda pode
 * ser explicado ao usuário antes de queimar um número de nota.
 */
export type CampoIcms =
  | 'modBC'
  | 'vBC'
  | 'pRedBC'
  | 'pICMS'
  | 'vICMS'
  | 'modBCST'
  | 'vBCST'
  | 'pICMSST'
  | 'vICMSST'
  | 'vBCSTRet'
  | 'vICMSSTRet'
  | 'pCredSN'
  | 'vCredICMSSN';

/** Campos exigidos por CSOSN (Simples Nacional). */
export const CAMPOS_POR_CSOSN: Readonly<Record<string, readonly CampoIcms[]>> =
  {
    // Tributada com permissão de crédito.
    '101': ['pCredSN', 'vCredICMSSN'],
    // Sem crédito / isenção / imune / não tributada: só origem e CSOSN.
    '102': [],
    '103': [],
    '300': [],
    '400': [],
    // Com crédito e com cobrança do ICMS por substituição tributária.
    '201': ['modBCST', 'vBCST', 'pICMSST', 'vICMSST', 'pCredSN', 'vCredICMSSN'],
    '202': ['modBCST', 'vBCST', 'pICMSST', 'vICMSST'],
    '203': ['modBCST', 'vBCST', 'pICMSST', 'vICMSST'],
    // ICMS cobrado anteriormente por substituição tributária.
    '500': ['vBCSTRet', 'vICMSSTRet'],
    // Outras.
    '900': ['modBC', 'vBC', 'pICMS', 'vICMS'],
  };

/** Campos exigidos por CST de ICMS (Regime Normal). */
export const CAMPOS_POR_CST_ICMS: Readonly<
  Record<string, readonly CampoIcms[]>
> = {
  '00': ['modBC', 'vBC', 'pICMS', 'vICMS'],
  '10': [
    'modBC',
    'vBC',
    'pICMS',
    'vICMS',
    'modBCST',
    'vBCST',
    'pICMSST',
    'vICMSST',
  ],
  '20': ['modBC', 'pRedBC', 'vBC', 'pICMS', 'vICMS'],
  '30': ['modBCST', 'vBCST', 'pICMSST', 'vICMSST'],
  // Isenta / não tributada / suspensão: o grupo comporta só origem e CST.
  '40': [],
  '41': [],
  '50': [],
  '51': ['modBC', 'vBC', 'pICMS', 'vICMS'],
  '60': ['vBCSTRet', 'vICMSSTRet'],
  '70': [
    'modBC',
    'pRedBC',
    'vBC',
    'pICMS',
    'vICMS',
    'modBCST',
    'vBCST',
    'pICMSST',
    'vICMSST',
  ],
  '90': ['modBC', 'vBC', 'pICMS', 'vICMS'],
};

/** Campos que a situação de ICMS exige, ou `undefined` se ela não existe. */
export function camposExigidosIcms(
  situacao?: string | null,
): readonly CampoIcms[] | undefined {
  const codigo = situacao?.trim() ?? '';
  return CAMPOS_POR_CSOSN[codigo] ?? CAMPOS_POR_CST_ICMS[codigo];
}

/**
 * Forma de apuração de PIS/COFINS conforme o CST.
 *
 * - `percentual`: base × alíquota (`vBC` + `pPIS`/`pCOFINS`)
 * - `quantidade`: quantidade × alíquota por unidade (`qBCProd` + `vAliqProd`)
 * - `nenhuma`: situação não tributada — não leva base, alíquota nem valor
 * - `qualquer`: "outras operações" — uma das duas formas, nunca as duas
 */
export type FormaContribuicao =
  | 'percentual'
  | 'quantidade'
  | 'nenhuma'
  | 'qualquer';

/** CST de PIS/COFINS tributado por alíquota percentual. */
const CST_CONTRIBUICAO_PERCENTUAL = ['01', '02'];

/** CST de PIS/COFINS tributado por alíquota em valor, sobre a quantidade. */
const CST_CONTRIBUICAO_QUANTIDADE = ['03'];

/** CST de PIS/COFINS sem tributação: isenta, alíquota zero, suspensão etc. */
const CST_CONTRIBUICAO_SEM_TRIBUTACAO = ['04', '05', '06', '07', '08', '09'];

/** CST de "outras operações": aceita qualquer uma das duas formas. */
const CST_CONTRIBUICAO_OUTRAS = [
  '49',
  '50',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '70',
  '71',
  '72',
  '73',
  '74',
  '75',
  '98',
  '99',
];

/** Todos os CST de PIS/COFINS que o motor sabe traduzir. */
export const CST_CONTRIBUICAO_SUPORTADOS = [
  ...CST_CONTRIBUICAO_PERCENTUAL,
  ...CST_CONTRIBUICAO_QUANTIDADE,
  ...CST_CONTRIBUICAO_SEM_TRIBUTACAO,
  ...CST_CONTRIBUICAO_OUTRAS,
];

/** Forma de apuração do CST informado, ou `undefined` se ele não existe. */
export function formaDaContribuicao(
  cst?: string | null,
): FormaContribuicao | undefined {
  const codigo = cst?.trim() ?? '';

  if (CST_CONTRIBUICAO_PERCENTUAL.includes(codigo)) return 'percentual';
  if (CST_CONTRIBUICAO_QUANTIDADE.includes(codigo)) return 'quantidade';
  if (CST_CONTRIBUICAO_SEM_TRIBUTACAO.includes(codigo)) return 'nenhuma';
  if (CST_CONTRIBUICAO_OUTRAS.includes(codigo)) return 'qualquer';

  return undefined;
}

/** `true` quando o campo veio preenchido com um número utilizável. */
function informado(valor?: number | null): boolean {
  return valor !== null && valor !== undefined && Number.isFinite(valor);
}

/**
 * Confere se o quadro tributário do item tem o que a situação declarada exige.
 *
 * Devolve a lista de problemas em português, vazia quando está tudo certo. É a
 * mesma checagem que o motor faz — repetida aqui para o erro chegar ao usuário
 * como configuração pendente, e não como rejeição da SEFAZ com o número da nota
 * já consumido.
 */
export function validarQuadroTributario(
  imposto: NfceItemImposto,
  rotulo: string,
): string[] {
  return [
    ...validarIcms(imposto.icms, rotulo),
    ...validarContribuicao(
      'PIS',
      imposto.pis.situacao,
      {
        vBC: imposto.pis.vBC,
        aliquota: imposto.pis.pPIS,
        qBCProd: imposto.pis.qBCProd,
        vAliqProd: imposto.pis.vAliqProd,
        valor: imposto.pis.vPIS,
      },
      rotulo,
    ),
    ...validarContribuicao(
      'COFINS',
      imposto.cofins.situacao,
      {
        vBC: imposto.cofins.vBC,
        aliquota: imposto.cofins.pCOFINS,
        qBCProd: imposto.cofins.qBCProd,
        vAliqProd: imposto.cofins.vAliqProd,
        valor: imposto.cofins.vCOFINS,
      },
      rotulo,
    ),
  ];
}

function validarIcms(icms: NfceIcms, rotulo: string): string[] {
  const problemas: string[] = [];
  const situacao = icms.situacao?.trim() ?? '';
  const exigidos = camposExigidosIcms(situacao);

  if (!exigidos) {
    problemas.push(
      `${rotulo}: situação tributária de ICMS "${situacao || '(vazia)'}" não é reconhecida`,
    );
    return problemas;
  }

  if (!isOrigemValida(icms.origem)) {
    problemas.push(`${rotulo}: origem da mercadoria ausente ou fora de 0 a 8`);
  }

  const faltando = exigidos.filter((campo) => !informado(icms[campo]));

  if (faltando.length > 0) {
    problemas.push(
      `${rotulo}: a situação de ICMS ${situacao} exige ${faltando.join(', ')}`,
    );
  }

  // Base sem alíquota — e o inverso — não monta grupo válido nem quando o par
  // é opcional para a situação.
  if (informado(icms.vBC) !== informado(icms.pICMS)) {
    problemas.push(
      `${rotulo}: informe base de cálculo e alíquota de ICMS juntas`,
    );
  }
  if (informado(icms.vBCST) !== informado(icms.pICMSST)) {
    problemas.push(
      `${rotulo}: informe base de cálculo e alíquota da ST juntas`,
    );
  }

  return problemas;
}

/** Campos de uma contribuição, já normalizados para a checagem comum. */
interface ContribuicaoNormalizada {
  vBC?: number;
  aliquota?: number;
  qBCProd?: number;
  vAliqProd?: number;
  valor?: number;
}

function validarContribuicao(
  nome: string,
  situacao: string,
  campos: ContribuicaoNormalizada,
  rotulo: string,
): string[] {
  const problemas: string[] = [];
  const codigo = situacao?.trim() ?? '';
  const forma = formaDaContribuicao(codigo);

  if (!forma) {
    problemas.push(
      `${rotulo}: CST de ${nome} "${codigo || '(vazio)'}" não é reconhecido`,
    );
    return problemas;
  }

  const temPercentual = informado(campos.vBC) && informado(campos.aliquota);
  const temQuantidade =
    informado(campos.qBCProd) && informado(campos.vAliqProd);

  if (forma === 'nenhuma') {
    if (temPercentual || temQuantidade || informado(campos.valor)) {
      problemas.push(
        `${rotulo}: o CST de ${nome} ${codigo} não é tributado e não comporta base, alíquota ou valor`,
      );
    }
    return problemas;
  }

  if (forma === 'percentual' && !temPercentual) {
    problemas.push(
      `${rotulo}: o CST de ${nome} ${codigo} exige base de cálculo e alíquota`,
    );
  }

  if (forma === 'quantidade' && !temQuantidade) {
    problemas.push(
      `${rotulo}: o CST de ${nome} ${codigo} exige quantidade e alíquota por unidade`,
    );
  }

  if (forma === 'qualquer') {
    if (!temPercentual && !temQuantidade) {
      problemas.push(
        `${rotulo}: o CST de ${nome} ${codigo} exige base e alíquota, ou quantidade e alíquota por unidade`,
      );
    }
    if (temPercentual && temQuantidade) {
      problemas.push(
        `${rotulo}: o CST de ${nome} ${codigo} não aceita as duas formas de apuração ao mesmo tempo`,
      );
    }
  }

  if (!informado(campos.valor)) {
    problemas.push(`${rotulo}: informe o valor de ${nome}`);
  }

  return problemas;
}

/** Só dígitos — o motor recusa CEP/IBGE/CNPJ com máscara. */
export function apenasDigitos(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Código IBGE do município tem 7 dígitos. */
export function isCodigoIbgeValido(codigo?: string | null): boolean {
  return /^\d{7}$/.test(apenasDigitos(codigo));
}

/** CEP tem 8 dígitos. */
export function isCepValido(cep?: string | null): boolean {
  return /^\d{8}$/.test(apenasDigitos(cep));
}

/** UF precisa ser uma das 27 siglas oficiais. */
export function isUfValida(uf?: string | null): boolean {
  return isUf(uf);
}

/**
 * Inscrição Estadual do emitente: só dígitos, de 2 a 14 posições (o motor
 * recusa acima de 14). O dígito verificador varia por UF e não é conferido —
 * quem valida a regra estadual é a SEFAZ.
 */
export function isInscricaoEstadualValida(ie?: string | null): boolean {
  return /^\d{2,14}$/.test(apenasDigitos(ie));
}

/** CPF (11) ou CNPJ (14) com dígitos verificadores conferidos. */
export function isCpfCnpjValido(valor?: string | null): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return cpf.isValid(digitos);
  if (digitos.length === 14) return cnpj.isValid(digitos);
  return false;
}

/** GTIN válido tem 8, 12, 13 ou 14 dígitos; vazio vira "SEM GTIN" no motor. */
export function normalizarGtin(barcode?: string | null): string | undefined {
  const digitos = apenasDigitos(barcode);
  return [8, 12, 13, 14].includes(digitos.length) ? digitos : undefined;
}

/** Menor CSC aceito. Ver {@link isCscValido} para o porquê de 16. */
export const CSC_TAMANHO_MINIMO = 16;

/** Maior CSC aceito, com folga sobre os 36 caracteres das UFs mais longas. */
export const CSC_TAMANHO_MAXIMO = 64;

/**
 * CSC do estabelecimento: 16 a 64 caracteres alfanuméricos.
 *
 * O mínimo é 16 e **não** 32 de propósito. Cada UF emite o CSC no seu próprio
 * tamanho — MG usa 32 caracteres hexadecimais, outras usam 36 — e travar no
 * tamanho de uma delas recusaria o CSC legítimo das demais. 16 já elimina toda a
 * classe de erro "copiei o campo errado do portal", que é a que interessa: um CSC
 * curto não falha no cadastro nem na emissão, só volta da SEFAZ como
 * **rejeição 464 (QR-Code com hash inválido)**, depois de queimar o número da
 * nota, e com uma mensagem que não menciona o CSC.
 */
export function isCscValido(csc?: string | null): boolean {
  const valor = csc?.trim() ?? '';
  return (
    valor.length >= CSC_TAMANHO_MINIMO &&
    valor.length <= CSC_TAMANHO_MAXIMO &&
    /^[A-Za-z0-9]+$/.test(valor)
  );
}

/**
 * ID do CSC: 1 a 6 dígitos.
 *
 * É o `cIdToken` do QR Code, que ocupa 6 posições preenchidas com zeros à
 * esquerda. Qualquer coisa fora disso não produz um QR Code válido.
 */
export function isIdCscValido(idCsc?: string | null): boolean {
  return /^\d{1,6}$/.test(idCsc?.trim() ?? '');
}

/** Campos fiscais da empresa exigidos para emitir. */
export interface CompanyFiscalFields {
  cnpj?: string | null;
  razaoSocial?: string | null;
  inscricaoEstadual?: string | null;
  crt?: TaxRegimeCode | null;
  codigoIbgeMunicipio?: string | null;
}

/**
 * A empresa está fiscalmente configurada quando tem identificação, regime e
 * município — o resto do endereço vem do estabelecimento emitente.
 */
export function isCompanyFiscalComplete(company: CompanyFiscalFields): boolean {
  return (
    apenasDigitos(company.cnpj).length === 14 &&
    !!company.razaoSocial?.trim() &&
    !!company.inscricaoEstadual?.trim() &&
    !!company.crt &&
    isCodigoIbgeValido(company.codigoIbgeMunicipio)
  );
}

/** Campos fiscais do produto exigidos para compor um item da NFC-e. */
export interface ProductFiscalFields {
  ncm?: string | null;
  cfop?: string | null;
  origin?: number | null;
  csosn?: string | null;
  cstIcms?: string | null;
  cstPis?: string | null;
  cstCofins?: string | null;
  aliquotaIcms?: number | null;
  aliquotaPis?: number | null;
  aliquotaCofins?: number | null;
}

/**
 * O produto está fiscalmente completo quando passa nas mesmas regras do motor.
 *
 * Sem o CRT da empresa não dá para saber se o item usa CSOSN ou CST, então
 * qualquer um dos dois válidos serve.
 */
export function isProductFiscalComplete(
  produto: ProductFiscalFields,
  crt?: TaxRegimeCode | null,
): boolean {
  return listarPendenciasFiscais(produto, crt).length === 0;
}

/**
 * O que impede o produto de entrar numa NFC-e, em texto para o usuário.
 *
 * É a mesma checagem de {@link isProductFiscalComplete}, só que dizendo o que
 * falta — alimenta o relatório de pendências fiscais.
 */
export function listarPendenciasFiscais(
  produto: ProductFiscalFields,
  crt?: TaxRegimeCode | null,
): string[] {
  const pendencias: string[] = [];

  if (!isNcmValido(produto.ncm)) {
    pendencias.push('NCM ausente ou fora do formato de 8 dígitos');
  }
  if (!isCfopValido(produto.cfop)) {
    pendencias.push(
      'CFOP ausente ou não é uma operação dentro do estado (5xxx)',
    );
  }
  if (!isOrigemValida(produto.origin)) {
    pendencias.push('origem da mercadoria ausente ou fora da faixa 0 a 8');
  }

  const situacaoOk = crt
    ? !!situacaoTributaria(mapCrt(crt), produto.csosn, produto.cstIcms)
    : isCsosnSuportado(produto.csosn) || isCstIcmsSuportado(produto.cstIcms);

  if (!situacaoOk) {
    pendencias.push(
      crt && !usaCsosn(mapCrt(crt))
        ? `CST de ICMS ausente ou não suportado (aceitos: ${CST_ICMS_SUPORTADOS.join(', ')})`
        : `CSOSN ausente ou não suportado (aceitos: ${CSOSN_SUPORTADOS.join(', ')})`,
    );
  }

  // Sem CST de PIS e COFINS o item não tem como compor o quadro tributário: o
  // motor deixou de completar com CST 07 fixo, então o código precisa vir do
  // cadastro.
  if (!formaDaContribuicao(produto.cstPis)) {
    pendencias.push('CST de PIS ausente ou não reconhecido');
  }
  if (!formaDaContribuicao(produto.cstCofins)) {
    pendencias.push('CST de COFINS ausente ou não reconhecido');
  }

  // A alíquota só é exigida quando o CST tributa por percentual — situação não
  // tributada (04 a 09) não comporta alíquota nenhuma.
  if (
    formaDaContribuicao(produto.cstPis) === 'percentual' &&
    !informado(produto.aliquotaPis)
  ) {
    pendencias.push('alíquota de PIS ausente para o CST informado');
  }
  if (
    formaDaContribuicao(produto.cstCofins) === 'percentual' &&
    !informado(produto.aliquotaCofins)
  ) {
    pendencias.push('alíquota de COFINS ausente para o CST informado');
  }

  return pendencias;
}

/** Converte o CRT da empresa para a string esperada pelo motor. */
export function mapCrt(crt: TaxRegimeCode): FiscalCrt {
  switch (crt) {
    case TaxRegimeCode.SIMPLES_NACIONAL:
      return '1';
    case TaxRegimeCode.SIMPLES_EXCESSO:
      return '2';
    case TaxRegimeCode.REGIME_NORMAL:
      return '3';
    case TaxRegimeCode.SIMPLES_MEI:
      return '4';
  }
}

/** Converte o ambiente do documento para a string esperada pelo motor. */
export function mapAmbiente(ambiente: FiscalEnvironment): FiscalAmbiente {
  return ambiente === FiscalEnvironment.PRODUCAO ? 'producao' : 'homologacao';
}

/**
 * Converte a forma de pagamento da venda para o tipo textual do motor.
 * O motor resolve o `tPag` numérico internamente.
 */
export function mapFormaPagamento(method: PaymentMethod): FiscalPaymentType {
  switch (method) {
    case PaymentMethod.DINHEIRO:
      return 'dinheiro';
    case PaymentMethod.CARTAO_CREDITO:
      return 'cartao_credito';
    case PaymentMethod.CARTAO_DEBITO:
      return 'cartao_debito';
    case PaymentMethod.PIX:
      return 'pix';
    case PaymentMethod.BOLETO:
      return 'boleto';
    case PaymentMethod.OUTRO:
      return 'outro';
  }
}
