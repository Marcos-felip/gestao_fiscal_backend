import { BadRequestException } from '@nestjs/common';
import { FiscalEnvironment } from '@prisma/client';
import {
  CSC_TAMANHO_MAXIMO,
  CSC_TAMANHO_MINIMO,
  isCscValido,
  isIdCscValido,
} from './fiscal-rules';

/** Configuração fiscal do estabelecimento, na parte que a emissão exige. */
export interface EmissionSettings {
  codigoCsc?: string | null;
  idCsc?: string | null;
  certificadoRef?: string | null;
  certificadoSenhaRef?: string | null;
  certificadoValidade?: Date | null;
  ambiente?: FiscalEnvironment | null;
  producaoLiberada?: boolean | null;
}

/**
 * Problemas com o par CSC/idCSC.
 *
 * Ausente e malformado são reportados separadamente de propósito: quem nunca
 * configurou precisa de instrução, quem digitou errado precisa saber que o valor
 * está lá e está errado. Antes desta separação, um CSC curto passava por aqui e
 * só voltava da SEFAZ como rejeição 464, sem citar o CSC.
 */
function checkCsc(settings: EmissionSettings): string[] {
  const problemas: string[] = [];
  const csc = settings.codigoCsc?.trim();
  const idCsc = settings.idCsc?.trim();

  if (!csc || !idCsc) {
    problemas.push('configure o CSC e o ID do CSC do estabelecimento');
    return problemas;
  }

  if (!isCscValido(csc)) {
    problemas.push(
      `o código CSC do estabelecimento está fora do formato esperado ` +
        `(${CSC_TAMANHO_MINIMO} a ${CSC_TAMANHO_MAXIMO} caracteres alfanuméricos) — ` +
        `confira o valor no portal da SEFAZ da UF`,
    );
  }

  if (!isIdCscValido(idCsc)) {
    problemas.push(
      'o ID do CSC do estabelecimento está fora do formato esperado ' +
        '(numérico, até 6 dígitos)',
    );
  }

  return problemas;
}

/**
 * Problemas de configuração que impedem a emissão.
 *
 * São conferidos antes de reservar numeração: nota que não vai sair não pode
 * queimar um número de série.
 */
export function checkEmissionSettings(settings: EmissionSettings): string[] {
  const problemas: string[] = [];

  problemas.push(...checkCsc(settings));

  if (!settings.certificadoRef || !settings.certificadoSenhaRef) {
    problemas.push('envie o certificado digital A1 do estabelecimento');
  } else if (
    settings.certificadoValidade &&
    settings.certificadoValidade.getTime() <= Date.now()
  ) {
    problemas.push(
      `o certificado digital venceu em ${settings.certificadoValidade.toLocaleDateString('pt-BR')}`,
    );
  }

  // Produção nunca é atingida por acidente: exige liberação explícita.
  if (
    settings.ambiente === FiscalEnvironment.PRODUCAO &&
    !settings.producaoLiberada
  ) {
    problemas.push(
      'libere a emissão em produção para este estabelecimento (checklist de ativação)',
    );
  }

  return problemas;
}

/** Versão que interrompe o fluxo com 400 e mensagem amigável. */
export function assertEmissionSettings(settings: EmissionSettings): void {
  const problemas = checkEmissionSettings(settings);

  if (problemas.length > 0) {
    throw new BadRequestException(
      `Não é possível emitir a NFC-e: ${problemas.join('; ')}`,
    );
  }
}

/** Configuração de produção que o checklist de ativação confere. */
export interface ProductionChecklistSettings extends EmissionSettings {
  serieNfce: number;
  proximoNumeroNfce: number;
  serieNfe: number;
  proximoNumeroNfe: number;
  /** Modelos que o estabelecimento emite; vazio é tratado como os dois. */
  modelosEmitidos?: ModeloFiscal[];
  consultaPublicaValidadaEm?: Date | null;
}

/** Modelo de documento, do ponto de vista do checklist. */
export type ModeloFiscal = 'NFCE' | 'NFE';

/** Dados de fora da configuração que o checklist também mostra. */
export interface ProductionChecklistContexto {
  /** Produtos ativos sem o quadro tributário completo. */
  produtosComPendencia?: number;
}

const TODOS_OS_MODELOS: ModeloFiscal[] = ['NFCE', 'NFE'];

const NOME_DO_MODELO: Record<ModeloFiscal, string> = {
  NFCE: 'NFC-e',
  NFE: 'NF-e',
};

/**
 * Modelos considerados na apuração.
 *
 * Lista vazia vale como "os dois": é o que a configuração antiga significava,
 * e presumir menos travaria a liberação de quem já emite.
 */
function modelosDe(settings: ProductionChecklistSettings): ModeloFiscal[] {
  const modelos = settings.modelosEmitidos ?? [];
  return modelos.length > 0 ? modelos : TODOS_OS_MODELOS;
}

export function descreverModelos(
  settings: ProductionChecklistSettings,
): string {
  return modelosDe(settings)
    .map((modelo) => NOME_DO_MODELO[modelo])
    .join(', ');
}

/**
 * Detalhe do item de CSC no checklist: separa "falta preencher" de "está
 * preenchido e errado", sem nunca ecoar o valor — o CSC é segredo.
 */
function cscDetalhe(settings: EmissionSettings): string {
  const problemas = checkCsc(settings);

  if (problemas.length === 0) {
    return 'o CSC de produção é diferente do de homologação e vem do portal da SEFAZ';
  }

  return problemas.join('; ');
}

/**
 * Código estável do item do checklist.
 *
 * A interface precisa agir sobre itens específicos — levar à lista de produtos
 * pendentes, por exemplo. Reconhecê-los pelo texto amarraria a tela a uma frase
 * em português que existe para ser reescrita.
 */
