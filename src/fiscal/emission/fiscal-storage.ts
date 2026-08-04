/**
 * Organização dos arquivos fiscais no storage:
 * `fiscal/{companyId}/{ano}/{mes}/{chaveAcesso}.{extensao}`.
 *
 * O que fica gravado no banco (`xmlAutorizado`, `danfeUrl`, `xmlCancelamento`)
 * é essa chave, não uma URL: o bucket é privado e o download passa pela API.
 */
const PREFIXO = 'fiscal/';

export type FiscalFileExtension = 'xml' | 'pdf';

export function buildFiscalStorageKey(
  companyId: string,
  chaveAcesso: string,
  extensao: FiscalFileExtension,
  referencia: Date,
  sufixo?: string,
): string {
  const ano = referencia.getFullYear();
  const mes = String(referencia.getMonth() + 1).padStart(2, '0');
  const nome = sufixo ? `${chaveAcesso}-${sufixo}` : chaveAcesso;

  return `${PREFIXO}${companyId}/${ano}/${mes}/${nome}.${extensao}`;
}

/**
 * Distingue uma chave do storage de um conteúdo gravado direto na coluna.
 * Documentos antigos (ou emitidos sem storage configurado) guardam o XML puro.
 */
export function isFiscalStorageKey(valor: string): boolean {
  return valor.startsWith(PREFIXO);
}
