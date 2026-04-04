import { StockMovement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { FilterStockMovementDto } from './dto/filter-stock-movement.dto';
export declare class StockService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createMovement(companyId: string, dto: CreateStockMovementDto): Promise<StockMovement>;
    findAll(companyId: string, filter: FilterStockMovementDto): Promise<{
        data: StockMovement[];
        total: number;
        page: number;
        limit: number;
    }>;
}
