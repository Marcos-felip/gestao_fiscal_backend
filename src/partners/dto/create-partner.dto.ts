import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerType, PersonType } from '@prisma/client';
import { IsCpfOrCnpj } from '../../common/validators/is-cpf-or-cnpj.validator';

export class CreatePartnerDto {
  @ApiProperty({ enum: PartnerType })
  @IsEnum(PartnerType)
  type: PartnerType;

  @ApiProperty({ enum: PersonType })
  @IsEnum(PersonType)
  personType: PersonType;

  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCpfOrCnpj()
  cpfCnpj?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rgIe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cep?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ maxLength: 2 })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;
}
