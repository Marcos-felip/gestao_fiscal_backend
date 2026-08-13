import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FiscalService } from './fiscal.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from './certificates/fiscal-certificate.service';
import { danfeFormato } from './emission/fiscal-storage';

/**
 * O DANFE da NFC-e é PDF e o da NF-e é HTML. Servir HTML declarando
 * `application/pdf` entrega ao lojista um arquivo que nenhum leitor abre — e o
 * navegador nem tenta, porque acredita no cabeçalho.
 *
 * Foi exatamente o que aconteceu na primeira NF-e autorizada em homologação, em
 * 13/08/2026: o arquivo saiu como `danfe-….pdf` com HTML dentro.
 */

const mockPrisma = {
  fiscalDocument: { findFirst: jest.fn() },
  fiscalDocumentEvent: { create: jest.fn() },
};

const mockStorage = { downloadBuffer: jest.fn() };

describe('danfeFormato', () => {
  it('reconhece o HTML declarado pelo motor', () => {
    expect(danfeFormato('text/html; charset=utf-8')).toEqual({
      extensao: 'html',
      mime: 'text/html; charset=utf-8',
    });
  });

  it('trata ausência de declaração como PDF, que é o caso da NFC-e', () => {
    expect(danfeFormato(undefined)).toEqual({
      extensao: 'pdf',
      mime: 'application/pdf',
    });
  });

  it('trata declaração explícita de PDF como PDF', () => {
    expect(danfeFormato('application/pdf').extensao).toBe('pdf');
  });
});

describe('FiscalService.getDanfe — formato servido', () => {
  let service: FiscalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: DfeNetFiscalEngine, useValue: {} },
        { provide: FiscalCertificateService, useValue: {} },
      ],
    }).compile();

    service = module.get(FiscalService);
    jest.clearAllMocks();
    mockPrisma.fiscalDocumentEvent.create.mockResolvedValue({});
    mockStorage.downloadBuffer.mockResolvedValue(Buffer.from('<html></html>'));
  });

  it('serve o DANFE da NF-e como HTML', async () => {
    mockPrisma.fiscalDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      chaveAcesso: '3126…',
      danfeUrl: 'fiscal/comp-1/2026/08/3126.html',
    });

    const danfe = await service.getDanfe('doc-1', 'comp-1');

    expect(danfe.contentType).toBe('text/html; charset=utf-8');
    expect(danfe.extensao).toBe('html');
  });

  it('serve o DANFE da NFC-e como PDF', async () => {
    mockPrisma.fiscalDocument.findFirst.mockResolvedValue({
      id: 'doc-2',
      chaveAcesso: '3126…',
      danfeUrl: 'fiscal/comp-1/2026/08/3126.pdf',
    });

    const danfe = await service.getDanfe('doc-2', 'comp-1');

    expect(danfe.contentType).toBe('application/pdf');
    expect(danfe.extensao).toBe('pdf');
  });

  it('assume PDF quando o DANFE está gravado na coluna, sem chave de storage', async () => {
    // Sem storage não há extensão para consultar — e só a NFC-e existia nessa
    // época, então PDF é o único formato possível ali.
    mockPrisma.fiscalDocument.findFirst.mockResolvedValue({
      id: 'doc-3',
      chaveAcesso: '3126…',
      danfeUrl: Buffer.from('%PDF-1.4').toString('base64'),
    });

    const danfe = await service.getDanfe('doc-3', 'comp-1');

    expect(danfe.contentType).toBe('application/pdf');
    expect(mockStorage.downloadBuffer).not.toHaveBeenCalled();
  });
});
