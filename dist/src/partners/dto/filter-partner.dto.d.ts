import { PartnerType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
export declare class FilterPartnerDto extends PaginationDto {
    type?: PartnerType;
}
