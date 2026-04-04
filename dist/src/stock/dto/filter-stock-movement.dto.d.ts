import { StockMovementType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class FilterStockMovementDto extends PaginationDto {
    productId?: string;
    type?: StockMovementType;
    startDate?: string;
    endDate?: string;
}
