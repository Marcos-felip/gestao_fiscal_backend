import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CertificateCryptoService } from './certificate-crypto.service';
import { FiscalCertificateService } from './fiscal-certificate.service';
import { parsePfx } from './certificate-parser';

jest.mock('./certificate-parser');

const parsePfxMock = parsePfx as jest.MockedFunction<typeof parsePfx>;

const mockPrismaService = {
  fiscalSettings: { findFirst: jest.fn(), update: jest.fn() },
  fiscalCertificateEvent: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockCrypto = {
  isConfigured: jest.fn(() => true),
  encrypt: jest.fn((value: string | Buffer) =>
    typeof value === 'string' ? `enc(${value})` : `enc(pfx:${value.length})`,
  ),
  decryptToBase64: jest.fn(() => 'pfx-em-base64'),
  decryptToString: jest.fn(() => 'senha-do-certificado'),
};

const amanha = new Date(Date.now() + 86_400_000);
const ontem = new Date(Date.now() - 86_400_000);

const settings = (overrides: Record<string, unknown> = {}) => ({
  id: 'settings-1',
  companyId: 'company-1',
  establishmentId: 'estab-1',
  certificadoRef: null,
  certificadoSenhaRef: null,
  certificadoValidade: null,
  certificadoSubject: null,
  ...overrides,
});

/** Dados do último evento de certificado gravado. */
const eventoRegistrado = (): Record<string, unknown> => {
  const [argumento] = mockPrismaService.fiscalCertificateEvent.create.mock
    .calls[0] as [{ data: Record<string, unknown> }];
  return argumento.data;
};

describe('FiscalCertificateService', () => {
  let service: FiscalCertificateService;
  let tx: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalCertificateService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CertificateCryptoService, useValue: mockCrypto },
      ],
    }).compile();

    service = module.get<FiscalCertificateService>(FiscalCertificateService);

    jest.clearAllMocks();
    mockCrypto.isConfigured.mockReturnValue(true);
    mockCrypto.encrypt.mockImplementation((value: string | Buffer) =>
      typeof value === 'string' ? `enc(${value})` : `enc(pfx:${value.length})`,
    );
    mockCrypto.decryptToBase64.mockReturnValue('pfx-em-base64');
    mockCrypto.decryptToString.mockReturnValue('senha-do-certificado');

    tx = mockPrismaService;
    mockPrismaService.$transaction.mockImplementation(
      (callback: (client: typeof mockPrismaService) => Promise<unknown>) =>
        callback(tx),
    );

    parsePfxMock.mockReturnValue({
      subject: 'CN=EMPRESA TESTE LTDA:11222333000181, C=BR',
      titular: 'EMPRESA TESTE LTDA:11222333000181',
      documento: '11222333000181',
      validoDe: ontem,
      validoAte: amanha,
      emissor: 'CN=AC Teste',
    });
  });

  describe('upload', () => {
    it('cifra certificado e senha e registra o evento de upload', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(settings());

      const result = await service.upload(
        'company-1',
        'estab-1',
        Buffer.alloc(120),
        'senha-do-certificado',
        'user-1',
      );

      expect(mockPrismaService.fiscalSettings.update).toHaveBeenCalledWith({
        where: { id: 'settings-1' },
        data: {
          certificadoRef: 'enc(pfx:120)',
          certificadoSenhaRef: 'enc(senha-do-certificado)',
          certificadoValidade: amanha,
          certificadoSubject: 'CN=EMPRESA TESTE LTDA:11222333000181, C=BR',
        },
      });
      expect(eventoRegistrado()).toMatchObject({
        tipo: 'upload',
        titular: 'EMPRESA TESTE LTDA:11222333000181',
        subjectAnterior: null,
        usuarioId: 'user-1',
      });
      expect(result).toMatchObject({ configurado: true, vencido: false });
    });

    it('registra substituição preservando o subject anterior', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(
        settings({
          certificadoRef: 'enc(anterior)',
          certificadoSubject: 'CN=CERTIFICADO ANTIGO',
        }),
      );

      await service.upload(
        'company-1',
        'estab-1',
        Buffer.alloc(120),
        'senha',
        'user-1',
      );

      expect(eventoRegistrado()).toMatchObject({
        tipo: 'substituicao',
        subjectAnterior: 'CN=CERTIFICADO ANTIGO',
      });
    });

    it('recusa certificado já vencido', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(settings());
      parsePfxMock.mockReturnValue({
        subject: 'CN=EMPRESA VENCIDA',
        titular: 'EMPRESA VENCIDA',
        validoDe: new Date('2020-01-01'),
        validoAte: ontem,
        emissor: 'CN=AC Teste',
      });

      await expect(
        service.upload('company-1', 'estab-1', Buffer.alloc(120), 'senha'),
      ).rejects.toThrow(/vencido/);
      expect(mockPrismaService.fiscalSettings.update).not.toHaveBeenCalled();
    });

    it('recusa arquivo vazio', async () => {
      await expect(
        service.upload('company-1', 'estab-1', Buffer.alloc(0), 'senha'),
      ).rejects.toThrow(BadRequestException);
    });

    it('recusa arquivo acima do limite', async () => {
      await expect(
        service.upload(
          'company-1',
          'estab-1',
          Buffer.alloc(512 * 1024 + 1),
          'senha',
        ),
      ).rejects.toThrow(/limite/);
    });

    it('recusa quando o cofre não está configurado', async () => {
      mockCrypto.isConfigured.mockReturnValue(false);

      await expect(
        service.upload('company-1', 'estab-1', Buffer.alloc(120), 'senha'),
      ).rejects.toThrow(/FISCAL_CERT_ENCRYPTION_KEY/);
    });

    it('exige configuração fiscal do estabelecimento', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(null);

      await expect(
        service.upload('company-1', 'estab-1', Buffer.alloc(120), 'senha'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('loadCredentials', () => {
    it('decripta o certificado para a chamada ao motor', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(
        settings({
          certificadoRef: 'enc(pfx)',
          certificadoSenhaRef: 'enc(senha)',
          certificadoValidade: amanha,
        }),
      );

      const credentials = await service.loadCredentials('company-1', 'estab-1');

      expect(credentials).toEqual({
        certificadoBase64: 'pfx-em-base64',
        certificadoSenha: 'senha-do-certificado',
      });
    });

    it('bloqueia a emissão com certificado vencido', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(
        settings({
          certificadoRef: 'enc(pfx)',
          certificadoSenhaRef: 'enc(senha)',
          certificadoValidade: ontem,
        }),
      );

      await expect(
        service.loadCredentials('company-1', 'estab-1'),
      ).rejects.toThrow(/vencido/);
      expect(mockCrypto.decryptToBase64).not.toHaveBeenCalled();
    });

    it('bloqueia a emissão sem certificado cadastrado', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(settings());

      await expect(
        service.loadCredentials('company-1', 'estab-1'),
      ).rejects.toThrow(/não configurado/);
    });
  });

  describe('getStatus', () => {
    it('informa que não há certificado cadastrado', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(settings());

      await expect(service.getStatus('company-1', 'estab-1')).resolves.toEqual({
        configurado: false,
        vencido: false,
      });
    });

    it('calcula os dias restantes de validade', async () => {
      mockPrismaService.fiscalSettings.findFirst.mockResolvedValue(
        settings({
          certificadoRef: 'enc(pfx)',
          certificadoValidade: new Date(Date.now() + 10 * 86_400_000),
          certificadoSubject: 'CN=EMPRESA TESTE',
        }),
      );

      const status = await service.getStatus('company-1', 'estab-1');

      expect(status.configurado).toBe(true);
      expect(status.vencido).toBe(false);
      expect(status.diasParaVencer).toBe(10);
    });
  });
});
