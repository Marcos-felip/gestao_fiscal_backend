/**
 * Payload do evento disparado quando uma venda é finalizada (CONCLUIDA).
 *
 * Consumido pelo listener fiscal para criar o FiscalDocument e enfileirar
 * a emissão da NFC-e.
 */
export interface SaleConfirmedEvent {
  saleId: string;
  companyId: string;
  establishmentId: string;
  /** Operador que finalizou a venda — fica no histórico da emissão */
  usuarioId?: string;
}

export const SALE_CONFIRMED_EVENT = 'sale.confirmed';
