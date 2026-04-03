import { registerDecorator, ValidationOptions } from 'class-validator';
import { cpf, cnpj } from 'cpf-cnpj-validator';

export function IsCpfOrCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpfOrCnpj',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return cpf.isValid(value) || cnpj.isValid(value);
        },
        defaultMessage() {
          return 'CPF ou CNPJ inválido';
        },
      },
    });
  };
}
