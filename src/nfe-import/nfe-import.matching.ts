import { NfeImportMatch } from '@prisma/client';
import type { IncomingNfeItem } from './nfe-xml.parser';

/**
 * Casamento de item da nota com produto do catálogo.
 *
 * A ordem é deliberada e **descrição não entra nela**:
 *
 * 1. **GTIN** — código global; quando existe, é a evidência mais forte da nota.
 * 2. **Código do fornecedor** — o `cProd` que aquele fornecedor usou numa
 *    importação anterior, guardado por `(fornecedor, código)`.
 * 3. **Nada** — o item fica pendente e alguém escolhe.
 *
 * Casar por semelhança de texto foi descartado: "REFRIG LATA 350" e
 * "Refrigerante Lata 350ml" são o mesmo produto, mas "Parafuso 3x20" e
 * "Parafuso 3x25" não são e diferem em um caractere. Acerta o fácil, erra o
 * caro — e o erro entra no estoque como se tivesse sido conferido.
 */

/** Produto do catálogo, no recorte que o casamento usa. */
export interface MatchableProduct {
  id: string;
  barcode: string | null;
}

export interface MatchResult {
  productId: string | null;
  match: NfeImportMatch;
}

export function matchItem(
  item: IncomingNfeItem,
  productsByGtin: Map<string, MatchableProduct>,
  supplierCodes: Map<string, string>,
): MatchResult {
  if (item.gtin) {
    const byGtin = productsByGtin.get(item.gtin);
    if (byGtin) {
      return { productId: byGtin.id, match: NfeImportMatch.GTIN };
    }
  }

  const remembered = supplierCodes.get(item.supplierCode);
  if (remembered) {
    return { productId: remembered, match: NfeImportMatch.SUPPLIER_CODE };
  }

  return { productId: null, match: NfeImportMatch.UNMATCHED };
}

/**
 * Itens que ainda dependem de escolha do usuário.
 *
 * É o que decide se a importação está pronta: gerar compra com item sem produto
 * criaria uma compra que não fecha.
 */
export function unmatchedCount(items: { productId: string | null }[]): number {
  return items.filter((item) => item.productId === null).length;
}

/**
 * A unidade do XML difere da unidade do produto?
 *
 * Só aponta — **nunca converte**. Caixa com 12 unidades é o erro mais provável
 * de uma nota real, e converter por palpite multiplica o estoque por um número
 * que ninguém conferiu.
 */
export function unitMismatch(
  nfeUnit: string,
  productUnit: string | null | undefined,
): boolean {
  if (!productUnit) return false;
  return nfeUnit.trim().toUpperCase() !== productUnit.trim().toUpperCase();
}
