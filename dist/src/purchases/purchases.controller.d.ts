import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { FilterPurchaseDto } from './dto/filter-purchase.dto';
export declare class PurchasesController {
    private readonly purchasesService;
    constructor(purchasesService: PurchasesService);
    create(companyId: string, dto: CreatePurchaseDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        establishmentId: string;
        notes: string | null;
        status: import("@prisma/client").$Enums.PurchaseStatus;
        totalAmount: import("@prisma/client-runtime-utils").Decimal;
        supplierId: string | null;
        purchaseDate: Date;
        purchaseNumber: number;
    }>;
    findAll(companyId: string, filter: FilterPurchaseDto): Promise<{
        data: import("@prisma/client").Purchase[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string, companyId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        establishmentId: string;
        notes: string | null;
        status: import("@prisma/client").$Enums.PurchaseStatus;
        totalAmount: import("@prisma/client-runtime-utils").Decimal;
        supplierId: string | null;
        purchaseDate: Date;
        purchaseNumber: number;
    }>;
    update(id: string, companyId: string, dto: UpdatePurchaseDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        establishmentId: string;
        notes: string | null;
        status: import("@prisma/client").$Enums.PurchaseStatus;
        totalAmount: import("@prisma/client-runtime-utils").Decimal;
        supplierId: string | null;
        purchaseDate: Date;
        purchaseNumber: number;
    }>;
    confirm(id: string, companyId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        establishmentId: string;
        notes: string | null;
        status: import("@prisma/client").$Enums.PurchaseStatus;
        totalAmount: import("@prisma/client-runtime-utils").Decimal;
        supplierId: string | null;
        purchaseDate: Date;
        purchaseNumber: number;
    }>;
    cancel(id: string, companyId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        companyId: string;
        establishmentId: string;
        notes: string | null;
        status: import("@prisma/client").$Enums.PurchaseStatus;
        totalAmount: import("@prisma/client-runtime-utils").Decimal;
        supplierId: string | null;
        purchaseDate: Date;
        purchaseNumber: number;
    }>;
    remove(id: string, companyId: string): Promise<void>;
}
