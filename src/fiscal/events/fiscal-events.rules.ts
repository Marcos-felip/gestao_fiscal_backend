/**
 * Regras dos eventos fiscais que o motor não tem como impor.
 *
 * O motor é stateless: ele confere tamanho de texto e faixa de sequência, mas
 * não sabe quantas correções a nota já teve nem quais números foram usados.
 * Quem sabe é aqui, que tem o banco — e é por isso que estas regras existem
 * deste lado.
 */

/** Limite legal de cartas de correção por nota. */
export const LIMITE_CARTAS_CORRECAO = 20;

export const CORRECAO_TAMANHO_MINIMO = 15;
export const CORRECAO_TAMANHO_MAXIMO = 1000;

export const JUSTIFICATIVA_TAMANHO_MINIMO = 15;
export const JUSTIFICATIVA_TAMANHO_MAXIMO = 255;

/** Número já usado, para a conferência da faixa a inutilizar. */
export interface NumeroUsado {
  numero: number;
  chaveAcesso: string | null;
  status: string;
}

/**
 * Conflitos entre a faixa pedida e os números que já viraram documento.
 *
 * **Inutilizar número de nota autorizada é o erro caro aqui.** A SEFAZ recusaria,
 * mas depois — e a mensagem dela não diria qual número. Conferir antes permite
 * nomear o número e a chave, que é o que deixa o operador corrigir a faixa.
 */
export function conflitosNaFaixa(
  numeroInicial: number,
  numeroFinal: number,
  usados: NumeroUsado[],
): NumeroUsado[] {
  return usados.filter(
    (usado) => usado.numero >= numeroInicial && usado.numero <= numeroFinal,
  );
}

export function mensagemDeConflito(conflitos: NumeroUsado[]): string {
  const lista = conflitos
    .slice(0, 5)
    .map((c) =>
      c.chaveAcesso ? `${c.numero} (${c.chaveAcesso})` : `${c.numero}`,
    )
    .join(', ');

  const resto = conflitos.length > 5 ? ` e mais ${conflitos.length - 5}` : '';
  const singular = conflitos.length === 1;

  return (
    `A faixa inclui ${singular ? 'o número' : 'os números'} ${lista}${resto}, ` +
    `que já ${singular ? 'pertence' : 'pertencem'} a ${singular ? 'um documento emitido' : 'documentos emitidos'}. ` +
    'Inutilize apenas numeração que nunca virou nota.'
  );
}

/**
 * Protocolo de uma inutilização que a SEFAZ diz **já existir** para a faixa.
 *
 * Acontece quando o pedido chega e é homologado mas a resposta não volta a
 * tempo: deste lado vira erro, nada é gravado, e a tentativa seguinte recebe a
 * duplicidade. Sem ler o protocolo dessa recusa, a faixa fica invisível para
 * sempre — o sistema continua sugerindo inutilizá-la e a SEFAZ continua
 * recusando. Aconteceu na primeira inutilização real, em 14/08/2026.
 */
export function protocoloDeDuplicidade(
  motivo: string | undefined,
): string | null {
  if (!motivo) return null;
  if (!/j[áa]\s+existe\s+pedido\s+de\s+inutiliza/i.test(motivo)) return null;

  const protocolo = /nProt:?\s*(\d{15})/i.exec(motivo);

  return protocolo ? protocolo[1] : null;
}

/**
 * Números reservados que nunca viraram documento — os buracos da sequência.
 *
 * São **calculáveis** do que já existe: de 1 até o próximo número, tudo que não
 * tem documento foi reservado e perdido. Não é preciso rastrear nada a mais.
 *
 * Serve para sugerir a faixa em vez de deixar alguém digitá-la, que é onde mora
 * o risco de inutilizar o número errado.
 */
export function buracosDaNumeracao(
  proximoNumero: number,
  numerosComDocumento: number[],
): number[] {
  const usados = new Set(numerosComDocumento);
  const buracos: number[] = [];

  for (let numero = 1; numero < proximoNumero; numero++) {
    if (!usados.has(numero)) buracos.push(numero);
  }

  return buracos;
}

/** Faixas contíguas, para não listar cem números soltos. */
export interface Faixa {
  inicio: number;
  fim: number;
}

export function agruparEmFaixas(numeros: number[]): Faixa[] {
  if (numeros.length === 0) return [];

  const ordenados = [...numeros].sort((a, b) => a - b);
  const faixas: Faixa[] = [{ inicio: ordenados[0], fim: ordenados[0] }];

  for (const numero of ordenados.slice(1)) {
    const atual = faixas[faixas.length - 1];

    if (numero === atual.fim + 1) {
      atual.fim = numero;
      continue;
    }

    faixas.push({ inicio: numero, fim: numero });
  }

  return faixas;
}
