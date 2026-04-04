import { StockMovementType } from '@prisma/client';
export declare class CreateStockMovementDto {
    productId: string;
    type: StockMovementType;
    quantity: number;
    reason?: string;
}
