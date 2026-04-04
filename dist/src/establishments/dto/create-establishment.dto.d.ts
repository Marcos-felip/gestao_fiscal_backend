import { EstablishmentType } from '@prisma/client';
export declare class CreateEstablishmentDto {
    name: string;
    type: EstablishmentType;
    cnpj?: string;
    inscricaoEstadual?: string;
    inscricaoMunicipal?: string;
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
}
