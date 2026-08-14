import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FiscalDocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { DfeNetFiscalEngine } from '../fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalCertificateService } from '../certificates/fiscal-certificate.service';
import {
  buildFiscalStorageKey,
  isFiscalStorageKey,
} from '../emission/fiscal-storage';
import { mapAmbiente, apenasDigitos } from '../emission/fiscal-rules';
import { CreateCorrectionLetterDto } from '../dto/create-correction-letter.dto';
import { InutilizeNumberingDto } from '../dto/inutilize-numbering.dto';
import {
  agruparEmFaixas,
  buracosDaNumeracao,
  conflitosNaFaixa,
  Faixa,
  LIMITE_CARTAS_CORRECAO,
  mensagemDeConflito,
  NumeroUsado,
} from './fiscal-events.rules';

/** Status em que o documento ainda ocupa o número perante o fisco. */
const STATUS_QUE_OCUPAM_NUMERO: FiscalDocumentStatus[] = [
  FiscalDocumentStatus.AUTORIZADO,
  FiscalDocumentStatus.CANCELADO,
];

/**
 * Eventos fiscais que não são emissão nem cancelamento.
 *
 * Fica separado do `FiscalOperationsService` porque a pergunta que estes dois
 * atos respondem é outra: o cancelamento desfaz uma nota, a carta corrige um
 * detalhe dela, e a inutilização fala de numeração que **nunca virou nota**.
 *
 * É aqui que moram as regras que o motor não tem como impor — ele é stateless e
 * não conhece o histórico do documento nem quais números foram usados.
 */
@Injectable()
export class FiscalEventsService {
  private readonly logger = new Logger(FiscalEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: DfeNetFiscalEngine,
    private readonly certificates: FiscalCertificateService,
    private readonly storage: StorageService,
  ) {}

  // ──────────────────────────────────────────────
  // Carta de correção
  // ──────────────────────────────────────────────

  /**
   * Emite carta de correção para um documento autorizado.
   *
   * A sequência é **atribuída aqui**, e não informada pelo usuário: ela precisa
   * ser a próxima da nota, e só este lado conhece as anteriores. O UNIQUE de
   * `(documento, sequência)` no banco fecha a corrida entre duas correções
   * simultâneas — sem ele, as duas leriam o mesmo "última = 2".
   */
  async createCorrectionLetter(
    companyId: string,
    fiscalDocumentId: string,
    dto: CreateCorrectionLetterDto,
    userId?: string,
  ) {
    const document = await this.requireDocument(companyId, fiscalDocumentId);

    if (document.status !== FiscalDocumentStatus.AUTORIZADO) {
      throw new BadRequestException(
        'Somente documento autorizado aceita carta de correção. ' +
          'Documento rejeitado ou cancelado não se corrige — emita um novo.',
      );
    }

    if (!document.chaveAcesso) {
      throw new BadRequestException('Documento sem chave de acesso');
    }

    const anteriores = await this.prisma.fiscalCorrectionLetter.count({
      where: { fiscalDocumentId },
    });

    if (anteriores >= LIMITE_CARTAS_CORRECAO) {
      throw new BadRequestException(
        `Esta nota já tem ${LIMITE_CARTAS_CORRECAO} cartas de correção, que é o ` +
          'limite legal. Não há como corrigi-la de novo.',
      );
    }

    const sequencia = anteriores + 1;

    const emitente = await this.requireEmitente(
      companyId,
      document.establishmentId,
    );

    const credentials = await this.certificates.loadCredentials(
      companyId,
      document.establishmentId,
      document.ambiente,
    );

    const result = await this.engine.cartaCorrecao({
      chaveAcesso: document.chaveAcesso,
      correcao: dto.correcao,
      sequenciaEvento: sequencia,
      cpfCnpj: emitente,
      ambiente: mapAmbiente(document.ambiente),
      ...credentials,
    });

    if (!result.sucesso) {
      await this.prisma.fiscalDocumentEvent.create({
        data: {
          fiscalDocumentId,
          tipo: 'carta_correcao',
          detalhes: {
            sucesso: false,
            sequencia,
            motivo: result.motivoRejeicao,
          },
          usuarioId: userId,
        },
      });

      throw new BadRequestException(
        `Carta de correção recusada pela SEFAZ: ${result.motivoRejeicao ?? 'motivo não informado'}`,
      );
    }

    const xmlEvento = await this.persistirXml(
      companyId,
      document.chaveAcesso,
      result.xmlEventoBase64,
      `cce-${sequencia}`,
    );

    const [carta] = await this.prisma.$transaction([
      this.prisma.fiscalCorrectionLetter.create({
        data: {
          companyId,
          fiscalDocumentId,
          sequencia,
          correcao: dto.correcao,
          // Guardada com a carta: o texto legal muda com o tempo, e o que vale
          // é o que estava vigente quando a correção foi feita.
          condicaoDeUso: result.condicaoDeUso,
          protocolo: result.protocolo,
          xmlEvento,
          usuarioId: userId,
        },
      }),
      this.prisma.fiscalDocumentEvent.create({
        data: {
          fiscalDocumentId,
          tipo: 'carta_correcao',
          detalhes: {
            sucesso: true,
            sequencia,
            protocolo: result.protocolo,
          },
          usuarioId: userId,
        },
      }),
    ]);

    this.logger.log(
      `Carta de correção ${sequencia} registrada: documento=${fiscalDocumentId}, protocolo=${result.protocolo}`,
    );

    return carta;
  }

