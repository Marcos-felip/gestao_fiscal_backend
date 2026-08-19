## Why

Cliente devolve mercadoria e não existe documento para isso. Hoje a única saída é
cancelar a nota — que só funciona dentro do prazo, e não serve para devolução
parcial nem para devolução meses depois.

Devolução é **NF-e com finalidade 4**, referenciando a nota original e
**espelhando os impostos dela**. Essa última parte é o motivo de esta etapa vir
por último: se a nota original não guardou base de cálculo e alíquota, não há o
que espelhar. É a etapa 1 que torna esta possível.

Sem devolução, o estoque e o financeiro também ficam sem contrapartida: a
mercadoria volta e nada no sistema registra.

## What Changes

- **Devolução a partir do documento original**, total ou **parcial** — o usuário
  escolhe itens e quantidades.
- **NF-e de devolução** com `finNFe = 4` e `refNFe` apontando a chave da
  original.
- **Impostos espelhados da original**, item a item, na proporção devolvida. Não
  se recalcula: a devolução tem que refletir o que foi tributado, não o que seria
  tributado hoje.
- **CFOP de devolução** resolvido pela regra fiscal da etapa 2, a partir do CFOP
  da original.
- **Estoque retorna** com movimentação `ENTRADA` vinculada à devolução.
- **Financeiro**: título a receber correspondente é abatido ou cancelado conforme
  a proporção devolvida.
- **Trava contra devolução acima do saldo**: a soma das devoluções de um item não
  pode passar a quantidade da nota original.
- **Permissão** `fiscal.devolucao`.

## Capabilities

### New Capabilities
- `fiscal-return`: devolução de mercadoria como NF-e de finalidade 4,
  referenciando a original e espelhando seus impostos, com reflexo em estoque e
  financeiro.

### Modified Capabilities
- `fiscal-document`: o documento passa a poder referenciar outro documento.

## Impact

- **Migrations**: vínculo entre documento de devolução e original, com itens e
  quantidades devolvidas; permissão nova com os **três passos**.
- `src/fiscal/` — caso de uso da devolução e builder de snapshot próprio.
- `src/stock/` e `src/receivables/` — contrapartidas de estoque e financeiro,
  ambas na mesma transação da devolução.
- **Depende das etapas 1, 2 e 3.** Sem o quadro tributário na original não há o
  que espelhar; sem NF-e não há documento; sem regra fiscal não há CFOP de
  devolução.
- **Revisar antes de implementar** — esta é a proposta escrita mais longe do
  código real. Ver o aviso no roteiro fiscal.
- Change irmã no frontend.
- Etapa **5** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
