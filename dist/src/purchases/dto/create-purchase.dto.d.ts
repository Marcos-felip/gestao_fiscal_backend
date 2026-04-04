import { CreatePurchaseItemDto } from './create-purchase-item.dto';
export declare class CreatePurchaseDto {
    establishmentId: string;
    supplierId?: string;
    items: CreatePurchaseItemDto[];
    notes?: string;
    purchaseDate?: string;
}
