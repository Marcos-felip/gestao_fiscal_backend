## Why

A resposta fiscal de um item não é um campo do produto — é função da operação.

Hoje `BEB-009` (Cerveja Lata 350ml) tem CFOP `5102` e CSOSN `102` gravados no
cadastro. Essa resposta está certa para **uma** situação: venda dentro de MG, a
consumidor final, empresa do Simples, produto sem ST. Mude qualquer variável e
ela deixa de valer:

| Operação | Resposta correta |
|---|---|
| Venda no balcão em Montes Claros | cerveja é ST em MG → CSOSN **500** |
| Venda para cliente na Bahia | CFOP **6102**, com DIFAL |
| Cliente devolve | CFOP **1202**, espelhando os impostos da original |
| Emitente fosse Regime Normal | **CST** com base e alíquota destacadas |

O produto é o mesmo nos quatro casos. O que muda é a operação.

A etapa 1 criou a estrutura para carregar o quadro tributário. Esta etapa cria
**quem responde**: dado o produto, o emitente, o destinatário e o tipo de
operação, qual CFOP, qual situação tributária, quais alíquotas.

Sem isso, NF-e interestadual e devolução não têm como sair corretas — e o produto
continua limitado a uma única operação.

## What Changes

- **Porta `IRegraFiscal`**, no mesmo padrão do `IFiscalEngine`: o domínio pergunta
  e não sabe quem responde. É o que permite trocar implementação própria por
  serviço de terceiro sem tocar em domínio.
- **Contexto da operação** como entrada: NCM, CEST, origem, regime do emitente,
  UF de origem e destino, se o destinatário é contribuinte, consumidor final,
  finalidade da nota e tipo de operação.
- **Implementação atrás da porta**, resolvendo CFOP + situação tributária +
  alíquotas, com fallback para os campos do produto quando nenhuma regra casar.
  **Qual implementação depende de uma decisão que precede o código** — assinar a
  matriz de um fornecedor ou construir própria. Ver `design.md`; a recomendação
  atual é **assinar**.
- **Cadastro de regras** com CRUD e permissão própria (`fiscal.rules.read/edit`),
  como ferramenta de **configuração e diagnóstico** — não como fluxo do lojista.
  Regras nascem de um conjunto base por UF e ramo; o cliente final não cadastra
  matriz tributária.
- **Precedência explícita e visível**: regra mais específica vence, e a resposta
  informa **qual regra respondeu** — sem isso, depurar uma nota errada vira
  adivinhação.
- **O produto deixa de ser a fonte de CFOP e situação tributária** e passa a ser
  o padrão de venda interna, usado quando nenhuma regra casa.
- **Simulador**: dado um produto e uma operação, mostrar o quadro que sairia. É o
  que permite o contador conferir antes de emitir, e não depois.

## Capabilities

### New Capabilities
- `fiscal-rules`: resolução do quadro tributário por operação — CFOP, situação
  tributária e alíquotas — atrás de uma porta substituível.

### Modified Capabilities
- `fiscal-taxation`: o quadro tributário do item passa a ser resolvido pela regra
  fiscal, com o cadastro do produto como padrão.

## Impact

- **Migration**: tabelas de regra fiscal por empresa; permissões novas com os
  três passos (catálogo, template e **backfill em `company_role_permissions`**).
- `src/fiscal/rules/` — módulo novo com a porta, a implementação própria e o
  resolvedor.
- `src/fiscal/emission/fiscal-snapshot.builder.ts`: `montarItens` passa a
  consultar a regra em vez de ler o produto direto.
- **Depende da etapa 1**: sem o bloco tributário no item, não há onde a resposta
  da regra ser gravada.
- **Duas decisões precedem o código**, e estão detalhadas em `design.md`:
  **(a)** assinar ou construir a matriz tributária — a recomendação virou
  *assinar*, depois que o cliente confirmou venda interestadual; **(b)** se o
  DIFAL é devido por emitente do Simples (ADI 5464), que muda o escopo pela
  metade e precisa do contador.
- **Risco de comportamento**: um produto que hoje emite com CFOP 5102 fixo passa
  a depender da resolução. A change precisa garantir que, sem regra cadastrada, o
  resultado seja idêntico ao de hoje.
- Change irmã no frontend: `regra-fiscal-por-operacao`.
- Etapa **2** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
