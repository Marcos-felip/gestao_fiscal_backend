import { PaymentCondition } from '@prisma/client';
import type { NfeDuplicata } from './nfe-xml.parser';

/**
 * Condição de pagamento derivada das duplicatas da nota.
 *
 * **Limitação conhecida e aceita:** `Purchase` guarda `installments` e
 * `intervalDays`, não uma lista de vencimentos. Uma nota com vencimentos
 * irregulares (15/30/45/90) vira aproximação. A divergência aparece no
 * rascunho, onde dá para ajustar antes de confirmar — mudar o modelo de compras
 * está fora desta change, e está registrado como dívida no design.
 */

const DEFAULT_INTERVAL_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface NfePaymentTerms {
  paymentCondition: PaymentCondition;
  installments: number;
  firstDueDate: Date | null;
  intervalDays: number;
}

export function paymentTermsFromDuplicatas(
  duplicatas: NfeDuplicata[],
): NfePaymentTerms {
  if (duplicatas.length === 0) {
    // Nota sem cobrança foi paga no ato, ou o financeiro dela não é nosso.
    // Contas a pagar é só o que fica em aberto.
    return {
      paymentCondition: PaymentCondition.A_VISTA,
      installments: 1,
      firstDueDate: null,
      intervalDays: DEFAULT_INTERVAL_DAYS,
    };
  }

  const dueDates = sortedDueDates(duplicatas);

  return {
    paymentCondition: PaymentCondition.A_PRAZO,
    installments: duplicatas.length,
    firstDueDate: dueDates[0] ?? null,
    intervalDays: averageIntervalDays(dueDates),
  };
}

function sortedDueDates(duplicatas: NfeDuplicata[]): Date[] {
  return duplicatas
    .map((duplicata) => duplicata.dueDate)
    .filter((dueDate): dueDate is Date => !!dueDate)
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Espaçamento médio entre vencimentos, em dias inteiros.
 *
 * Com uma parcela só não há espaçamento a medir. O padrão de 30 dias não é
 * usado para nada nesse caso, mas deixar zero faria as parcelas seguintes de um
 * ajuste posterior vencerem todas no mesmo dia.
 */
function averageIntervalDays(dueDates: Date[]): number {
  if (dueDates.length < 2) return DEFAULT_INTERVAL_DAYS;

  const first = dueDates[0].getTime();
  const last = dueDates[dueDates.length - 1].getTime();
  const days = (last - first) / MS_PER_DAY / (dueDates.length - 1);

  return Math.max(1, Math.round(days));
}

/**
 * As duplicatas seguem o intervalo constante que `Purchase` sabe representar?
 *
 * Quando não seguem, a compra nasce aproximada, e quem confere precisa saber.
 */
export function hasIrregularDueDates(duplicatas: NfeDuplicata[]): boolean {
  const dueDates = sortedDueDates(duplicatas);
  if (dueDates.length < 3) return false;

  const intervals = dueDates
    .slice(1)
    .map((date, index) =>
      Math.round((date.getTime() - dueDates[index].getTime()) / MS_PER_DAY),
    );

  // Um dia de folga absorve fim de semana e mês de tamanhos diferentes.
  return intervals.some((days) => Math.abs(days - intervals[0]) > 1);
}
