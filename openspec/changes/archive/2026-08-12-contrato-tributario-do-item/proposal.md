## Why

O item da nota não carrega imposto. O `NfceItem` leva NCM, CEST, CFOP, unidade,
quantidade, valor, GTIN, origem e CSOSN — e para por aí. Base de cálculo,
alíquota e valores não existem no snapshot nem no payload do motor, que completa
o que falta com regra fixa (PIS e COFINS cravados em CST 07).

Duas consequências, e a segunda é a grave.

**A primeira:** cinco campos do cadastro de produto são escritos e nunca lidos.
`cstPis`, `cstCofins`, `aliquotaIcms`, `aliquotaPis` e `aliquotaCofins` são
gravados em `products.service.ts` e não aparecem em nenhuma leitura do sistema. O
usuário preenche alíquota achando que muda a nota; não muda.

**A segunda:** o snapshot é congelado. `fiscal-emission.processor.ts` lê
`document.snapshot` direto e nunca o reconstrói — decisão certa para auditoria,
com um corolário duro: *o que não entrou no snapshot na emissão não entra nunca
mais*. O contador recebe os XMLs e monta a EFD a partir deles. Cada nota emitida
sem base e alíquota é uma nota que **não tem como gerar escrituração correta
depois**. Não é bug com conserto — é dado que não foi capturado.

Por isso esta etapa vem antes de NF-e, devolução e regra fiscal: as outras podem
esperar, esta acumula dívida a cada nota emitida.

## What Changes

- **`NfceItem` ganha o bloco `imposto`** com ICMS, IPI, PIS e COFINS — situação
  tributária, base, alíquota e valores —, espelhando o contrato que a change
  irmã do motor publica.
- **Snapshot passa para `versao: 2`.** Documentos em `versao: 1` continuam
  legíveis: retry e consulta de nota antiga não podem quebrar.
- **Os cinco campos mortos ganham função.** `cstPis` e `cstCofins` do produto
  passam a alimentar o XML no lugar do 07 fixo; as alíquotas passam a compor o
  quadro quando a situação tributária as exigir.
- **`fiscalComplete` do produto passa a exigir a situação tributária de PIS e
  COFINS**, hoje ausente na checagem.
- **Migration de retrocompatibilidade**: produtos existentes recebem CST de PIS e
  COFINS que **reproduzem o comportamento atual**, para nenhuma emissão parar no
  dia do deploy. Ver `design.md`.
- **Somatórios de imposto no total da nota** — `vBC`, `vICMS`, `vST`, `vPIS`,
  `vCOFINS` no grupo de totais, hoje inexistentes.
- **Relatório de pendências fiscais** passa a apontar produto sem situação
  tributária de PIS/COFINS, com texto que diz o que preencher.

## Capabilities

### New Capabilities
- `fiscal-taxation`: quadro tributário por item do documento fiscal — situação,
  base, alíquota e valores — e sua composição nos totais da nota.

### Modified Capabilities
- `nfce-emission`: o payload enviado ao motor passa a carregar o quadro
  tributário completo por item.
- `fiscal-document`: o snapshot ganha versão 2, mantendo leitura da versão 1.
- `fiscal-configuration`: a completude fiscal do produto passa a considerar a
  situação tributária de PIS e COFINS.

## Impact

- **Migration**: backfill de `cst_pis` e `cst_cofins` nos produtos existentes.
  Nenhuma coluna nova — os campos já existem e estavam ociosos.
- `src/fiscal/emission/fiscal-snapshot.builder.ts`: `montarItens` passa a compor
  o quadro tributário; `FiscalSnapshot` vai para `versao: 2`.
- `src/fiscal/emission/emit-request.builder.ts`: encaminha o bloco e passa a
  aceitar snapshot nas duas versões.
- `src/fiscal/emission/fiscal-rules.ts`: regras de quais campos cada situação
  tributária exige — a regra do motor espelhada aqui, para falhar cedo e em
  português, como já acontece com NCM, CFOP e CSOSN.
- `src/fiscal/fiscal-engine/fiscal-engine.interface.ts`: contrato do item.
- **Dependência de ordem**: a change do motor precisa estar no ar antes, com o
  fallback ativo. Backend e motor não sobem juntos.
- **Sem mudança de comportamento visível** nesta etapa: quem emite CSOSN 102
  continua emitindo igual. O que muda é o que fica gravado.
- Changes irmãs: `fiscal_service` e `gestao_fiscal_frontend`.
- Etapa **1** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
