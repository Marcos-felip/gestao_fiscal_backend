import { Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
export declare class ProductsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(companyId: string, pagination: PaginationDto): Promise<{
        data: Product[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string, companyId: string): Promise<Product>;
    create(companyId: string, dto: CreateProductDto): Promise<Product>;
    update(id: string, companyId: string, dto: UpdateProductDto): Promise<Product>;
    remove(id: string, companyId: string): Promise<void>;
}
