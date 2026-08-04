import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CancelarNfceRequest,
  CancelarNfceResult,
  ConsultarNfceRequest,
  ConsultarNfceResult,
  EmitirNfceRequest,
  EmitirNfceResult,
  FiscalEngineTransportError,
  FiscalRejeicao,
  IFiscalEngine,
  StatusServicoRequest,
  StatusServicoResult,
} from './fiscal-engine.interface';

/** Rotas do microserviço .NET (sem prefixo de versão). */
const ROUTES = {
  emit: '/api/nfce/emit',
  consulta: '/api/nfce/consulta',
  cancel: '/api/nfce/cancel',
  statusServico: '/api/sefaz/status-servico',
} as const;

/** Resposta HTTP já lida e decodificada. */
interface EngineResponse {
  status: number;
  payload: unknown;
  /** Corpo cru, usado como fallback quando não é JSON */
  raw: string;
}

/**
 * Implementação do motor fiscal que delega a emissão ao microserviço .NET
 * (`fiscal_service`). Comunicação HTTP REST autenticada por `X-Api-Key`.
 *
 * Convenções do motor respeitadas aqui:
 * - todos os verbos são POST (consulta e status também, por causa do certificado);
 * - o certificado vai no corpo de toda requisição — nunca é registrado em log;
 * - HTTP 400 é **rejeição de negócio** (SEFAZ, validação ou certificado inválido)
 *   e vira `sucesso: false`; 401/5xx/rede/timeout são falhas de transporte e
 *   sobem como `FiscalEngineTransportError` para a fila reprocessar.
 */
@Injectable()
export class DfeNetFiscalEngine implements IFiscalEngine {
  private readonly logger = new Logger(DfeNetFiscalEngine.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('FISCAL_ENGINE_URL') ||
      'http://localhost:8080'
    ).replace(/\/+$/, '');
    this.apiKey = this.configService.get<string>('FISCAL_ENGINE_API_KEY') || '';
    this.timeout =
      this.configService.get<number>('FISCAL_ENGINE_TIMEOUT') || 30000;

