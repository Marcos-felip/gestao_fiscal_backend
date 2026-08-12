import { BadRequestException } from '@nestjs/common';
import {
  FiscalDocumentModel,
  FiscalDocumentStatus,
  FiscalEnvironment,
  Prisma,
} from '@prisma/client';

/**
 * Regras puras da exportação em lote dos XMLs.
 *
 * Ficam fora do service de propósito: são as regras que o contador enxerga —
 * o recorte do período, o nome dos arquivos e o manifesto de conferência.
 */

/** Janela máxima de uma exportação, em dias. */
export const PERIODO_MAXIMO_DIAS = 92;

/** Teto de documentos por exportação, acima do qual a resposta é `400`. */
export const LIMITE_DOCUMENTOS = 5000;

const MILISSEGUNDOS_POR_DIA = 86_400_000;

/** Período já resolvido em instantes, pronto para o filtro do Prisma. */
export interface PeriodoExportacao {
  inicio: Date;
  fim: Date;
}

/**
 * Valida e resolve o período pedido.
 *
 * Data sem hora (`2026-08-31`) vira o **fim do dia**, não a meia-noite: pedir
 * 01/08 a 31/08 e receber o mês sem o dia 31 seria uma nota faltando na
 * escrituração, e ninguém perceberia.
 */
export function resolverPeriodo(
  dataInicio: string,
  dataFim: string,
): PeriodoExportacao {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new BadRequestException('Período inválido: verifique as datas');
  }

  if (!temHora(dataFim)) {
    fim.setUTCHours(23, 59, 59, 999);
  }

  if (fim < inicio) {
    throw new BadRequestException(
      'A data de fim não pode ser anterior à data de início',
    );
  }

  const dias = (fim.getTime() - inicio.getTime()) / MILISSEGUNDOS_POR_DIA;

  if (dias > PERIODO_MAXIMO_DIAS) {
    throw new BadRequestException(
      `O período não pode passar de ${PERIODO_MAXIMO_DIAS} dias. ` +
        'Divida a exportação em intervalos menores, por exemplo mês a mês.',
    );
  }

  return { inicio, fim };
}

/** `2026-08-31` não tem hora; `2026-08-31T10:00:00Z` tem. */
function temHora(valor: string): boolean {
  return valor.includes('T');
}

/** Mensagem do teto de volume, com o total encontrado. */
export function mensagemLimiteDocumentos(total: number): string {
  return (
    `O período tem ${total} documentos e o limite por exportação é ${LIMITE_DOCUMENTOS}. ` +
    'Divida o pedido por estabelecimento ou em intervalos menores.'
  );
}

export type TipoArquivoFiscal = 'nfe' | 'cancelamento';

/**
 * Nome do arquivo dentro do ZIP, pela chave de acesso — é a convenção que os
 * softwares de escrituração esperam, e a chave já garante unicidade.
 */
export function nomeArquivoXml(
  chaveAcesso: string,
  tipo: TipoArquivoFiscal,
): string {
  return `${chaveAcesso}-${tipo}.xml`;
}

/**
 * Nome do ZIP. Homologação vai marcada no nome: XML de teste escriturado como
 * real é problema fiscal, e o arquivo circula por e-mail longe desta tela.
 */
export function nomeArquivoZip(
  empresa: string,
  periodo: PeriodoExportacao,
  ambiente: FiscalEnvironment,
): string {
  const partes = [
    'xmls',
    normalizarParaNomeDeArquivo(empresa),
    somenteData(periodo.inicio),
    'a',
    somenteData(periodo.fim),
  ];

  if (ambiente === FiscalEnvironment.HOMOLOGACAO) {
    partes.push('HOMOLOGACAO-SEM-VALOR-FISCAL');
  }

  return `${partes.filter(Boolean).join('-')}.zip`;
}

