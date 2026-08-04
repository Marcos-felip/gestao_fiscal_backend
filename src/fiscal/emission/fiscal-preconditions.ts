import { BadRequestException } from '@nestjs/common';

/** Configuração fiscal do estabelecimento, na parte que a emissão exige. */
export interface EmissionSettings {
  codigoCsc?: string | null;
  idCsc?: string | null;
  certificadoRef?: string | null;
  certificadoSenhaRef?: string | null;
  certificadoValidade?: Date | null;
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
