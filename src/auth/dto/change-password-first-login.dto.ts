import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordFirstLoginDto {
  @ApiProperty({
    example: 'SenhaAntiga123',
    description: 'Senha atual do usuário',
  })
  @IsString({ message: 'Senha atual deve ser uma string' })
  currentPassword: string;

  @ApiProperty({
    example: 'NovaSenha@123',
    description:
      'Nova senha (mínimo 8 caracteres, com maiúscula, minúscula e dígito)',
  })
  @IsString({ message: 'Nova senha deve ser uma string' })
  @MinLength(8, { message: 'Nova senha deve ter no mínimo 8 caracteres' })
  @Matches(/[A-Z]/, {
    message: 'Nova senha deve conter pelo menos uma letra maiúscula',
  })
  @Matches(/[a-z]/, {
    message: 'Nova senha deve conter pelo menos uma letra minúscula',
  })
  @Matches(/[0-9]/, {
    message: 'Nova senha deve conter pelo menos um dígito',
  })
  newPassword: string;

  @ApiProperty({
    example: 'NovaSenha@123',
    description: 'Confirmação da nova senha',
  })
  @IsString({ message: 'Confirmação de senha deve ser uma string' })
  confirmPassword: string;
}
