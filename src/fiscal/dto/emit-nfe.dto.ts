import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EmitNfeDto {
  @ApiProperty({ description: 'ID da venda concluída' })
  @IsUUID()
  saleId: string;

  @ApiPropertyOptional({
    description: 'Estabelecimento emitente. Padrão: o da venda',
  })
  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @ApiProperty({
    description:
      'Venda para consumo do destinatário (true) ou para revenda (false). ' +
      'Não tem padrão: o mesmo produto muda conforme o destino da mercadoria, ' +
      'e quem sabe é quem lançou a venda.',
  })
  @IsBoolean()
  consumidorFinal: boolean;

  @ApiPropertyOptional({
    description: 'Natureza da operação. Padrão: "VENDA DE MERCADORIA"',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  naturezaOperacao?: string;

  @ApiPropertyOptional({
    description:
      'Indicador de presença: 0 não se aplica, 1 presencial, 2 internet, ' +
      '3 teleatendimento, 4 entrega em domicílio, 5 presencial fora do ' +
      'estabelecimento, 9 outros. Padrão: 1',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  presenca?: number;

  @ApiPropertyOptional({ description: 'Transporte e volumes' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NfeTransporteDto)
  transporte?: NfeTransporteDto;

  @ApiPropertyOptional({ description: 'Fatura e duplicatas da venda a prazo' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NfeCobrancaDto)
  cobranca?: NfeCobrancaDto;

  @ApiPropertyOptional({ description: 'Chave de idempotência' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class NfeTransporteDto {
  @ApiProperty({
    description:
      'Modalidade do frete: 0 remetente, 1 destinatário, 2 terceiros, ' +
      '3 próprio do remetente, 4 próprio do destinatário, 9 sem transporte',
  })
  @IsInt()
  @Min(0)
  @Max(9)
  modalidade: number;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NfeTransportadoraDto)
  transportadora?: NfeTransportadoraDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NfeVeiculoDto)
  veiculo?: NfeVeiculoDto;

  @ApiPropertyOptional({ type: () => [NfeVolumeDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NfeVolumeDto)
  volumes?: NfeVolumeDto[];
}

export class NfeTransportadoraDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inscricaoEstadual?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf?: string;
}

export class NfeVeiculoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  placa: string;

  @ApiProperty({ maxLength: 2 })
  @IsString()
  @MaxLength(2)
  uf: string;

  @ApiPropertyOptional({ description: 'Registro Nacional de Transportador' })
  @IsOptional()
  @IsString()
  rntc?: string;
}

export class NfeVolumeDto {
  @ApiPropertyOptional({ description: 'Quantidade de volumes (inteira)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantidade?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  especie?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marca?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  numeracao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  pesoLiquido?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  pesoBruto?: number;
}

export class NfeCobrancaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  numeroFatura?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  valorOriginal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  valorDesconto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  valorLiquido?: number;

  @ApiPropertyOptional({ type: () => [NfeDuplicataDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NfeDuplicataDto)
  duplicatas?: NfeDuplicataDto[];
}

export class NfeDuplicataDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  numero: string;

  @ApiProperty({ description: 'Vencimento no formato aaaa-MM-dd' })
  @IsString()
  @IsNotEmpty()
  vencimento: string;

  @ApiProperty()
  @Min(0.01)
  valor: number;
}
