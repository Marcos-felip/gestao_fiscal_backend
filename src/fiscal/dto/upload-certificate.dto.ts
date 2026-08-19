import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadCertificateDto {
  @ApiProperty({
    description: 'Senha do certificado digital A1 (.pfx)',
    example: 'senha-do-certificado',
  })
  @IsString({ message: 'A senha do certificado deve ser um texto' })
  @IsNotEmpty({ message: 'Informe a senha do certificado digital' })
  senha!: string;
}
