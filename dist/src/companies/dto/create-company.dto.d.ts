import { CompanyType } from '@prisma/client';
export declare class CreateCompanyDto {
    name: string;
    type?: CompanyType;
    phone?: string;
}
