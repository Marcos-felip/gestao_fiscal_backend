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
 * Responde com o que está gravado no cadastro do produto — nada mais.
 *
 * É **exatamente o comportamento anterior à etapa 2**, agora atrás da porta. Foi
 * o que permitiu `montarItens` parar de ler o produto direto e passar a
 * perguntar, sem que uma única nota mudasse: trocar a leitura pela pergunta e o
 * conteúdo da resposta ao mesmo tempo tornaria impossível saber qual dos dois
 * causou uma diferença.
 *
 * **Hoje é a única implementação. Depois vira a última.** Quando a matriz
 * tributária entrar, ela responde por operação — "cerveja + MG + consumidor
 * final → CSOSN 500" — e esta continua valendo para o item que nenhuma regra
 * casou (task 4.3 da change). O código não muda; muda quem é consultado antes.
 *
 * **Ignora quase todo o contexto de propósito.** Recebe UF de origem e destino,
 * perfil do destinatário e tipo de operação, e usa só o produto e o regime do
 * emitente. O cadastro não sabe responder por operação — tem uma resposta só. Se
 * esta classe começasse a olhar a UF de destino, viraria matriz tributária
 * disfarçada, e sem as tabelas que uma matriz precisa ter.
 */
@Injectable()
export class CadastroDoProdutoRule implements IRegraFiscal {
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
