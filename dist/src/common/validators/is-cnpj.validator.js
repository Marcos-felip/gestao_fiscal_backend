"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsCnpj = IsCnpj;
const class_validator_1 = require("class-validator");
const cpf_cnpj_validator_1 = require("cpf-cnpj-validator");
function IsCnpj(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isCnpj',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value) {
                    return typeof value === 'string' && cpf_cnpj_validator_1.cnpj.isValid(value);
                },
                defaultMessage() {
                    return 'CNPJ inválido';
                },
            },
        });
    };
}
//# sourceMappingURL=is-cnpj.validator.js.map