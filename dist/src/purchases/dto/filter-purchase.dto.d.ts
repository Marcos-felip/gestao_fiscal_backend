import { PurchaseStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class FilterPurchaseDto extends PaginationDto {
    status?: PurchaseStatus;
    supplierId?: string;
    startDate?: string;
    endDate?: string;
}
