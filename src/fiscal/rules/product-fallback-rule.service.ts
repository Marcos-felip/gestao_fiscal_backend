import { Injectable } from '@nestjs/common';
import {
  ContextoFiscal,
  IRegraFiscal,
  QuadroResolvido,
} from './fiscal-rules.port';
import { situacaoTributaria } from '../emission/fiscal-rules';

/** Aparece no snapshot quando a resposta veio do cadastro, e não de uma regra. */
export const REGRA_CADASTRO_DO_PRODUTO = 'cadastro-do-produto';

/**
 * Primeira implementação da porta: responde com o cadastro do produto.
 *
 * É **exatamente o comportamento anterior à etapa 2**, agora atrás da porta.
 * Existe por três motivos:
 *
 * 1. A costura passa a existir sem mudar nenhuma nota — `montarItens` deixa de
 *    ler o produto direto, e o resultado continua idêntico.
 * 2. Continua valendo como **fallback** quando a implementação real entrar e
 *    nenhuma regra casar o contexto.
 * 3. Não presume qual será a implementação real. A decisão entre assinar uma
 *    matriz tributária e construir a própria ainda não foi tomada, e as duas
 *    entram aqui sem tocar em quem chama.
 */
@Injectable()
export class ProductFallbackRule implements IRegraFiscal {
  resolver(contexto: ContextoFiscal): Promise<QuadroResolvido> {
    const { produto, emitente } = contexto;

    return Promise.resolve({
      cfop: produto.cfopPadrao,
      situacaoIcms: situacaoTributaria(
        emitente.crt,
        produto.csosnPadrao,
        produto.cstIcmsPadrao,
      ),
      cstPis: produto.cstPis,
      cstCofins: produto.cstCofins,
      aliquotaIcms: produto.aliquotaIcms,
      aliquotaPis: produto.aliquotaPis,
      aliquotaCofins: produto.aliquotaCofins,
      regraAplicada: REGRA_CADASTRO_DO_PRODUTO,
    });
  }
}
