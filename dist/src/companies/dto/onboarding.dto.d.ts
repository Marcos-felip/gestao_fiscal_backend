import { TaxRegime } from '@prisma/client';
export declare class OnboardingDto {
    cnpj: string;
    taxRegime: TaxRegime;
    phone?: string;
    establishmentName: string;
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
