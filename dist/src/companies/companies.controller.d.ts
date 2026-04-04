import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OnboardingDto } from './dto/onboarding.dto';
export declare class CompaniesController {
    private readonly companiesService;
    constructor(companiesService: CompaniesService);
    create(user: {
        id: string;
        email: string;
    }, dto: CreateCompanyDto): Promise<{
        company: {
            type: import("@prisma/client").$Enums.CompanyType | null;
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            phone: string | null;
            cnpj: string | null;
            taxRegime: import("@prisma/client").$Enums.TaxRegime | null;
            isOnboarded: boolean;
        };
        membership: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            companyId: string;
            userId: string;
            role: import("@prisma/client").$Enums.MembershipRole;
        };
    }>;
    findAll(user: {
        id: string;
        email: string;
    }): Promise<({
        memberships: {
            role: import("@prisma/client").$Enums.MembershipRole;
        }[];
    } & {
        type: import("@prisma/client").$Enums.CompanyType | null;
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        phone: string | null;
        cnpj: string | null;
        taxRegime: import("@prisma/client").$Enums.TaxRegime | null;
        isOnboarded: boolean;
    })[]>;
    findOne(id: string, companyId: string): Promise<{
        type: import("@prisma/client").$Enums.CompanyType | null;
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        phone: string | null;
        cnpj: string | null;
        taxRegime: import("@prisma/client").$Enums.TaxRegime | null;
        isOnboarded: boolean;
    }>;
    onboard(companyId: string, dto: OnboardingDto): Promise<{
        type: import("@prisma/client").$Enums.CompanyType | null;
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        phone: string | null;
        cnpj: string | null;
        taxRegime: import("@prisma/client").$Enums.TaxRegime | null;
        isOnboarded: boolean;
    }>;
    update(id: string, companyId: string, dto: UpdateCompanyDto): Promise<{
        type: import("@prisma/client").$Enums.CompanyType | null;
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        phone: string | null;
        cnpj: string | null;
        taxRegime: import("@prisma/client").$Enums.TaxRegime | null;
        isOnboarded: boolean;
    }>;
}
