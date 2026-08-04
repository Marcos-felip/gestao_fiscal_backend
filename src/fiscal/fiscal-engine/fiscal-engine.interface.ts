/**
 * Contrato abstrato para motores de emissão fiscal.
 *
 * Permite trocar o motor (dfe-net, futuro engine próprio, etc.) sem
 * mudar a camada de negócio. Cada implementação cuida do transporte
 * (HTTP, gRPC, mensageria) e do formato do XML.
 */
export interface IFiscalEngine {
  /**
   * Envia o XML assinado para a SEFAZ e devolve o resultado do processamento.
   */
  emitir(payload: FiscalEmissionRequest): Promise<FiscalEmissionResult>;

  /**
   * Consulta o status de um documento pela chave de acesso.
   */
  consultar?(chaveAcesso: string): Promise<FiscalConsultationResult>;

  /**
   * Solicita o cancelamento de um documento autorizado.
   */
  cancelar?(
    payload: FiscalCancellationRequest,
  ): Promise<FiscalCancellationResult>;
}

export interface FiscalEmissionRequest {
  /** Chave de idempotência para evitar duplicidade */
  idempotencyKey: string;
  /** Ambiente: homologação ou produção */
  ambiente: string;
  /** XML assinado em base64 */
  xml: string;
  /** Modelo: NFE ou NFCE */
  modelo: string;
  /** Série */
  serie: number;
  /** Número */
  numero: number;
}

export interface FiscalEmissionResult {
  success: boolean;
  protocolo?: string;
  chaveAcesso?: string;
  xmlAutorizado?: string;
  rejeicaoCodigo?: string;
  rejeicaoMensagem?: string;
  /** Status retornado pelo motor */
  status: string;
}

export interface FiscalConsultationResult {
  status: string;
  protocolo?: string;
  dataAutorizacao?: string;
}

export interface FiscalCancellationRequest {
  chaveAcesso: string;
  protocolo: string;
  justificativa: string;
  ambiente: string;
}

export interface FiscalCancellationResult {
  success: boolean;
  protocolo?: string;
  rejeicaoCodigo?: string;
  rejeicaoMensagem?: string;
}