function somenteData(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

/** Marcas de acentuação separadas pelo `normalize('NFD')`. */
const ACENTOS_COMBINANTES = /[\u0300-\u036f]/g;

function normalizarParaNomeDeArquivo(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(ACENTOS_COMBINANTES, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}

/** Nome do manifesto dentro do ZIP. O underscore o mantém no topo da listagem. */
export const NOME_MANIFESTO = '_relacao.csv';

/** Campos que a exportação lê de cada documento fiscal. */
export interface DocumentoExportavel {
  chaveAcesso: string | null;
  numero: number;
  serie: number;
  modelo: FiscalDocumentModel;
  status: FiscalDocumentStatus;
  dataAutorizacao: Date | null;
  valorTotal: Prisma.Decimal | null;
  xmlAutorizado: string | null;
  xmlCancelamento: string | null;
}

/** Resolve o XML gravado no documento; `null` quando não é recuperável. */
export type LeitorDeXml = (valor: string | null) => Promise<string | null>;

/** Para onde os arquivos vão — o ZIP em produção, um array nos testes. */
export interface DestinoDosArquivos {
  adicionar(nome: string, conteudo: string): void;
}

/**
 * Percorre os documentos, entrega cada XML ao destino e devolve o manifesto.
 *
 * XML que não volta do storage **não** derruba a exportação: entra como ausente
 * no manifesto e o lote segue. Um arquivo perdido em agosto não pode impedir o
 * fechamento do mês inteiro — é a mesma filosofia do `persistirArquivos`, onde
 * falha de storage não transforma nota autorizada em erro.
 */
export async function montarLoteDeExportacao(
  documentos: DocumentoExportavel[],
  lerXml: LeitorDeXml,
  destino: DestinoDosArquivos,
): Promise<LinhaManifesto[]> {
  const manifesto: LinhaManifesto[] = [];

  for (const documento of documentos) {
    const ausentes: TipoArquivoFiscal[] = [];
    const chaveAcesso = documento.chaveAcesso;

    // Sem chave de acesso não há como nomear o arquivo: entra como ausente.
    const autorizado = chaveAcesso
      ? await lerXml(documento.xmlAutorizado)
      : null;

    if (chaveAcesso && autorizado) {
      destino.adicionar(nomeArquivoXml(chaveAcesso, 'nfe'), autorizado);
    } else {
      ausentes.push('nfe');
    }

    // Cancelada leva os dois XMLs. Sem o do evento, o contador escritura a nota
    // como se ela ainda valesse.
    if (documento.status === FiscalDocumentStatus.CANCELADO) {
      const cancelamento = chaveAcesso
        ? await lerXml(documento.xmlCancelamento)
        : null;

      if (chaveAcesso && cancelamento) {
        destino.adicionar(
          nomeArquivoXml(chaveAcesso, 'cancelamento'),
          cancelamento,
        );
      } else {
        ausentes.push('cancelamento');
      }
    }

    manifesto.push({
      chaveAcesso,
      numero: documento.numero,
      serie: documento.serie,
      modelo: documento.modelo,
      dataAutorizacao: documento.dataAutorizacao,
      status: documento.status,
      valorTotal: documento.valorTotal?.toString() ?? null,
      ausentes,
    });
  }

  return manifesto;
}

/** Uma linha do manifesto de conferência. */
export interface LinhaManifesto {
  chaveAcesso: string | null;
  numero: number;
  serie: number;
  modelo: string;
  dataAutorizacao: Date | null;
  status: string;
  valorTotal: string | null;
  /** Arquivos que deveriam existir e não puderam ser recuperados. */
  ausentes: TipoArquivoFiscal[];
}

const COLUNAS_MANIFESTO = [
  'Chave de acesso',
  'Número',
  'Série',
  'Modelo',
  'Data de autorização',
  'Status',
  'Valor total',
  'Arquivos ausentes',
];

/**
 * Manifesto de conferência em CSV.
 *
 * CSV e não JSON porque quem abre este arquivo usa Excel — daí também o
 * separador `;`, a vírgula decimal e o BOM, que é o que faz o Excel em
 * português reconhecer o UTF-8 e não trocar os acentos.
 */
export function montarManifesto(linhas: LinhaManifesto[]): string {
  const cabecalho = COLUNAS_MANIFESTO.join(';');
  const corpo = linhas.map((linha) =>
    [
      linha.chaveAcesso ?? '',
      linha.numero,
      linha.serie,
      linha.modelo,
      formatarDataHora(linha.dataAutorizacao),
      linha.status,
      formatarValor(linha.valorTotal),
      linha.ausentes.join(' '),
    ]
      .map(escaparCampo)
      .join(';'),
  );

  return `\uFEFF${[cabecalho, ...corpo].join('\r\n')}\r\n`;
}

function escaparCampo(valor: string | number): string {
  const texto = String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function formatarValor(valor: string | null): string {
  return valor === null ? '' : valor.replace('.', ',');
}

function formatarDataHora(valor: Date | null): string {
  if (!valor) return '';

  const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

  return (
    `${doisDigitos(valor.getUTCDate())}/${doisDigitos(valor.getUTCMonth() + 1)}/${valor.getUTCFullYear()} ` +
    `${doisDigitos(valor.getUTCHours())}:${doisDigitos(valor.getUTCMinutes())}:${doisDigitos(valor.getUTCSeconds())}`
  );
}
