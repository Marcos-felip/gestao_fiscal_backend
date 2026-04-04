"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsCpf = IsCpf;
const class_validator_1 = require("class-validator");
const cpf_cnpj_validator_1 = require("cpf-cnpj-validator");
function IsCpf(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isCpf',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value) {
                    return typeof value === 'string' && cpf_cnpj_validator_1.cpf.isValid(value);
                },
                defaultMessage() {
                    return 'CPF inválido';
                },
            },
        });
    };
}
//# sourceMappingURL=is-cpf.validator.js.map