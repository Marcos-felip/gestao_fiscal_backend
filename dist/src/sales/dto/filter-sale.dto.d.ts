import { SaleStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class FilterSaleDto extends PaginationDto {
    status?: SaleStatus;
    clientId?: string;
    startDate?: string;
    endDate?: string;
}
