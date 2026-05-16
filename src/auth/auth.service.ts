import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ChangePasswordFirstLoginDto } from './dto/change-password-first-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
      },
    });

    return this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.companyActiveId,
      user.forcePasswordChange,
    );
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.companyActiveId,
      user.forcePasswordChange,
    );
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Token de atualização inválido');
    }

    const tokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!tokenValid) {
      throw new UnauthorizedException('Token de atualização inválido');
    }

    return this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.companyActiveId,
      user.forcePasswordChange,
    );
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async changePasswordFirstLogin(
    userId: string,
    dto: ChangePasswordFirstLoginDto,
  ) {
    // Buscar usuário
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Validar senha atual
    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    // Validar que newPassword e confirmPassword conferem
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('As senhas não conferem');
    }

    // Validar que nova senha é diferente da atual
    const samePassword = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );
    if (samePassword) {
      throw new BadRequestException(
        'A nova senha não pode ser igual à senha atual',
      );
    }

    // Hash da nova senha
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    // Atualizar usuário
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        forcePasswordChange: false,
        passwordChangedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        forcePasswordChange: true,
        passwordChangedAt: true,
      },
    });

    return updatedUser;
  }

  private async generateTokens(
    userId: string,
    email: string,
    name: string,
    companyActiveId: string | null,
    forcePasswordChange: boolean = false,
  ): Promise<AuthResponseDto> {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET', 'default_secret'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'default_refresh_secret',
        ),
        expiresIn: '7d',
      }),
    ]);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });

    // Buscar o role do membership ativo
    let role: string | null = null;
    if (companyActiveId) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          userId,
          companyId: companyActiveId,
          deletedAt: null,
        },
        select: { role: true },
      });
      role = membership?.role ?? null;
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        name,
        email,
        companyActiveId,
        role,
        forcePasswordChange,
      },
    };
  }
}
