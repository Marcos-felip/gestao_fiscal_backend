import { StockService } from './stock.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { FilterStockMovementDto } from './dto/filter-stock-movement.dto';
export declare class StockController {
    private readonly stockService;
    constructor(stockService: StockService);
    createMovement(companyId: string, dto: CreateStockMovementDto): Promise<{
        type: import("@prisma/client").$Enums.StockMovementType;
        id: string;
        createdAt: Date;
        deletedAt: Date | null;
        companyId: string;
        productId: string;
        quantity: import("@prisma/client-runtime-utils").Decimal;
        reason: string | null;
        referenceId: string | null;
    }>;
    findAll(companyId: string, filter: FilterStockMovementDto): Promise<{
        data: import("@prisma/client").StockMovement[];
        total: number;
        page: number;
        limit: number;
    }>;
}
