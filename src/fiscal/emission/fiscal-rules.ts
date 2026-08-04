import {
  FiscalEnvironment,
  PaymentMethod,
  TaxRegimeCode,
} from '@prisma/client';
import {
  CSOSN_SUPORTADOS,
  CST_ICMS_SUPORTADOS,
  FiscalAmbiente,
  FiscalCrt,
  FiscalPaymentType,
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

/** Emitente do Simples (CRT 1 e 2) usa CSOSN; o normal (CRT 3) usa CST. */
export function usaCsosn(crt: FiscalCrt): boolean {
  return crt === '1' || crt === '2';
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

/** GTIN válido tem 8, 12, 13 ou 14 dígitos; vazio vira "SEM GTIN" no motor. */
export function normalizarGtin(barcode?: string | null): string | undefined {
  const digitos = apenasDigitos(barcode);
  return [8, 12, 13, 14].includes(digitos.length) ? digitos : undefined;
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
  const situacaoOk = crt
    ? !!situacaoTributaria(mapCrt(crt), produto.csosn, produto.cstIcms)
    : isCsosnSuportado(produto.csosn) || isCstIcmsSuportado(produto.cstIcms);

  return (
    isNcmValido(produto.ncm) &&
    isCfopValido(produto.cfop) &&
    isOrigemValida(produto.origin) &&
    situacaoOk
  );
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
