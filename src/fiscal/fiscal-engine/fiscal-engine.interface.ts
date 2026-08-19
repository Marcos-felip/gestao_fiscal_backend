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

  /** Monta, assina e transmite a NF-e modelo 55 à SEFAZ. */
  emitirNfe(request: EmitirNfeRequest): Promise<EmitirNfeResult>;

  /** Consulta a situação de um documento pela chave de acesso. */
  consultar(request: ConsultarNfceRequest): Promise<ConsultarNfceResult>;

  /** Solicita o cancelamento de um documento autorizado. */
  cancelar(request: CancelarNfceRequest): Promise<CancelarNfceResult>;

  /** Testa a comunicação com a SEFAZ da UF. */
  statusServico(request: StatusServicoRequest): Promise<StatusServicoResult>;

  /** Verifica se o próprio motor está no ar, sem falar com a SEFAZ. */
  health(): Promise<FiscalEngineHealth>;

  /**
   * Transmite a Carta de Correção (evento 110110).
   *
   * A sequência vai pronta: o motor é stateless e só confere a faixa de 1 a 20.
   * Quem sabe qual é a próxima — e se a nota já chegou ao limite — é este lado.
   */
  cartaCorrecao(request: CartaCorrecaoRequest): Promise<CartaCorrecaoResult>;

  /** Inutiliza uma faixa de numeração que nunca virou documento. */
  inutilizar(request: InutilizarRequest): Promise<InutilizarResult>;
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

/**
 * CSOSN aceitos para emitente do Simples Nacional (CRT 1, 2 e 4).
 *
 * A lista deixou de ser "os que se resolvem sem valores": o motor passou a
 * receber o quadro tributário pronto, então aceita toda situação para a qual
 * exista grupo no XML. Quais campos cada uma exige está em
 * {@link CAMPOS_POR_CSOSN}, em `fiscal-rules.ts`.
 */
export const CSOSN_SUPORTADOS = [
  '101',
  '102',
  '103',
  '201',
  '202',
  '203',
  '300',
  '400',
  '500',
  '900',
] as const;

/** CST de ICMS aceitos para emitente do Regime Normal (CRT 3). */
export const CST_ICMS_SUPORTADOS = [
  '00',
  '10',
  '20',
  '30',
  '40',
  '41',
  '50',
  '51',
  '60',
  '70',
  '90',
] as const;

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

/**
 * Quadro de ICMS do item.
 *
 * Os nomes são os das tags do layout da NF-e (`vBC`, `pICMS`, …) e viajam
 * assim no JSON — o motor os desserializa por nome exato.
 *
 * Quase tudo é opcional porque o subconjunto exigido depende da situação
 * tributária. A tabela está em `fiscal-rules.ts`, não aqui.
 */
export interface NfceIcms {
  /** CSOSN (3 dígitos, Simples) ou CST (2 dígitos, Regime Normal) */
  situacao: string;
  /** Origem da mercadoria, 0 a 8 */
  origem: number;

  // ICMS próprio
  modBC?: number;
  /** Base de cálculo, **já reduzida** quando há `pRedBC` */
  vBC?: number;
  pRedBC?: number;
  pICMS?: number;
  vICMS?: number;

  // Substituição tributária
  modBCST?: number;
  pMVAST?: number;
  pRedBCST?: number;
  vBCST?: number;
  pICMSST?: number;
  vICMSST?: number;

  // ST retida anteriormente (CST 60 / CSOSN 500)
  vBCSTRet?: number;
  vICMSSTRet?: number;

  // Fundo de combate à pobreza
  pFCP?: number;
  vFCP?: number;
  vBCFCPST?: number;
  pFCPST?: number;
  vFCPST?: number;

  // Crédito do Simples Nacional
  pCredSN?: number;
  vCredICMSSN?: number;
}

/**
 * Base comum de PIS e COFINS.
 *
 * Duas formas de apuração, e o payload escolhe pelos campos que preenche:
 * **percentual** (`vBC` + alíquota) ou **quantidade** (`qBCProd` +
 * `vAliqProd`). Nunca as duas juntas.
 */
interface NfceContribuicaoBase {
  /** CST de 2 dígitos */
  situacao: string;
  vBC?: number;
  qBCProd?: number;
  vAliqProd?: number;
}

export interface NfcePis extends NfceContribuicaoBase {
  pPIS?: number;
  vPIS?: number;
}

export interface NfceCofins extends NfceContribuicaoBase {
  pCOFINS?: number;
  vCOFINS?: number;
}

/** Quadro de IPI. Opcional: a maioria das NFC-e não destaca IPI. */
export interface NfceIpi {
  /** CST de 2 dígitos */
  situacao: string;
  vBC?: number;
  pIPI?: number;
  vIPI?: number;
  /** Código de enquadramento legal. Ausente = `999` */
  cEnq?: string;
}

/**
 * Quadro tributário do item, decidido e calculado aqui.
 *
 * O motor apenas traduz para os grupos de imposto do XML — ele não escolhe
 * situação tributária nem completa valor que não veio.
 */
