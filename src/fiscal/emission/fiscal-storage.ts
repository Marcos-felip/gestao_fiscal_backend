/**
 * Organização dos arquivos fiscais no storage:
 * `fiscal/{companyId}/{ano}/{mes}/{chaveAcesso}.{extensao}`.
 *
 * O que fica gravado no banco (`xmlAutorizado`, `danfeUrl`, `xmlCancelamento`)
 * é essa chave, não uma URL: o bucket é privado e o download passa pela API.
 */
const PREFIXO = 'fiscal/';

/**
 * `html` existe por causa do DANFE do modelo 55: ele não é PDF, e gravá-lo com
 * extensão `.pdf` entregaria ao lojista um arquivo que nenhum leitor abre.
 */
export type FiscalFileExtension = 'xml' | 'pdf' | 'html';

/** Extensão e MIME do DANFE, a partir do que o motor declarou ter gerado. */
export function danfeFormato(contentType?: string): {
  extensao: FiscalFileExtension;
  mime: string;
} {
  return contentType?.toLowerCase().includes('html')
    ? { extensao: 'html', mime: 'text/html; charset=utf-8' }
    : { extensao: 'pdf', mime: 'application/pdf' };
}

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
