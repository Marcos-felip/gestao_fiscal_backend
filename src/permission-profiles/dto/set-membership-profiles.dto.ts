import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class SetMembershipProfilesDto {
  @ApiProperty({
    type: [String],
    example: ['3f0c1b8e-4a1d-4f9a-9a2f-1b7f6c1a2d34'],
    description:
      'Substitui integralmente o conjunto de perfis do membro. Envie [] para desvincular todos',
  })
  @IsArray({ message: 'profileIds deve ser uma lista' })
  @IsUUID('4', { each: true, message: 'Cada perfil deve ser um UUID válido' })
  profileIds: string[];
}
