import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IFiscalEngine,
  FiscalEmissionRequest,
  FiscalEmissionResult,
  FiscalConsultationResult,
  FiscalCancellationRequest,
  FiscalCancellationResult,
} from './fiscal-engine.interface';

/**
 * Implementação do motor fiscal que delega a emissão ao microserviço .NET
 * (fiscal_service). Comunicação via HTTP REST.
 *
 * Em desenvolvimento/homologação, se o serviço não estiver rodando, retorna
 * resultados simulados para não bloquear o fluxo do backend.
 */
@Injectable()
export class DfeNetFiscalEngine implements IFiscalEngine {
  private readonly logger = new Logger(DfeNetFiscalEngine.name);
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('FISCAL_ENGINE_URL') ||
      'http://localhost:5000';
    this.timeout =
      this.configService.get<number>('FISCAL_ENGINE_TIMEOUT') || 30000;
  }

  async emitir(payload: FiscalEmissionRequest): Promise<FiscalEmissionResult> {
    this.logger.log(
      `Enviando NFC-e para emissão: modelo=${payload.modelo}, série=${payload.serie}, número=${payload.numero}`,
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/v1/nfce/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(
          `Motor fiscal retornou erro ${response.status}: ${body}`,
        );
        return {
          success: false,
          status: 'ERRO',
          rejeicaoCodigo: String(response.status),
          rejeicaoMensagem: `Erro na comunicação com o motor fiscal: ${response.status}`,
        };
      }

      const result = (await response.json()) as FiscalEmissionResult;
      this.logger.log(
        `Resultado da emissão: success=${result.success}, status=${result.status}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Falha ao comunicar com o motor fiscal: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        status: 'ERRO',
        rejeicaoCodigo: 'ENGINE_UNREACHABLE',
        rejeicaoMensagem:
          'Motor fiscal indisponível. Tente novamente mais tarde.',
      };
    }
  }

  async consultar(chaveAcesso: string): Promise<FiscalConsultationResult> {
    this.logger.log(`Consultando documento fiscal: ${chaveAcesso}`);

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/nfce/consulta/${chaveAcesso}`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return { status: 'ERRO' };
      }

      return (await response.json()) as FiscalConsultationResult;
    } catch (error) {
      this.logger.error(
        `Falha na consulta: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'ERRO' };
    }
  }

  async cancelar(
    payload: FiscalCancellationRequest,
  ): Promise<FiscalCancellationResult> {
    this.logger.log(`Solicitando cancelamento: chave=${payload.chaveAcesso}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/nfce/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          success: false,
          rejeicaoCodigo: String(response.status),
          rejeicaoMensagem: `Erro no cancelamento: ${body}`,
        };
      }

      return (await response.json()) as FiscalCancellationResult;
    } catch (error) {
      this.logger.error(
        `Falha no cancelamento: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        rejeicaoCodigo: 'ENGINE_UNREACHABLE',
        rejeicaoMensagem: 'Motor fiscal indisponível para cancelamento.',
      };
    }
  }
}
