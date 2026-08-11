/**
 * Contrato abstrato para motores de emissão fiscal.
 *
 * Permite trocar o motor (dfe-net, futuro engine próprio, etc.) sem mudar a
 * camada de negócio. Cada implementação cuida do transporte (HTTP, gRPC,
 * mensageria) e da montagem/assinatura do XML.
 *
 * Os tipos abaixo espelham o contrato REAL do microserviço `fiscal_service`
 * (.NET 8 / DFe.NET) — ver `openspec/changes/add-fiscal-mvp-nfce/ENGINE_ALIGNMENT.md`.
 * O motor é stateless: o certificado (pfx base64 + senha) e o ambiente viajam
 * no corpo de TODA requisição.
 */
export interface IFiscalEngine {
  /** Monta, assina e transmite a NFC-e à SEFAZ. */
  emitir(request: EmitirNfceRequest): Promise<EmitirNfceResult>;

  /** Consulta a situação de um documento pela chave de acesso. */
  consultar(request: ConsultarNfceRequest): Promise<ConsultarNfceResult>;

  /** Solicita o cancelamento de um documento autorizado. */
  cancelar(request: CancelarNfceRequest): Promise<CancelarNfceResult>;

  /** Testa a comunicação com a SEFAZ da UF. */
  statusServico(request: StatusServicoRequest): Promise<StatusServicoResult>;

  /** Verifica se o próprio motor está no ar, sem falar com a SEFAZ. */
  health(): Promise<FiscalEngineHealth>;
}

// ──────────────────────────────────────────────
// Enums / valores aceitos pelo motor (strings no JSON)
// ──────────────────────────────────────────────

/** Ambiente de emissão. O motor também aceita `'1'`/`'2'`. */
export type FiscalAmbiente = 'homologacao' | 'producao';

/**
 * Código do Regime Tributário do emitente.
 * 1 Simples · 2 Simples com excesso de sublimite · 3 Regime Normal · 4 MEI.
 */
export type FiscalCrt = '1' | '2' | '3' | '4';

/**
 * Forma de pagamento — o motor resolve o `tPag` numérico internamente.
 * Enviar a string textual, nunca `'01'`/`'17'`.
 */
export type FiscalPaymentType =
  | 'dinheiro'
  | 'cheque'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'credito_loja'
  | 'vale_alimentacao'
  | 'vale_refeicao'
  | 'vale_presente'
  | 'vale_combustivel'
  | 'boleto'
  | 'pix'
  | 'sem_pagamento'
  | 'outro';

/** CSOSN aceitos para emitente do Simples Nacional (CRT 1 e 2). */
export const CSOSN_SUPORTADOS = ['102', '103', '300', '400', '500'] as const;

/** CST de ICMS aceitos para emitente do Regime Normal (CRT 3). */
export const CST_ICMS_SUPORTADOS = ['40', '41', '50'] as const;

// ──────────────────────────────────────────────
// Credenciais do certificado (sempre no corpo)
// ──────────────────────────────────────────────

export interface FiscalCertificateCredentials {
  /** Conteúdo do .pfx em base64. Nunca deve ser registrado em log. */
  certificadoBase64: string;
  /** Senha do .pfx. Nunca deve ser registrada em log. */
  certificadoSenha: string;
}

// ──────────────────────────────────────────────
// Emissão
// ──────────────────────────────────────────────

export interface NfceEmitente {
  cnpj: string;
  /** Máx. 60 caracteres */
  razaoSocial: string;
  nomeFantasia?: string;
  /** Máx. 14 caracteres */
  inscricaoEstadual: string;
  crt: FiscalCrt;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  /** Código IBGE do município, 7 dígitos */
  codigoMunicipio: string;
  municipio: string;
  /** Sigla da UF, 2 caracteres */
  uf: string;
  /** Somente dígitos, 8 caracteres */
  cep: string;
  telefone?: string;
  email?: string;
}

/**
 * Bloco opcional. Omitir por completo para consumidor não identificado.
 * O endereço só é montado pelo motor quando `logradouro` e `uf` vêm juntos.
 */
