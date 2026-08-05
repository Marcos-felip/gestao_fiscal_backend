import { BadRequestException } from '@nestjs/common';
import { FiscalEnvironment } from '@prisma/client';

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
 * Problemas de configuração que impedem a emissão.
 *
 * São conferidos antes de reservar numeração: nota que não vai sair não pode
 * queimar um número de série.
 */
export function checkEmissionSettings(settings: EmissionSettings): string[] {
  const problemas: string[] = [];

  if (!settings.codigoCsc?.trim() || !settings.idCsc?.trim()) {
    problemas.push('configure o CSC e o ID do CSC do estabelecimento');
  }

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
  consultaPublicaValidadaEm?: Date | null;
}

/** Item do checklist de ativação da produção. */
export interface ProductionChecklistItem {
  item: string;
  ok: boolean;
  detalhe?: string;
  bloqueante?: boolean;
}

/**
 * Checklist de ativação da produção.
 *
 * Confere certificado, CSC, série e numeração com os mesmos limites do motor.
 * Devolve a lista inteira — o usuário precisa ver o que já está pronto, não só
 * o que falta.
 */
export function buildProductionChecklist(
  settings: ProductionChecklistSettings,
): ProductionChecklistItem[] {
  const temCertificado = !!(
    settings.certificadoRef && settings.certificadoSenhaRef
  );
  const certificadoVigente =
    temCertificado &&
    (!settings.certificadoValidade ||
      settings.certificadoValidade.getTime() > Date.now());

  return [
    {
      item: 'Certificado digital A1 enviado',
      ok: temCertificado,
      detalhe: temCertificado
        ? settings.certificadoValidade?.toLocaleDateString('pt-BR')
        : 'envie o certificado de produção do estabelecimento',
      bloqueante: true,
    },
    {
      item: 'Certificado dentro da validade',
      ok: certificadoVigente,
      detalhe: certificadoVigente ? undefined : 'certificado vencido',
      bloqueante: true,
    },
    {
      item: 'CSC e ID do CSC de produção configurados',
      ok: !!settings.codigoCsc?.trim() && !!settings.idCsc?.trim(),
      detalhe:
        'o CSC de produção é diferente do de homologação e vem do portal da SEFAZ',
      bloqueante: true,
    },
    {
      item: 'Série entre 1 e 999',
      ok: settings.serieNfce >= 1 && settings.serieNfce <= 999,
      detalhe: `série atual: ${settings.serieNfce}`,
      bloqueante: true,
    },
    {
      item: 'Próximo número entre 1 e 999999999',
      ok:
        settings.proximoNumeroNfce >= 1 &&
        settings.proximoNumeroNfce <= 999999999,
      detalhe: `próximo número: ${settings.proximoNumeroNfce}`,
      bloqueante: true,
    },
    {
      item: 'Consulta pública validada em produção',
      ok: !!settings.consultaPublicaValidadaEm,
      detalhe: settings.consultaPublicaValidadaEm
        ? `validada em ${settings.consultaPublicaValidadaEm.toLocaleDateString('pt-BR')}`
        : 'após liberar e emitir a primeira nota, valide a consulta pública',
      bloqueante: false,
    },
  ];
}
