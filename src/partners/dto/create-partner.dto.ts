import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
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

  @ApiPropertyOptional({
    description:
      'Código IBGE do município (7 dígitos). Obrigatório para receber NF-e — ' +
      'é o campo cMun do destinatário.',
    example: '3143302',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, { message: 'Código IBGE deve ter 7 dígitos' })
  ibgeCode?: string;

  @ApiPropertyOptional({
    description:
      'Indicador de inscrição estadual na NF-e: 1 contribuinte, 2 isento de ' +
      'inscrição, 9 não contribuinte. Não se deduz do tipo de pessoa — ' +
      'prestadora de serviço é pessoa jurídica e não é contribuinte de ICMS.',
    enum: [1, 2, 9],
  })
  @IsOptional()
  @IsIn([1, 2, 9], {
    message:
      'Indicador de IE deve ser 1 (contribuinte), 2 (isento) ou 9 (não contribuinte)',
  })
  indIeDest?: number;
}
