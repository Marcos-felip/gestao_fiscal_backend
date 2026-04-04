import { CreateSaleItemDto } from './create-sale-item.dto';
export declare class CreateSaleDto {
    establishmentId: string;
    clientId?: string;
    items: CreateSaleItemDto[];
    discount?: number;
    notes?: string;
    saleDate?: string;
}
