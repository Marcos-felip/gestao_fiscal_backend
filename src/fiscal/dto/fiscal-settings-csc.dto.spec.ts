import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateFiscalSettingsDto } from './create-fiscal-settings.dto';
import { UpdateFiscalSettingsDto } from './update-fiscal-settings.dto';

/**
 * Validação do par CSC/idCSC nos DTOs.
 *
 * Roda `class-validator` diretamente, que é exatamente o que o `ValidationPipe`
 * global faz antes de o controller ser chamado — a mensagem conferida aqui é a
 * mesma que o cliente recebe no corpo do 400.
 */

/** CSC no formato que MG emite: 32 caracteres hexadecimais. Valor fictício. */
const CSC_VALIDO = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';

const erros = (
  Dto: typeof CreateFiscalSettingsDto | typeof UpdateFiscalSettingsDto,
  payload: Record<string, unknown>,
) =>
  validateSync(plainToInstance(Dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

const mensagens = (
  Dto: typeof CreateFiscalSettingsDto | typeof UpdateFiscalSettingsDto,
  payload: Record<string, unknown>,
) =>
  erros(Dto, payload)
    .flatMap((erro) => Object.values(erro.constraints ?? {}))
    .join(' | ');

describe.each([
  ['CreateFiscalSettingsDto', CreateFiscalSettingsDto],
  ['UpdateFiscalSettingsDto', UpdateFiscalSettingsDto],
] as const)('%s — CSC e idCSC', (_nome, Dto) => {
  it('aceita o par no formato correto', () => {
    expect(erros(Dto, { codigoCsc: CSC_VALIDO, idCsc: '000001' })).toEqual([]);
  });

  it('aceita o par ausente — a configuração pode ser preenchida em etapas', () => {
    expect(erros(Dto, {})).toEqual([]);
  });

  // O CSC de 6 dígitos é o caso real que gerou a rejeição 464 em 10/08/2026.
  it('recusa CSC de 6 dígitos', () => {
    const resultado = erros(Dto, { codigoCsc: '123456' });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].property).toBe('codigoCsc');
  });

  it('recusa CSC acima de 64 caracteres', () => {
    expect(erros(Dto, { codigoCsc: 'a'.repeat(65) })).toHaveLength(1);
  });

  it('recusa CSC com hífen', () => {
    expect(erros(Dto, { codigoCsc: 'ABCD-EFGH-IJKL-MNOP-QRST' })).toHaveLength(
      1,
    );
  });

  it('recusa idCSC com letras', () => {
    const resultado = erros(Dto, { idCsc: 'ABC' });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].property).toBe('idCsc');
  });

  it('recusa idCSC com 7 dígitos', () => {
    expect(erros(Dto, { idCsc: '1234567' })).toHaveLength(1);
  });

  it('explica em português onde obter o CSC', () => {
    const texto = mensagens(Dto, { codigoCsc: '123456' });

    expect(texto).toMatch(/portal da SEFAZ/i);
    expect(texto).toMatch(/ID do CSC/i);
  });

  it('explica em português o que é o ID do CSC', () => {
    expect(mensagens(Dto, { idCsc: 'ABC' })).toMatch(/numérico/i);
  });

  it('não devolve o valor do CSC na mensagem de erro', () => {
    expect(mensagens(Dto, { codigoCsc: 'SEGREDO123' })).not.toContain(
      'SEGREDO123',
    );
  });
});