    if (!this.apiKey) {
      this.logger.warn(
        'FISCAL_ENGINE_API_KEY não configurada — o motor fiscal recusará as chamadas com 401',
      );
    }
  }

  async emitir(request: EmitirNfceRequest): Promise<EmitirNfceResult> {
    this.logger.log(
      `Emitindo NFC-e: série=${request.serie}, número=${request.numero}, ambiente=${request.ambiente}, itens=${request.itens.length}`,
    );

    const response = await this.post(ROUTES.emit, request);

    if (this.isRejected(response)) {
      const rejeicao = this.parseRejeicao(response);
      this.logger.warn(
        `NFC-e rejeitada: série=${request.serie}, número=${request.numero}, código=${rejeicao.codigo}, mensagem=${rejeicao.mensagem}`,
      );
      return { sucesso: false, rejeicao };
    }

    const body = this.asRecord(response);

    const chaveAcesso = this.text(body.chaveAcesso);
    if (!chaveAcesso) {
      throw new FiscalEngineTransportError(
        'Motor fiscal retornou sucesso sem chave de acesso',
        'INVALID_RESPONSE',
        response.status,
      );
    }

    const protocolo = this.text(body.protocolo);
    if (!protocolo) {
      this.logger.warn(
        `NFC-e autorizada sem protocolo no retorno: chave=${chaveAcesso}`,
      );
    }

    this.logger.log(
      `NFC-e autorizada: chave=${chaveAcesso}, protocolo=${protocolo ?? '-'}`,
    );

    return {
      sucesso: true,
      chaveAcesso,
      protocolo,
      xmlAutorizadoBase64: this.text(body.xmlAutorizadoBase64),
      danfeBase64: this.text(body.danfeBase64),
      qrCode: this.text(body.qrCode),
    };
  }

  async consultar(request: ConsultarNfceRequest): Promise<ConsultarNfceResult> {
    this.logger.log(`Consultando NFC-e: chave=${request.chaveAcesso}`);

    const response = await this.post(ROUTES.consulta, request);

    if (this.isRejected(response)) {
      const rejeicao = this.parseRejeicao(response);
      return {
        sucesso: false,
        mensagemErro:
          this.text(this.loose(response).mensagemErro) ?? rejeicao.mensagem,
      };
    }

    const body = this.asRecord(response);

    return {
      sucesso: true,
      status: this.text(body.status),
      protocolo: this.text(body.protocolo),
      xmlConsultaBase64: this.text(body.xmlConsultaBase64),
    };
  }

  async cancelar(request: CancelarNfceRequest): Promise<CancelarNfceResult> {
    this.logger.log(`Cancelando NFC-e: chave=${request.chaveAcesso}`);

    const response = await this.post(ROUTES.cancel, request);

    if (this.isRejected(response)) {
      const rejeicao = this.parseRejeicao(response);
      this.logger.warn(
        `Cancelamento recusado: chave=${request.chaveAcesso}, código=${rejeicao.codigo}, mensagem=${rejeicao.mensagem}`,
      );
      return {
        sucesso: false,
        motivoRejeicao:
          this.text(this.loose(response).motivoRejeicao) ?? rejeicao.mensagem,
      };
    }

    const body = this.asRecord(response);

    return {
      sucesso: true,
      protocolo: this.text(body.protocolo),
      xmlCancelamentoBase64: this.text(body.xmlCancelamentoBase64),
    };
  }

  async statusServico(
    request: StatusServicoRequest,
  ): Promise<StatusServicoResult> {
    this.logger.log(
      `Consultando status da SEFAZ: uf=${request.uf}, ambiente=${request.ambiente}`,
    );

    const response = await this.post(ROUTES.statusServico, request);

    if (response.status === 400) {
      const rejeicao = this.parseRejeicao(response);
      return { disponivel: false, mensagem: rejeicao.mensagem };
    }

    const body = this.asRecord(response);

    return {
      disponivel: body.disponivel === true,
      mensagem: this.text(body.mensagem),
      tempoMedioResposta: this.number(body.tempoMedioResposta),
    };
  }

  // ──────────────────────────────────────────────
  // Transporte
  // ──────────────────────────────────────────────

  /**
   * Executa um POST no motor com timeout e autenticação.
   *
   * Devolve apenas 200 e 400 (rejeição de negócio, tratada por cada método).
   * Qualquer outra situação vira `FiscalEngineTransportError`.
   */
  private async post(path: string, body: unknown): Promise<EngineResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new FiscalEngineTransportError(
          `Motor fiscal não respondeu em ${this.timeout}ms (${path})`,
          'TIMEOUT',
        );
      }
      throw new FiscalEngineTransportError(
        `Falha de comunicação com o motor fiscal (${path}): ${this.describe(error)}`,
        'NETWORK',
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const raw = await response.text().catch(() => '');
    const payload = this.parseJson(raw);

    if (response.status === 401 || response.status === 403) {
      throw new FiscalEngineTransportError(
        'Motor fiscal recusou a autenticação — verifique FISCAL_ENGINE_API_KEY',
        'AUTH',
        response.status,
        this.errorCode(payload),
      );
    }

    if (response.status !== 200 && response.status !== 400) {
      throw new FiscalEngineTransportError(
        `Motor fiscal retornou HTTP ${response.status} (${path})`,
        'SERVER',
        response.status,
        this.errorCode(payload),
      );
    }

    return { status: response.status, payload, raw };
  }

  // ──────────────────────────────────────────────
  // Parsing / validação da resposta
  // ──────────────────────────────────────────────

  /**
   * Recusa de negócio: HTTP 400 (SEFAZ, validação ou certificado) ou HTTP 200
   * com `sucesso: false`.
   */
  private isRejected(response: EngineResponse): boolean {
    if (response.status === 400) return true;
    return this.asRecord(response).sucesso !== true;
  }

  /** Lê o corpo sem exigir que seja um objeto — usado nos caminhos de recusa. */
  private loose(response: EngineResponse): Record<string, unknown> {
    return this.isRecord(response.payload) ? response.payload : {};
  }

  /** Garante que o corpo é um objeto JSON antes de ler os campos. */
  private asRecord(response: EngineResponse): Record<string, unknown> {
    if (!this.isRecord(response.payload)) {
      throw new FiscalEngineTransportError(
        'Motor fiscal retornou um corpo em formato inesperado',
        'INVALID_RESPONSE',
        response.status,
      );
    }
    return response.payload;
  }

  /**
   * Extrai a rejeição tanto do formato de negócio (`rejeicao{}`) quanto do
   * envelope genérico dos middlewares (`{ codigo, mensagem, erros[] }`).
   */
  private parseRejeicao(response: EngineResponse): FiscalRejeicao {
    const body = this.loose(response);
    const rejeicao = this.isRecord(body.rejeicao) ? body.rejeicao : {};

    const codigo =
      this.text(rejeicao.codigo) ??
      this.text(body.codigo) ??
      `HTTP_${response.status}`;

    const mensagem =
      this.text(rejeicao.mensagem) ??
      this.text(body.mensagem) ??
      this.text(response.raw) ??
      'Motor fiscal recusou a requisição sem detalhar o motivo';

    const retornoTecnico =
      this.text(rejeicao.retornoTecnico) ?? this.formatErros(body.erros);

    return { codigo, mensagem, retornoTecnico };
  }

  /** Junta os erros de validação por campo do envelope genérico. */
  private formatErros(erros: unknown): string | undefined {
    if (!Array.isArray(erros) || erros.length === 0) return undefined;

    const linhas = erros
      .filter((erro): erro is Record<string, unknown> => this.isRecord(erro))
      .map((erro) => {
        const campo = this.text(erro.campo);
        const mensagem = this.text(erro.mensagem) ?? '';
        return campo ? `${campo}: ${mensagem}` : mensagem;
      })
      .filter((linha) => linha.length > 0);

    return linhas.length > 0 ? linhas.join('; ') : undefined;
  }

  /** Código do envelope de erro genérico, quando presente. */
  private errorCode(payload: unknown): string | undefined {
    return this.isRecord(payload) ? this.text(payload.codigo) : undefined;
  }

  private parseJson(raw: string): unknown {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /** Normaliza string/número não vazio; qualquer outra coisa vira `undefined`. */
  private text(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private number(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