  /** Cartas de correção de um documento, da primeira à última. */
  async listCorrectionLetters(companyId: string, fiscalDocumentId: string) {
    await this.requireDocument(companyId, fiscalDocumentId);

    return this.prisma.fiscalCorrectionLetter.findMany({
      where: { fiscalDocumentId },
      orderBy: { sequencia: 'asc' },
    });
  }

  /**
   * XML de uma carta de correção.
   *
   * Rota própria, e não mais um valor de `xml/:tipo`: aquela rota identifica o
   * arquivo pelo documento, e aqui existem até 20 na mesma nota — a sequência
   * faz parte do endereço.
   */
  async getCorrectionLetterXml(
    companyId: string,
    fiscalDocumentId: string,
    sequencia: number,
  ): Promise<string> {
    await this.requireDocument(companyId, fiscalDocumentId);

    const carta = await this.prisma.fiscalCorrectionLetter.findFirst({
      where: { fiscalDocumentId, sequencia },
      select: { xmlEvento: true },
    });

    if (!carta) {
      throw new NotFoundException(
        `Carta de correção ${sequencia} não encontrada para este documento`,
      );
    }

    const conteudo = await this.lerXmlArmazenado(carta.xmlEvento);

    if (conteudo === null) {
      throw new NotFoundException(
        `XML da carta de correção ${sequencia} não pôde ser recuperado`,
      );
    }

    return conteudo;
  }

  // ──────────────────────────────────────────────
  // Inutilização
  // ──────────────────────────────────────────────

  /**
   * Inutiliza uma faixa de numeração.
   *
   * **A guarda que importa é a da faixa.** Inutilizar número de nota autorizada
   * é o erro caro aqui: a SEFAZ recusaria, mas depois e sem dizer qual número.
   * Conferir antes permite nomeá-lo, que é o que deixa o operador corrigir.
   */
  async inutilize(
    companyId: string,
    dto: InutilizeNumberingDto,
    userId?: string,
  ) {
    if (dto.numeroFinal < dto.numeroInicial) {
      throw new BadRequestException(
        'O número final deve ser maior ou igual ao inicial',
      );
    }

    const settings = await this.prisma.fiscalSettings.findFirst({
      where: {
        establishmentId: dto.establishmentId,
        companyId,
        ativo: true,
        deletedAt: null,
      },
    });

    if (!settings) {
      throw new BadRequestException(
        'Configuração fiscal não encontrada ou inativa para este estabelecimento',
      );
    }

    const usados = await this.numerosUsados(
      companyId,
      dto.establishmentId,
      dto.modelo,
      dto.serie,
    );

    const conflitos = conflitosNaFaixa(
      dto.numeroInicial,
      dto.numeroFinal,
      usados,
    );

    if (conflitos.length > 0) {
      throw new BadRequestException(mensagemDeConflito(conflitos));
    }

    const emitente = await this.requireEmitente(companyId, dto.establishmentId);

    const credentials = await this.certificates.loadCredentials(
      companyId,
      dto.establishmentId,
      settings.ambiente,
    );

    const ano = dto.ano ?? new Date().getFullYear();

    const result = await this.engine.inutilizar({
      cnpj: emitente,
      ano,
      modelo: dto.modelo === 'NFE' ? 55 : 65,
      serie: dto.serie,
      numeroInicial: dto.numeroInicial,
      numeroFinal: dto.numeroFinal,
      justificativa: dto.justificativa,
      uf: await this.requireUf(companyId, dto.establishmentId),
      ambiente: mapAmbiente(settings.ambiente),
      ...credentials,
    });

    if (!result.sucesso) {
      throw new BadRequestException(
        `Inutilização recusada pela SEFAZ: ${result.motivoRejeicao ?? 'motivo não informado'}`,
      );
    }

    const xmlInutilizacao = await this.persistirXmlDaFaixa(
      companyId,
      dto,
      result.xmlInutilizacaoBase64,
    );

    const inutilizacao = await this.prisma.fiscalInutilization.create({
      data: {
        companyId,
        establishmentId: dto.establishmentId,
        modelo: dto.modelo,
        ambiente: settings.ambiente,
        serie: dto.serie,
        numeroInicial: dto.numeroInicial,
        numeroFinal: dto.numeroFinal,
        ano,
        justificativa: dto.justificativa,
        protocolo: result.protocolo,
        xmlInutilizacao,
        usuarioId: userId,
      },
    });

    // Documento em erro definitivo cujo número foi inutilizado deixa de estar
    // "com erro" e passa a ter destino fiscal: é o que gera o status
    // INUTILIZADO, que existia no enum sem nada que o produzisse.
    await this.marcarDocumentosInutilizados(companyId, dto, userId);

    this.logger.log(
      `Numeração inutilizada: modelo=${dto.modelo}, série=${dto.serie}, ` +
        `faixa=${dto.numeroInicial}-${dto.numeroFinal}, protocolo=${result.protocolo}`,
    );

    return inutilizacao;
  }

