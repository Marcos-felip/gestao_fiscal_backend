import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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

  describe('changePasswordFirstLogin', () => {
    it('should successfully change password and set forcePasswordChange to false', async () => {
      const currentPasswordHash = await bcrypt.hash('OldPassword123', 12);
      const newPassword = 'NewPassword123';

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: currentPasswordHash,
        forcePasswordChange: true,
      });

      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        forcePasswordChange: false,
        passwordChangedAt: new Date(),
      });

      const result = await service.changePasswordFirstLogin('user-1', {
        currentPassword: 'OldPassword123',
        newPassword,
        confirmPassword: newPassword,
      });

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
      });
      expect(result.forcePasswordChange).toBe(false);
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      const updateCall = mockPrismaService.user.update.mock.calls[0][0];
      expect(updateCall.data.forcePasswordChange).toBe(false);
      expect(updateCall.data.passwordChangedAt).toBeDefined();
    });

    it('should reject if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.changePasswordFirstLogin('user-1', {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if current password is incorrect', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      await expect(
        service.changePasswordFirstLogin('user-1', {
          currentPassword: 'WrongPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject if newPassword and confirmPassword do not match', async () => {
      const passwordHash = await bcrypt.hash('OldPassword123', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      await expect(
        service.changePasswordFirstLogin('user-1', {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'DifferentPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if newPassword is same as currentPassword', async () => {
      const passwordHash = await bcrypt.hash('SamePassword123', 12);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      await expect(
        service.changePasswordFirstLogin('user-1', {
          currentPassword: 'SamePassword123',
          newPassword: 'SamePassword123',
          confirmPassword: 'SamePassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
