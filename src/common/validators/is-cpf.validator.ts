import { registerDecorator, ValidationOptions } from 'class-validator';
import { cpf } from 'cpf-cnpj-validator';

export function IsCpf(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && cpf.isValid(value);
        },
        defaultMessage() {
          return 'CPF inválido';
        },
      },
    });
  };
}
