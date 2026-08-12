import { BadRequestException } from '@nestjs/common';
import { FiscalEnvironment, Prisma } from '@prisma/client';
import {
  EmitirNfceRequest,
  FiscalCertificateCredentials,
} from '../fiscal-engine/fiscal-engine.interface';
import {
  FiscalSnapshot,
  VERSAO_SNAPSHOT_ATUAL,
} from './fiscal-snapshot.builder';
import {
  arredondar,
  CSC_TAMANHO_MAXIMO,
  CSC_TAMANHO_MINIMO,
  isCscValido,
  isIdCscValido,
  mapAmbiente,
  somar,
  TOLERANCIA_MONETARIA,
} from './fiscal-rules';

/** Payload da emissão sem o certificado — ele entra só na borda da chamada. */
export type EmissionPayload = Omit<
  EmitirNfceRequest,
  keyof FiscalCertificateCredentials
>;

/** Dados do documento e da configuração usados na emissão. */
export interface EmissionContext {
  serie: number;
  numero: number;
  ambiente: FiscalEnvironment;
  codigoCsc?: string | null;
  idCsc?: string | null;
}

/**
 * Converte o snapshot gravado no documento no payload do motor.
 *
 * O snapshot já nasce validado; aqui os somatórios são conferidos de novo
 * porque é a última parada antes de queimar a numeração na SEFAZ.
 */
export function buildEmitirNfceRequest(
  snapshot: Prisma.JsonValue | null,
  context: EmissionContext,
): EmissionPayload {
  const dados = lerSnapshot(snapshot);

  const codigoCsc = context.codigoCsc?.trim();
  const idCsc = context.idCsc?.trim();

  if (!codigoCsc || !idCsc) {
    throw new BadRequestException(
      'Configure o CSC e o ID do CSC do estabelecimento para emitir NFC-e',
    );
  }

  // CSC malformado não falha aqui nem na SEFAZ de forma legível: ele produz um
  // QR Code com hash errado e volta como rejeição 464, já com a numeração
  // consumida. Conferir o formato aqui é o que evita queimar o número.
  if (!isCscValido(codigoCsc)) {
    throw new BadRequestException(
      `O código CSC do estabelecimento está fora do formato esperado ` +
        `(${CSC_TAMANHO_MINIMO} a ${CSC_TAMANHO_MAXIMO} caracteres alfanuméricos). ` +
        `Confira o valor no portal da SEFAZ da UF antes de emitir.`,
    );
  }

  if (!isIdCscValido(idCsc)) {
    throw new BadRequestException(
      'O ID do CSC do estabelecimento está fora do formato esperado ' +
        '(numérico, até 6 dígitos).',
    );
  }

  if (context.serie < 1 || context.serie > 999) {
    throw new BadRequestException('Série da NFC-e deve estar entre 1 e 999');
  }

  if (context.numero < 1 || context.numero > 999_999_999) {
    throw new BadRequestException(
      'Número da NFC-e deve estar entre 1 e 999999999',
    );
  }

  conferirSomatorios(dados);

  return {
    emitente: dados.emitente,
    destinatario: dados.destinatario,
    itens: dados.itens,
    pagamentos: dados.pagamentos,
    valorTotal: dados.valorTotal,
    codigoCsc,
    idCsc,
    serie: context.serie,
    numero: context.numero,
    ambiente: mapAmbiente(context.ambiente),
  };
}

/** O snapshot é gravado como JSONB; aqui ele volta a ser tipado. */
function lerSnapshot(snapshot: Prisma.JsonValue | null): FiscalSnapshot {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new BadRequestException(
      'Documento fiscal sem snapshot da venda — não é possível emitir',
    );
  }

  const dados = snapshot as unknown as FiscalSnapshot;

  if (!dados.emitente || !Array.isArray(dados.itens)) {
    throw new BadRequestException(
      'Snapshot do documento fiscal em formato não suportado — refaça a emissão',
    );
  }

  // Versão 1 continua sendo lida para consulta e exibição de documento antigo,
  // mas não emite: os itens não têm quadro tributário, e o motor deixou de
  // aceitar item sem ele. Recompor o quadro agora, a partir do cadastro de
  // hoje, faria o snapshot deixar de retratar a venda — é justamente o que ele
  // existe para impedir.
  if (dados.versao === 1) {
    throw new BadRequestException(
      'Este documento foi criado antes do quadro tributário por item e não pode ' +
        'ser reemitido. Emita um documento novo para esta venda.',
    );
  }

  if (dados.versao !== VERSAO_SNAPSHOT_ATUAL) {
    throw new BadRequestException(
      'Snapshot do documento fiscal em formato não suportado — refaça a emissão',
    );
  }

  return dados;
}

/** O motor recusa a nota quando itens, total e pagamentos não fecham. */
function conferirSomatorios(dados: FiscalSnapshot): void {
  if (dados.itens.length === 0) {
    throw new BadRequestException('Documento fiscal sem itens');
  }

  const totalItens = somar(
    dados.itens.map((item) => arredondar(item.quantidade * item.valorUnitario)),
  );
  const totalPagamentos = somar(
    dados.pagamentos.map((pagamento) => pagamento.valor),
  );

  if (Math.abs(totalItens - dados.valorTotal) > TOLERANCIA_MONETARIA) {
    throw new BadRequestException(
      `Total dos itens (${totalItens.toFixed(2)}) diverge do valor total do documento (${dados.valorTotal.toFixed(2)})`,
    );
  }

  if (Math.abs(totalPagamentos - dados.valorTotal) > TOLERANCIA_MONETARIA) {
    throw new BadRequestException(
      `Total dos pagamentos (${totalPagamentos.toFixed(2)}) diverge do valor total do documento (${dados.valorTotal.toFixed(2)})`,
    );
  }

  conferirTotaisFiscais(dados);
}

/**
 * Os totais fiscais são soma dos itens — se divergirem, algo reescreveu o
 * snapshot depois de gravado. Recusar aqui é a última chance antes de a nota
 * consumir numeração com o grupo `<total>` errado.
 */
function conferirTotaisFiscais(dados: FiscalSnapshot): void {
  const totais = dados.totais;
  if (!totais) return;

  const conferencias: [string, number, number][] = [
    [
      'base de cálculo do ICMS',
      totais.vBC,
      somarDosItens(dados, (item) => item.imposto.icms.vBC),
    ],
    [
      'ICMS',
      totais.vICMS,
      somarDosItens(dados, (item) => item.imposto.icms.vICMS),
    ],
    [
      'ICMS ST',
      totais.vST,
      somarDosItens(dados, (item) => item.imposto.icms.vICMSST),
    ],
    ['PIS', totais.vPIS, somarDosItens(dados, (item) => item.imposto.pis.vPIS)],
    [
      'COFINS',
      totais.vCOFINS,
      somarDosItens(dados, (item) => item.imposto.cofins.vCOFINS),
    ],
  ];

  for (const [nome, informado, calculado] of conferencias) {
    if (Math.abs(informado - calculado) > TOLERANCIA_MONETARIA) {
      throw new BadRequestException(
        `Total de ${nome} (${informado.toFixed(2)}) diverge da soma dos itens (${calculado.toFixed(2)})`,
      );
    }
  }
}

function somarDosItens(
  dados: FiscalSnapshot,
  extrair: (item: FiscalSnapshot['itens'][number]) => number | undefined,
): number {
  return somar(dados.itens.map((item) => extrair(item) ?? 0));
}
