import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'joao@exemplo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  password: string;
}
