import { buildFiscalStorageKey, isFiscalStorageKey } from './fiscal-storage';

describe('fiscal-storage', () => {
  const chaveAcesso = '3'.repeat(44);

  it('organiza o arquivo por empresa, ano e mês da autorização', () => {
    const key = buildFiscalStorageKey(
      'company-1',
      chaveAcesso,
      'xml',
      new Date('2026-08-04T12:00:00'),
    );

    expect(key).toBe(`fiscal/company-1/2026/08/${chaveAcesso}.xml`);
  });

  it('usa a extensão pdf para o DANFE', () => {
    const key = buildFiscalStorageKey(
      'company-1',
      chaveAcesso,
      'pdf',
      new Date('2026-01-15T12:00:00'),
    );

    expect(key).toBe(`fiscal/company-1/2026/01/${chaveAcesso}.pdf`);
  });

  it('aceita sufixo para arquivos derivados', () => {
    const key = buildFiscalStorageKey(
      'company-1',
      chaveAcesso,
      'xml',
      new Date('2026-08-04T12:00:00'),
      'cancelamento',
    );

    expect(key).toBe(
      `fiscal/company-1/2026/08/${chaveAcesso}-cancelamento.xml`,
    );
  });

  it('distingue chave do storage de conteúdo gravado na coluna', () => {
    expect(
      isFiscalStorageKey(`fiscal/company-1/2026/08/${chaveAcesso}.xml`),
    ).toBe(true);
    expect(isFiscalStorageKey('<?xml version="1.0"?><nfeProc/>')).toBe(false);
  });
});
