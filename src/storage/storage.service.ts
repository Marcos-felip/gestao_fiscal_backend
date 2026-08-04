import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

/**
 * Wrapper para o cliente S3 (Supabase Storage usa API compatível com S3).
 *
 * Variáveis de ambiente:
 * - S3_ENDPOINT: URL do endpoint (ex: https://<project>.supabase.co/storage/v1/s3)
 * - S3_ACCESS_KEY_ID: Access key ID
 * - S3_SECRET_ACCESS_KEY: Secret access key
 * - S3_REGION: Região (ex: us-east-1)
 * - S3_BUCKET: Nome do bucket (default: fiscal-documents)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket =
      this.configService.get<string>('S3_BUCKET') || 'fiscal-documents';

    this.client = new S3Client({
      endpoint: this.configService.get<string>('S3_ENDPOINT'),
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get<string>(
          'S3_SECRET_ACCESS_KEY',
          '',
        ),
      },
      forcePathStyle: true,
    });
  }

  /**
   * Faz upload de um conteúdo para o storage.
   *
   * @param key Caminho completo do objeto (ex: xml/2026/08/documento.xml)
   * @param body Conteúdo do arquivo (string, Buffer ou stream)
   * @param contentType MIME type do arquivo
   * @returns URL pública do objeto armazenado
   */
  async upload(
    key: string,
    body: string | Buffer | Readable,
    contentType: string,
  ): Promise<string> {
    this.logger.log(`Upload: ${key} (${contentType})`);

    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    };

    await this.client.send(new PutObjectCommand(params));

    const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
    return `${endpoint}/${this.bucket}/${key}`;
  }

  /**
   * Faz download de um conteúdo do storage.
   *
   * @param key Caminho completo do objeto
   * @returns Conteúdo como string
   */
  async download(key: string): Promise<string> {
    this.logger.log(`Download: ${key}`);

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Objeto não encontrado: ${key}`);
    }

    // Converte o stream para string
    const stream = response.Body as Readable;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Verifica se o serviço de storage está configurado e acessível.
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>('S3_ENDPOINT');
  }
}
