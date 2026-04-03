import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwtService = {
  signAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test_secret'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create user with hashed password and return tokens', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        companyActiveId: null,
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('access_token')
        .mockResolvedValueOnce('refresh_token');
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@example.com', deletedAt: null },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      const createCall = mockPrismaService.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('test@example.com');
      expect(createCall.data.name).toBe('Test User');
      expect(createCall.data.passwordHash).toBeDefined();
      expect(result.accessToken).toBe('access_token');
      expect(result.refreshToken).toBe('refresh_token');
      expect(result.user.id).toBe('user-1');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('password123', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        companyActiveId: null,
        passwordHash,
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('access_token')
        .mockResolvedValueOnce('refresh_token');
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('access_token');
      expect(result.refreshToken).toBe('refresh_token');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const passwordHash = await bcrypt.hash('correctpassword', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        companyActiveId: null,
        passwordHash,
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should return new token pair on valid refresh token', async () => {
      const refreshTokenHash = await bcrypt.hash('valid_refresh_token', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        companyActiveId: null,
        refreshToken: refreshTokenHash,
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('new_access_token')
        .mockResolvedValueOnce('new_refresh_token');
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.refreshTokens('user-1', 'valid_refresh_token');

      expect(result.accessToken).toBe('new_access_token');
      expect(result.refreshToken).toBe('new_refresh_token');
    });

    it('should throw UnauthorizedException if user has no stored refresh token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        refreshToken: null,
      });

      await expect(
        service.refreshTokens('user-1', 'some_token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if refresh token does not match', async () => {
      const refreshTokenHash = await bcrypt.hash('correct_token', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        companyActiveId: null,
        refreshToken: refreshTokenHash,
      });

      await expect(
        service.refreshTokens('user-1', 'wrong_token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should set refreshToken to null', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      await service.logout('user-1');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
    });
  });
});
