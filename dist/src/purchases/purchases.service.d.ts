import { Purchase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { FilterPurchaseDto } from './dto/filter-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
export declare class PurchasesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(companyId: string, dto: CreatePurchaseDto): Promise<Purchase>;
    findAll(companyId: string, filter: FilterPurchaseDto): Promise<{
        data: Purchase[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string, companyId: string): Promise<Purchase>;
    update(id: string, companyId: string, dto: UpdatePurchaseDto): Promise<Purchase>;
    confirm(id: string, companyId: string): Promise<Purchase>;
    cancel(id: string, companyId: string): Promise<Purchase>;
    remove(id: string, companyId: string): Promise<void>;
}