export interface NfceDestinatario {
  cpfCnpj?: string;
  nome?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  codigoMunicipio?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

export interface NfceItem {
  numeroItem: number;
  /** Máx. 60 caracteres */
  codigoProduto: string;
  /** Máx. 120 caracteres */
  descricao: string;
  /** 8 dígitos */
  ncm: string;
  /** 7 dígitos */
  cest?: string;
  /** 4 dígitos, começa com 5 (operação dentro do estado) */
  cfop: string;
  /** Máx. 6 caracteres */
  unidadeComercial: string;
  quantidade: number;
  valorUnitario: number;
  /** Vazio = "SEM GTIN"; senão 8/12/13/14 dígitos com DV válido */
  gtin?: string;
  /** Origem da mercadoria, 0 a 8 */
  origem: number;
  /**
   * CSOSN (CRT 1/2) ou CST de ICMS (CRT 3), restrito ao conjunto suportado.
   * O motor deriva o ICMS de origem + csosn; PIS/COFINS ficam com CST 07.
   */
  csosn: string;
}

export interface NfcePagamento {
  tipo: FiscalPaymentType;
  valor: number;
}

export interface EmitirNfceRequest extends FiscalCertificateCredentials {
  emitente: NfceEmitente;
  destinatario?: NfceDestinatario;
  itens: NfceItem[];
  pagamentos: NfcePagamento[];
  /** Σ dos itens, tolerância de 0,01 */
  valorTotal: number;
  codigoCsc: string;
  idCsc: string;
  /** 1 a 999 */
  serie: number;
  /** 1 a 999999999 */
  numero: number;
  ambiente: FiscalAmbiente;
}

/** Motivo da recusa devolvido pelo motor ou pela SEFAZ. */
export interface FiscalRejeicao {
  codigo: string;
  mensagem: string;
  retornoTecnico?: string;
}

export interface EmitirNfceResult {
  sucesso: boolean;
  /** 44 dígitos */
  chaveAcesso?: string;
  /** 15 dígitos */
  protocolo?: string;
  /** nfeProc completo, em base64 UTF-8 */
  xmlAutorizadoBase64?: string;
  /** DANFE (PDF) em base64 */
  danfeBase64?: string;
  /** String da URL do QR Code — não é imagem */
  qrCode?: string;
  rejeicao?: FiscalRejeicao;
}

// ──────────────────────────────────────────────
// Consulta
// ──────────────────────────────────────────────

export interface ConsultarNfceRequest extends FiscalCertificateCredentials {
  chaveAcesso: string;
  ambiente: FiscalAmbiente;
}

export interface ConsultarNfceResult {
  sucesso: boolean;
  /** Situação devolvida pela SEFAZ */
  status?: string;
  protocolo?: string;
  xmlConsultaBase64?: string;
  mensagemErro?: string;
}

// ──────────────────────────────────────────────
// Cancelamento
// ──────────────────────────────────────────────

export interface CancelarNfceRequest extends FiscalCertificateCredentials {
  chaveAcesso: string;
  /** 15 dígitos */
  protocoloAutorizacao: string;
  /** 15 a 255 caracteres */
  justificativa: string;
  ambiente: FiscalAmbiente;
}

export interface CancelarNfceResult {
  sucesso: boolean;
  protocolo?: string;
  xmlCancelamentoBase64?: string;
  motivoRejeicao?: string;
}

// ──────────────────────────────────────────────
// Status do serviço da SEFAZ
// ──────────────────────────────────────────────

export interface StatusServicoRequest extends FiscalCertificateCredentials {
  ambiente: FiscalAmbiente;
  /** Sigla da UF, 2 caracteres */
  uf: string;
}

export interface StatusServicoResult {
  disponivel: boolean;
  mensagem?: string;
  /** Tempo médio de resposta informado pela SEFAZ, em segundos */
  tempoMedioResposta?: number;
}

// ──────────────────────────────────────────────
// Saúde do motor
// ──────────────────────────────────────────────

/**
 * Resultado da sonda `GET /health` do motor. Diferente de `statusServico`,
 * não envolve certificado nem SEFAZ — responde apenas se o microserviço está
 * de pé e respondendo. Nunca lança: indisponibilidade é um resultado válido.
 */
export interface FiscalEngineHealth {
  disponivel: boolean;
  /** Status textual devolvido pelo motor (ex.: `Healthy`) */
  status?: string;
  /** Motivo da indisponibilidade, quando `disponivel` for `false` */
  mensagem?: string;
  /** Tempo de resposta da sonda, em milissegundos */
  latenciaMs: number;
}

// ──────────────────────────────────────────────
// Falhas de transporte
// ──────────────────────────────────────────────

/**
 * Natureza de uma falha que NÃO é rejeição de negócio.
 *
 * Rejeição da SEFAZ e erro de validação/certificado chegam como HTTP 400 e
 * viram `sucesso: false` no result — reprocessar não adianta. Já as falhas
 * abaixo são transitórias ou de configuração e justificam retry da fila.
 */
export type FiscalEngineFailureKind =
  | 'AUTH'
  | 'SERVER'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE';

/** Erro de transporte/infraestrutura na conversa com o motor fiscal. */
export class FiscalEngineTransportError extends Error {
  constructor(
    message: string,
    readonly kind: FiscalEngineFailureKind,
    readonly httpStatus?: number,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = 'FiscalEngineTransportError';
  }
}
