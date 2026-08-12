import { FiscalCrt } from '../fiscal-engine/fiscal-engine.interface';

/**
 * Porta da regra fiscal por operação — etapa 2 do roteiro fiscal.
 *
 * A resposta fiscal de um item **não é um campo do produto**: é função da
 * operação. O mesmo produto tem CFOP e situação tributária diferentes numa venda
 * interna, numa interestadual e numa devolução. Esta porta é quem responde.
 *
 * Segue o padrão do `IFiscalEngine`: o domínio pergunta e não sabe quem
 * responde. É o que permite trocar a implementação — matriz própria ou serviço
 * de terceiro — sem tocar na emissão.
 *
 * **Assíncrona de propósito.** A implementação de hoje resolve em memória e não
 * precisaria de `Promise`, mas um fornecedor de matriz tributária responde por
 * HTTP. Nascer síncrona obrigaria a reescrever tudo acima da porta no dia da
 * troca — que é exatamente o que a porta existe para evitar.
 */
export interface IRegraFiscal {
  resolver(contexto: ContextoFiscal): Promise<QuadroResolvido>;
}

/** Token de injeção — a implementação é escolhida no módulo. */
export const REGRA_FISCAL = Symbol('REGRA_FISCAL');

/** Recorte do produto que a resolução usa. */
export interface ContextoFiscalProduto {
  ncm: string | null;
  cest: string | null;
  origem: number | null;
  /** CFOP do cadastro, usado quando nenhuma regra casa. */
  cfopPadrao: string | null;
  csosnPadrao: string | null;
  cstIcmsPadrao: string | null;
  cstPis: string | null;
  cstCofins: string | null;
  aliquotaIcms: number | null;
  aliquotaPis: number | null;
  aliquotaCofins: number | null;
}

export interface ContextoFiscalEmitente {
  crt: FiscalCrt;
  uf: string;
  contribuinteIcms: boolean;
}

/**
 * Destinatário da operação. Numa NFC-e a consumidor não identificado, `uf` é a
 * do emitente e `contribuinte` é falso — a operação é interna a consumidor
 * final, que é o caso que o sistema atende hoje.
 */
export interface ContextoFiscalDestinatario {
  uf: string | null;
  contribuinte: boolean;
  consumidorFinal: boolean;
}

/** Tipo da operação que originou o documento. */
export type TipoOperacaoFiscal = 'VENDA' | 'DEVOLUCAO';

export interface ContextoFiscalOperacao {
  tipo: TipoOperacaoFiscal;
}

export interface ContextoFiscal {
  produto: ContextoFiscalProduto;
  emitente: ContextoFiscalEmitente;
  destinatario: ContextoFiscalDestinatario;
  operacao: ContextoFiscalOperacao;
}

/**
 * Resposta da regra: o que vale para **esta** operação.
 *
 * `regraAplicada` não é enfeite. Quando uma nota sair com imposto errado, a
 * primeira pergunta vai ser "por que saiu assim" — e sem saber quem respondeu, a
 * resposta é adivinhação. Ela é gravada no snapshot junto do quadro.
 */
export interface QuadroResolvido {
  cfop: string | null;
  /** CSOSN (Simples) ou CST de ICMS (Regime Normal), conforme o regime. */
  situacaoIcms: string | undefined;
  cstPis: string | null;
  cstCofins: string | null;
  aliquotaIcms: number | null;
  aliquotaPis: number | null;
  aliquotaCofins: number | null;
  /** Identificação legível de quem respondeu. */
  regraAplicada: string;
}
