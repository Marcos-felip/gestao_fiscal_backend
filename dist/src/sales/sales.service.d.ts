import { Sale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
export declare class SalesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(companyId: string, dto: CreateSaleDto): Promise<Sale>;
    findAll(companyId: string, filter: FilterSaleDto): Promise<{
        data: Sale[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string, companyId: string): Promise<Sale>;
    update(id: string, companyId: string, dto: UpdateSaleDto): Promise<Sale>;
    confirm(id: string, companyId: string): Promise<Sale>;
    cancel(id: string, companyId: string): Promise<Sale>;
    remove(id: string, companyId: string): Promise<void>;
}