  /**
   * Faixas de numeração reservadas que nunca viraram documento.
   *
   * Sugerir é melhor do que deixar digitar: a faixa errada aqui inutiliza
   * numeração válida, e isso não se desfaz.
   */
  async pendingRanges(
    companyId: string,
    establishmentId: string,
  ): Promise<{ modelo: string; serie: number; faixas: Faixa[] }[]> {
    const settings = await this.prisma.fiscalSettings.findFirst({
      where: { establishmentId, companyId, ativo: true, deletedAt: null },
    });

    if (!settings) return [];

    const modelos = [
      {
        modelo: 'NFCE' as const,
        serie: settings.serieNfce,
        proximo: settings.proximoNumeroNfce,
      },
      {
        modelo: 'NFE' as const,
        serie: settings.serieNfe,
        proximo: settings.proximoNumeroNfe,
      },
    ];

    const resultado = [];

    for (const { modelo, serie, proximo } of modelos) {
      const documentos = await this.prisma.fiscalDocument.findMany({
        where: { companyId, establishmentId, modelo, serie, deletedAt: null },
        select: { numero: true },
      });

      const jaInutilizados = await this.prisma.fiscalInutilization.findMany({
        where: { companyId, establishmentId, modelo, serie },
        select: { numeroInicial: true, numeroFinal: true },
      });

      const cobertos = new Set(documentos.map((d) => d.numero));
      for (const faixa of jaInutilizados) {
        for (let n = faixa.numeroInicial; n <= faixa.numeroFinal; n++) {
          cobertos.add(n);
        }
      }

      const buracos = buracosDaNumeracao(proximo, [...cobertos]);
      if (buracos.length > 0) {
        resultado.push({ modelo, serie, faixas: agruparEmFaixas(buracos) });
      }
    }

    return resultado;
  }

  // ──────────────────────────────────────────────
  // Apoio
  // ──────────────────────────────────────────────

  private async numerosUsados(
    companyId: string,
    establishmentId: string,
    modelo: string,
    serie: number,
  ): Promise<NumeroUsado[]> {
    const documentos = await this.prisma.fiscalDocument.findMany({
      where: {
        companyId,
        establishmentId,
        modelo: modelo as never,
        serie,
        status: { in: STATUS_QUE_OCUPAM_NUMERO },
        deletedAt: null,
      },
      select: { numero: true, chaveAcesso: true, status: true },
    });

    return documentos.map((d) => ({
      numero: d.numero,
      chaveAcesso: d.chaveAcesso,
      status: d.status,
    }));
  }

