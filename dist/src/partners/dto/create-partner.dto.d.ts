import { PartnerType, PersonType } from '@prisma/client';
export declare class CreatePartnerDto {
    type: PartnerType;
    personType: PersonType;
    name: string;
    tradeName?: string;
    cpfCnpj?: string;
    rgIe?: string;
    email?: string;
    phone?: string;
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
}
