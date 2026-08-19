import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetItemProductDto {
  @ApiProperty({
    description: 'Produto do catálogo a que este item corresponde',
  })
  @IsUUID()
  productId: string;
}
