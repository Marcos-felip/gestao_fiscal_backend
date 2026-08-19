/**
 * Fronteiras de dia e de mês no fuso da operação.
 *
 * O instante gravado no banco é sempre UTC — o que muda aqui é onde o dia
 * começa e termina para efeito de consulta.
 *
 * Calcular "hoje" com fronteira UTC quebra em silêncio e no pior horário: às
 * 21h de Brasília já é o dia seguinte em UTC, então a loja ainda vendendo veria
 * o faturamento do dia zerar, e concluiria que o sistema perdeu as vendas.
 *
 * O deslocamento vem do `Intl`, não de um `-03:00` escrito no código. O Brasil
 * não tem horário de verão desde 2019, mas fixar o offset é apostar que ele não
 * volta — e a aposta seria cobrada uma vez por ano, de madrugada.
 */

/** Fuso da operação quando `APP_TIMEZONE` não é informado. */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Intervalo semiaberto `[start, end)`, como o Prisma consulta com gte/lt. */
export interface DateRange {
  start: Date;
  end: Date;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    // Falhar alto: cair para UTC calcularia todos os recortes errados sem que
    // nada no sistema desse sinal.
    throw new Error(
      `Fuso horário desconhecido: "${timeZone}". Verifique APP_TIMEZONE.`,
    );
  }

  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Quebra o instante nos componentes de calendário do fuso pedido. */
function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Algumas versões do ICU devolvem 24 para a meia-noite.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Deslocamento do fuso, em milissegundos, no instante dado. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // Os milissegundos não aparecem no formatador e não interessam ao offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instante UTC da meia-noite local da data de calendário informada.
 *
 * Duas passagens: a primeira chuta o deslocamento na data errada (a de UTC), a
 * segunda o corrige já no dia certo. Só faz diferença em fuso com horário de
 * verão, mas é o que impede o utilitário de errar por uma hora quando alguém
 * configurar `APP_TIMEZONE` para fora do Brasil.
 */
function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day);
  const firstPass = naive - offsetAt(new Date(naive), timeZone);
  const secondPass = naive - offsetAt(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/** Fuso configurado para a operação, validado na primeira leitura. */
export function businessTimezone(): string {
  const timeZone = process.env.APP_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  formatterFor(timeZone);
  return timeZone;
}

/**
 * Um dia inteiro no fuso da operação.
 *
 * `offsetDays` anda no calendário: `-1` é ontem. A conta usa `Date.UTC` sobre a
 * tupla de calendário, e não soma de 24 horas — o dia de mudança de horário de
 * verão não tem 24 horas.
 */
export function dayRange(
  reference: Date,
  timeZone: string,
  offsetDays = 0,
): DateRange {
  const parts = partsInZone(reference, timeZone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays),
  );

  return {
    start: zonedMidnight(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
      timeZone,
    ),
    end: zonedMidnight(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate() + 1,
      timeZone,
    ),
  };
}

/** Um mês inteiro no fuso da operação. `offsetMonths = -1` é o mês passado. */
export function monthRange(
  reference: Date,
  timeZone: string,
  offsetMonths = 0,
): DateRange {
  const parts = partsInZone(reference, timeZone);
  const first = new Date(
    Date.UTC(parts.year, parts.month - 1 + offsetMonths, 1),
  );

  return {
    start: zonedMidnight(
      first.getUTCFullYear(),
      first.getUTCMonth() + 1,
      1,
      timeZone,
    ),
    end: zonedMidnight(
      first.getUTCFullYear(),
      first.getUTCMonth() + 2,
      1,
      timeZone,
    ),
  };
}

/** Janela que termina hoje e cobre `days` dias, incluindo o de hoje. */
export function lastDaysRange(
  reference: Date,
  timeZone: string,
  days: number,
): DateRange {
  return {
    start: dayRange(reference, timeZone, -(days - 1)).start,
    end: dayRange(reference, timeZone).end,
  };
}

/** Janela que termina no mês corrente e cobre `months` meses. */
export function lastMonthsRange(
  reference: Date,
  timeZone: string,
  months: number,
): DateRange {
  return {
    start: monthRange(reference, timeZone, -(months - 1)).start,
    end: monthRange(reference, timeZone).end,
  };
}

/** Data de calendário local no formato `AAAA-MM-DD`. */
export function dayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = partsInZone(instant, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Mês de calendário local no formato `AAAA-MM`. */
export function monthKey(instant: Date, timeZone: string): string {
  const { year, month } = partsInZone(instant, timeZone);
  return `${year}-${pad(month)}`;
}

/**
 * Eixo completo do período, em dias.
 *
 * O gráfico precisa dos dias sem venda: plotar só os dias com movimento desenha
 * uma reta entre duas datas distantes, e uma queda é lida como estabilidade.
 */
export function eachDayKey(range: DateRange, timeZone: string): string[] {
  const keys: string[] = [];
  const { year, month, day } = partsInZone(range.start, timeZone);

  for (let index = 0; ; index += 1) {
    const cursor = new Date(Date.UTC(year, month - 1, day + index));
    const midnight = zonedMidnight(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      timeZone,
    );
    if (midnight >= range.end) break;
    keys.push(dayKey(midnight, timeZone));
  }

  return keys;
}

/** Eixo completo do período, em meses. */
export function eachMonthKey(range: DateRange, timeZone: string): string[] {
  const keys: string[] = [];
  const { year, month } = partsInZone(range.start, timeZone);

  for (let index = 0; ; index += 1) {
    const cursor = new Date(Date.UTC(year, month - 1 + index, 1));
    const midnight = zonedMidnight(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      1,
      timeZone,
    );
    if (midnight >= range.end) break;
    keys.push(monthKey(midnight, timeZone));
  }

  return keys;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