export interface NfceItemImposto {
  icms: NfceIcms;
  pis: NfcePis;
  cofins: NfceCofins;
  ipi?: NfceIpi;
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
  /**
   * Quadro tributário completo do item. **Obrigatório.**
   *
   * A origem da mercadoria e a situação tributária moram dentro de
   * `imposto.icms` — os campos `origem` e `csosn` que existiam aqui saíram do
   * contrato do motor.
   */
  imposto: NfceItemImposto;
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

// ──────────────────────────────────────────────
// NF-e modelo 55
// ──────────────────────────────────────────────

/**
 * Indicador de IE do destinatário (`indIEDest`).
 *
 * **Não se deduz do tipo de pessoa.** Prestadora de serviço é pessoa jurídica
 * e não é contribuinte de ICMS. Quem declara é o cadastro do parceiro.
 */
export const IND_IE_DEST = {
  CONTRIBUINTE: 1,
  ISENTO: 2,
  NAO_CONTRIBUINTE: 9,
} as const;

export type IndIeDest = (typeof IND_IE_DEST)[keyof typeof IND_IE_DEST];

export const IND_IE_DEST_VALORES = Object.values(IND_IE_DEST) as IndIeDest[];

/** Destinatário da NF-e: ao contrário da NFC-e, nada aqui é opcional. */
export interface NfeDestinatario {
  /** Somente dígitos. CNPJ — CPF é recusado no recorte atual. */
  cpfCnpj: string;
  /** Máx. 60 caracteres */
  nome: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  /** Código IBGE do município, 7 dígitos */
  codigoMunicipio: string;
  municipio: string;
  uf: string;
  /** Somente dígitos, 8 caracteres */
  cep: string;
  indicadorIe: IndIeDest;
  /** Obrigatória quando contribuinte; recusada nos outros dois casos. */
  inscricaoEstadual?: string;
  telefone?: string;
  email?: string;
}

export interface NfeTransportadora {
  cpfCnpj: string;
  nome: string;
  inscricaoEstadual?: string;
  endereco?: string;
  municipio?: string;
  uf?: string;
}

export interface NfeVeiculo {
  placa: string;
  uf: string;
  rntc?: string;
}

export interface NfeVolume {
  quantidade?: number;
  especie?: string;
  marca?: string;
  numeracao?: string;
  pesoLiquido?: number;
  pesoBruto?: number;
}

/** Omitido por completo, a nota declara "sem frete". */
export interface NfeTransporte {
  /** 0 remetente · 1 destinatário · 2 terceiros · 3/4 próprio · 9 sem frete */
  modalidade: number;
  transportadora?: NfeTransportadora;
  veiculo?: NfeVeiculo;
  volumes?: NfeVolume[];
}

export interface NfeDuplicata {
  numero: string;
  /** ISO `aaaa-MM-dd` */
  vencimento: string;
  valor: number;
}

export interface NfeCobranca {
  numeroFatura?: string;
  valorOriginal?: number;
  valorDesconto?: number;
  valorLiquido?: number;
  duplicatas?: NfeDuplicata[];
}

export interface EmitirNfeRequest extends FiscalCertificateCredentials {
  emitente: NfceEmitente;
  destinatario: NfeDestinatario;
  itens: NfceItem[];
  pagamentos: NfcePagamento[];
  valorTotal: number;
  /** 1 a 999 */
  serie: number;
  /** 1 a 999999999 */
  numero: number;
  ambiente: FiscalAmbiente;
  naturezaOperacao?: string;
  /** 0 entrada · 1 saída. O recorte atual aceita apenas saída. */
  tipoOperacao: number;
  /** 1 normal · 2 complementar · 3 ajuste · 4 devolução. Só normal por ora. */
  finalidade: number;
  /** `indFinal`: venda para consumo (true) ou para revenda (false). */
  consumidorFinal: boolean;
  /** `indPres`: 0 não se aplica · 1 presencial · 2 internet · 9 outros. */
  presenca: number;
  transporte?: NfeTransporte;
  cobranca?: NfeCobranca;
}

export interface EmitirNfeResult {
  sucesso: boolean;
  chaveAcesso?: string;
  protocolo?: string;
  xmlAutorizadoBase64?: string;
  /** DANFE em base64 — o tipo está em `danfeContentType`. */
  danfeBase64?: string;
  /**
   * Tipo do conteúdo do DANFE. O da NF-e é **HTML**, não PDF: o layout retrato
   * pronto depende de `System.Drawing.Common`, Windows-only no .NET 8, e o
   * motor roda em contêiner Linux. Guardar como PDF corromperia o arquivo.
   */
  danfeContentType?: string;
  rejeicao?: FiscalRejeicao;
}

// ──────────────────────────────────────────────
// Eventos: carta de correção e inutilização
// ──────────────────────────────────────────────

export interface CartaCorrecaoRequest extends FiscalCertificateCredentials {
  chaveAcesso: string;
  /** 15 a 1000 caracteres */
  correcao: string;
  /** 1 a 20 */
  sequenciaEvento: number;
  /** CNPJ do emitente — o autor do evento */
  cpfCnpj: string;
  ambiente: FiscalAmbiente;
}

export interface CartaCorrecaoResult {
  sucesso: boolean;
  protocolo?: string;
  xmlEventoBase64?: string;
  motivoRejeicao?: string;
  /**
   * Texto legal de condição de uso da CC-e. Volta **inclusive na recusa** —
   * quem confirma a correção precisa lê-lo antes, não depois de dar certo.
   */
  condicaoDeUso?: string;
}

export interface InutilizarRequest extends FiscalCertificateCredentials {
  cnpj: string;
  ano: number;
  /** 55 (NF-e) ou 65 (NFC-e) */
  modelo: number;
  serie: number;
  numeroInicial: number;
  numeroFinal: number;
  /** 15 a 255 caracteres */
  justificativa: string;
  /** Sem chave de acesso, não há de onde deduzir a UF. */
  uf: string;
  ambiente: FiscalAmbiente;
}

export interface InutilizarResult {
  sucesso: boolean;
  protocolo?: string;
  xmlInutilizacaoBase64?: string;
  motivoRejeicao?: string;
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
