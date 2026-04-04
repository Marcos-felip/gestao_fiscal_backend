"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsCpfOrCnpj = IsCpfOrCnpj;
const class_validator_1 = require("class-validator");
const cpf_cnpj_validator_1 = require("cpf-cnpj-validator");
function IsCpfOrCnpj(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isCpfOrCnpj',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value) {
                    if (typeof value !== 'string')
                        return false;
                    return cpf_cnpj_validator_1.cpf.isValid(value) || cpf_cnpj_validator_1.cnpj.isValid(value);
                },
                defaultMessage() {
                    return 'CPF ou CNPJ inválido';
                },
            },
        });
    };
}
//# sourceMappingURL=is-cpf-or-cnpj.validator.js.map