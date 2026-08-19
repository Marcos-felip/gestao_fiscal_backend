import {
  DEFAULT_TIMEZONE,
  businessTimezone,
  dayKey,
  dayRange,
  eachDayKey,
  eachMonthKey,
  lastDaysRange,
  lastMonthsRange,
  monthKey,
  monthRange,
} from './business-day';

const SP = 'America/Sao_Paulo';

describe('business-day', () => {
  const originalTimezone = process.env.APP_TIMEZONE;

  afterEach(() => {
    if (originalTimezone === undefined) {
      delete process.env.APP_TIMEZONE;
    } else {
      process.env.APP_TIMEZONE = originalTimezone;
    }
  });

  describe('businessTimezone', () => {
    it('usa America/Sao_Paulo quando nada é configurado', () => {
      delete process.env.APP_TIMEZONE;
      expect(businessTimezone()).toBe(DEFAULT_TIMEZONE);
    });

    it('falha alto com fuso desconhecido em vez de cair para UTC', () => {
      process.env.APP_TIMEZONE = 'Marte/Olympus_Mons';
      expect(() => businessTimezone()).toThrow(/Fuso horário desconhecido/);
    });
  });

  describe('a venda das 21h continua sendo do dia de hoje', () => {
    // 19/08/2026 21:30 em Brasília já é 20/08 00:30 em UTC. Com fronteira UTC,
    // a loja ainda aberta veria o faturamento do dia zerar.
    const venda = new Date('2026-08-20T00:30:00Z');

    it('classifica o instante no dia local', () => {
      expect(dayKey(venda, SP)).toBe('2026-08-19');
    });

    it('põe a venda dentro do intervalo de hoje', () => {
      const hoje = dayRange(venda, SP);
      expect(venda >= hoje.start).toBe(true);
      expect(venda < hoje.end).toBe(true);
    });

    it('mantém a venda fora do intervalo de ontem', () => {
      const ontem = dayRange(venda, SP, -1);
      expect(venda >= ontem.end).toBe(true);
    });

    it('abre e fecha o dia na meia-noite local, não na de UTC', () => {
      const hoje = dayRange(venda, SP);
      expect(hoje.start.toISOString()).toBe('2026-08-19T03:00:00.000Z');
      expect(hoje.end.toISOString()).toBe('2026-08-20T03:00:00.000Z');
    });
  });

  describe('monthRange', () => {
    it('começa na meia-noite local do dia 1º', () => {
      const range = monthRange(new Date('2026-08-19T14:00:00Z'), SP);
      expect(range.start.toISOString()).toBe('2026-08-01T03:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    });

    it('atravessa a virada do ano no mês anterior', () => {
      const range = monthRange(new Date('2026-01-10T14:00:00Z'), SP, -1);
      expect(monthKey(range.start, SP)).toBe('2025-12');
      expect(range.end.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    });

    it('inclui uma venda do último instante do mês local', () => {
      // 31/08/2026 23:59 em Brasília é 01/09 02:59 em UTC.
      const venda = new Date('2026-09-01T02:59:00Z');
      const agosto = monthRange(new Date('2026-08-15T12:00:00Z'), SP);
      expect(venda < agosto.end).toBe(true);
    });
  });

  describe('eixos do gráfico', () => {
    const agora = new Date('2026-08-19T14:00:00Z');

    it('devolve 30 dias terminando em hoje', () => {
      const eixo = eachDayKey(lastDaysRange(agora, SP, 30), SP);
      expect(eixo).toHaveLength(30);
      expect(eixo[0]).toBe('2026-07-21');
      expect(eixo[29]).toBe('2026-08-19');
    });

    it('devolve 12 meses terminando no mês corrente', () => {
      const eixo = eachMonthKey(lastMonthsRange(agora, SP, 12), SP);
      expect(eixo).toHaveLength(12);
      expect(eixo[0]).toBe('2025-09');
      expect(eixo[11]).toBe('2026-08');
    });

    it('não repete nem pula chave ao atravessar a virada do mês', () => {
      const eixo = eachDayKey(lastDaysRange(agora, SP, 30), SP);
      expect(new Set(eixo).size).toBe(eixo.length);
      expect(eixo).toContain('2026-07-31');
      expect(eixo).toContain('2026-08-01');
    });
  });

  describe('fuso com horário de verão', () => {
    // Nova York muda a hora; o utilitário não pode errar por uma hora nem
    // produzir dia de 23 ou 25 horas no eixo.
    const NY = 'America/New_York';

    it('mantém a meia-noite local na virada do horário de verão', () => {
      const range = dayRange(new Date('2026-03-08T18:00:00Z'), NY, 0);
      expect(dayKey(range.start, NY)).toBe('2026-03-08');
      expect(dayKey(new Date(range.end.getTime() - 1), NY)).toBe('2026-03-08');
    });

    it('gera um eixo sem chave repetida na semana da virada', () => {
      const eixo = eachDayKey(
        lastDaysRange(new Date('2026-03-10T18:00:00Z'), NY, 7),
        NY,
      );
      expect(eixo).toHaveLength(7);
      expect(new Set(eixo).size).toBe(7);
      expect(eixo).toContain('2026-03-08');
    });
  });
});
