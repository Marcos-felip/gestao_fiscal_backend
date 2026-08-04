import { registerDecorator, ValidationOptions } from 'class-validator';

/** Siglas das 27 unidades federativas. */
export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

/** Aceita a sigla em qualquer caixa, com espaços em volta. */
export function isUf(valor?: string | null): boolean {
  const sigla = (valor ?? '').trim().toUpperCase();
  return (UFS as readonly string[]).includes(sigla);
}

export function IsUf(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isUf(value);
        },
        defaultMessage() {
          return 'UF inválida. Informe uma das 27 siglas (ex.: SP, MG, BA)';
        },
      },
    });
  };
}