export type ChecklistItemCodigo =
  | 'certificado_enviado'
  | 'certificado_vigente'
  | 'csc'
  | 'serie'
  | 'proximo_numero'
  | 'consulta_publica'
  | 'produtos_fiscais';

/** Item do checklist de ativação da produção. */
export interface ProductionChecklistItem {
  codigo: ChecklistItemCodigo;
  item: string;
  ok: boolean;
  detalhe?: string;
  bloqueante?: boolean;
  /**
   * Modelo a que o item pertence. Ausente = vale para todos — é o caso do
   * certificado, que assina os dois.
   */
  modelo?: ModeloFiscal;
}

/** Limites de série e numeração, iguais aos do motor. */
const SERIE_MINIMA = 1;
const SERIE_MAXIMA = 999;
const NUMERO_MINIMO = 1;
const NUMERO_MAXIMO = 999999999;

/**
 * Checklist de ativação da produção.
 *
 * **Cada item declara a qual modelo pertence, e só entram os modelos que o
 * estabelecimento emite.** Antes a lista era inteira de NFC-e: CSC e consulta
 * pública bloqueavam quem só emite NF-e, e a série conferida era sempre a da
 * NFC-e — dava para liberar produção sem ninguém ter olhado a numeração do
 * modelo 55.
 *
 * Devolve a lista inteira — o usuário precisa ver o que já está pronto, não só
 * o que falta.
 */
export function buildProductionChecklist(
  settings: ProductionChecklistSettings,
  contexto: ProductionChecklistContexto = {},
): ProductionChecklistItem[] {
  const modelos = modelosDe(settings);
  const temCertificado = !!(
    settings.certificadoRef && settings.certificadoSenhaRef
  );
  const certificadoVigente =
    temCertificado &&
    (!settings.certificadoValidade ||
      settings.certificadoValidade.getTime() > Date.now());

  const itens: ProductionChecklistItem[] = [
    {
      codigo: 'certificado_enviado',
      item: 'Certificado digital A1 enviado',
      ok: temCertificado,
      detalhe: temCertificado
        ? settings.certificadoValidade?.toLocaleDateString('pt-BR')
        : 'envie o certificado de produção do estabelecimento',
      bloqueante: true,
    },
    {
      codigo: 'certificado_vigente',
      item: 'Certificado dentro da validade',
      ok: certificadoVigente,
      detalhe: certificadoVigente ? undefined : 'certificado vencido',
      bloqueante: true,
    },
  ];

  // CSC e consulta pública são do QR Code da NFC-e. Quem vende só para empresa
  // não tem CSC nem tem onde consultar.
  if (modelos.includes('NFCE')) {
    itens.push(
      {
        codigo: 'csc',
        item: 'CSC e ID do CSC de produção configurados',
        ok: isCscValido(settings.codigoCsc) && isIdCscValido(settings.idCsc),
        detalhe: cscDetalhe(settings),
        bloqueante: true,
        modelo: 'NFCE',
      },
      ...itensDeNumeracao(
        'NFCE',
        settings.serieNfce,
        settings.proximoNumeroNfce,
      ),
      {
        codigo: 'consulta_publica',
        item: 'Consulta pública validada em produção',
        ok: !!settings.consultaPublicaValidadaEm,
        detalhe: settings.consultaPublicaValidadaEm
          ? `validada em ${settings.consultaPublicaValidadaEm.toLocaleDateString('pt-BR')}`
          : 'após liberar e emitir a primeira nota, valide a consulta pública',
        bloqueante: false,
        modelo: 'NFCE',
      },
    );
  }

  if (modelos.includes('NFE')) {
    itens.push(
      ...itensDeNumeracao('NFE', settings.serieNfe, settings.proximoNumeroNfe),
    );
  }

  // Não bloqueia: o CSOSN é decisão do contador e o sistema não preenche por
  // ninguém. Mas dizer quantos faltam antes é melhor do que a rejeição aparecer
  // na primeira venda do balcão.
  if (contexto.produtosComPendencia !== undefined) {
    const pendentes = contexto.produtosComPendencia;

    itens.push({
      codigo: 'produtos_fiscais',
      item: 'Produtos com quadro tributário completo',
      ok: pendentes === 0,
      detalhe:
        pendentes === 0
          ? 'nenhum produto pendente'
          : `${pendentes} ${pendentes === 1 ? 'produto não emite' : 'produtos não emitem'} até o cadastro fiscal ser completado`,
      bloqueante: false,
    });
  }

  return itens;
}

/** Série e próximo número de um modelo, nomeando de qual se trata. */
function itensDeNumeracao(
  modelo: ModeloFiscal,
  serie: number,
  proximoNumero: number,
): ProductionChecklistItem[] {
  const nome = NOME_DO_MODELO[modelo];

  return [
    {
      codigo: 'serie',
      item: `Série da ${nome} entre ${SERIE_MINIMA} e ${SERIE_MAXIMA}`,
      ok: serie >= SERIE_MINIMA && serie <= SERIE_MAXIMA,
      detalhe: `série atual: ${serie}`,
      bloqueante: true,
      modelo,
    },
    {
      codigo: 'proximo_numero',
      item: `Próximo número da ${nome} entre ${NUMERO_MINIMO} e ${NUMERO_MAXIMO}`,
      ok: proximoNumero >= NUMERO_MINIMO && proximoNumero <= NUMERO_MAXIMO,
      detalhe: `próximo número: ${proximoNumero}`,
      bloqueante: true,
      modelo,
    },
  ];
}