  /**
   * Documentos daquela faixa que estavam em erro definitivo passam a
   * INUTILIZADO. Os autorizados nunca chegam aqui — a faixa já foi recusada.
   */
  private async marcarDocumentosInutilizados(
    companyId: string,
    dto: InutilizeNumberingDto,
    userId?: string,
  ): Promise<void> {
    const alvos = await this.prisma.fiscalDocument.findMany({
      where: {
        companyId,
        establishmentId: dto.establishmentId,
        modelo: dto.modelo,
        serie: dto.serie,
        numero: { gte: dto.numeroInicial, lte: dto.numeroFinal },
        status: {
          in: [FiscalDocumentStatus.ERRO, FiscalDocumentStatus.REJEITADO],
        },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });

    for (const alvo of alvos) {
      await this.prisma.$transaction([
        this.prisma.fiscalDocument.update({
          where: { id: alvo.id },
          data: { status: FiscalDocumentStatus.INUTILIZADO },
        }),
        this.prisma.fiscalStatusHistory.create({
          data: {
            fiscalDocumentId: alvo.id,
            statusFrom: alvo.status,
            statusTo: FiscalDocumentStatus.INUTILIZADO,
            motivo: `Numeração inutilizada: ${dto.justificativa}`,
            usuarioId: userId,
          },
        }),
      ]);
    }
  }

  private async requireDocument(companyId: string, fiscalDocumentId: string) {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id: fiscalDocumentId, companyId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento fiscal não encontrado');
    }

    return document;
  }

  /** CNPJ do emitente: o do estabelecimento, com o da empresa como reserva. */
  private async requireEmitente(
    companyId: string,
    establishmentId: string,
  ): Promise<string> {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, companyId, deletedAt: null },
      include: { company: { select: { cnpj: true } } },
    });

    const cnpj = apenasDigitos(
      establishment?.cnpj ?? establishment?.company.cnpj,
    );

    if (cnpj.length !== 14) {
      throw new BadRequestException(
        'CNPJ do estabelecimento emitente inválido ou ausente',
      );
    }

    return cnpj;
  }

  /** UF do emitente: sem chave de acesso, não há de onde deduzi-la. */
  private async requireUf(
    companyId: string,
    establishmentId: string,
  ): Promise<string> {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, companyId, deletedAt: null },
      select: { state: true },
    });

    const uf = (establishment?.state ?? '').trim().toUpperCase();

    if (uf.length !== 2) {
      throw new BadRequestException(
        'Informe a UF do estabelecimento emitente antes de inutilizar numeração',
      );
    }

    return uf;
  }

  private async persistirXml(
    companyId: string,
    chaveAcesso: string,
    xmlBase64: string | undefined,
    sufixo: string,
  ): Promise<string | undefined> {
    if (!xmlBase64) return undefined;

    const xml = Buffer.from(xmlBase64, 'base64').toString('utf-8');
    if (!this.storage.isConfigured()) return xml;

    const chave = buildFiscalStorageKey(
      companyId,
      chaveAcesso,
      'xml',
      new Date(),
      sufixo,
    );

    try {
      await this.storage.upload(chave, xml, 'application/xml');
      return chave;
    } catch (error) {
      this.logger.error(
        `Falha ao guardar o XML de ${sufixo} (${chave}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return xml;
    }
  }

  /**
   * Resolve o XML gravado: conteúdo direto na coluna ou chave do storage,
   * conforme `persistirXml` tenha gravado de um jeito ou de outro.
   */
  private async lerXmlArmazenado(valor: string | null): Promise<string | null> {
    if (!valor) return null;
    if (!isFiscalStorageKey(valor)) return valor;

    try {
      return await this.storage.download(valor);
    } catch (error) {
      this.logger.error(
        `Falha ao ler o XML do storage (${valor}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * XML da inutilização. Não há chave de acesso — a faixa nunca virou
   * documento —, então o nome do arquivo é composto da série e da faixa.
   */
  private async persistirXmlDaFaixa(
    companyId: string,
    dto: InutilizeNumberingDto,
    xmlBase64: string | undefined,
  ): Promise<string | undefined> {
    if (!xmlBase64) return undefined;

    const identificador =
      `inutilizacao-${dto.modelo.toLowerCase()}-serie${dto.serie}-` +
      `${dto.numeroInicial}a${dto.numeroFinal}`;

    return this.persistirXml(companyId, identificador, xmlBase64, 'faixa');
  }
}

export type { Faixa };
export type FiscalCorrectionLetterRecord =
  Prisma.FiscalCorrectionLetterGetPayload<null>;
