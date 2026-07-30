export interface Installment {
  installmentNumber: number;
  installmentTotal: number;
  amount: number;
  dueDate: Date;
}

export const DEFAULT_INTERVAL_DAYS = 30;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Divide um valor em parcelas com vencimentos espaçados.
 *
 * O resto dos centavos vai **todo na última parcela**: dividir R$ 100,00 em 3
 * daria 33,33 × 3 = 99,99, e o título ficaria um centavo abaixo da venda para
 * sempre. Aqui a última fecha em 33,34.
 */
export function buildInstallments(
  totalAmount: number,
  installments: number,
  firstDueDate: Date,
  intervalDays: number = DEFAULT_INTERVAL_DAYS,
): Installment[] {
  const total = round2(totalAmount);
  const base = round2(Math.floor((total / installments) * 100) / 100);

  return Array.from({ length: installments }, (_, index) => {
    const isLast = index === installments - 1;

    return {
      installmentNumber: index + 1,
      installmentTotal: installments,
      amount: isLast ? round2(total - base * (installments - 1)) : base,
      dueDate: addDays(firstDueDate, intervalDays * index),
    };
  });
}
