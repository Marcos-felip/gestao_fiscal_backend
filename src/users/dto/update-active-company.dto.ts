import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateActiveCompanyDto {
  @ApiProperty({ example: 'uuid-da-empresa' })
  @IsUUID()
  companyId: string;
}
