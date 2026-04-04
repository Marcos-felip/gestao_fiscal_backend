import { UnitOfMeasure } from '@prisma/client';
export declare class CreateProductDto {
    name: string;
    description?: string;
    sku?: string;
    barcode?: string;
    unit?: UnitOfMeasure;
    costPrice?: number;
    salePrice?: number;
    minStock?: number;
    ncm?: string;
    cest?: string;
    cfop?: string;
    origin?: number;
}
