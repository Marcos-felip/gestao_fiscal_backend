## Why

**A tela de início é uma maquete.** `dashboard-page.vue` roda um
`setTimeout(700ms)` fingindo carregamento e entrega quatro cartões com valores
escritos no código — `R$ 0,00`, `0`, `0`, `0` — sob a legenda "Nenhuma nota
emitida ainda". O próprio arquivo admite: *"Quando existir o endpoint real,
troque o timer pela chamada ao repositório"*. Não existe módulo `dashboard` no
backend.

O efeito é pior do que uma tela vazia: a home **mente**. Quem vendeu o dia
inteiro abre o sistema e lê "Faturamento no mês: R$ 0,00". Depois de duas
visitas, ninguém mais olha para a primeira tela do produto — e o usuário passa a
navegar direto para o PDV, sem nunca saber que há três títulos vencidos ou que
uma NFC-e foi rejeitada ontem.

Os dados para responder tudo isso já estão no banco e nenhum deles está exposto
de forma consolidada: `Sale`, `FinancialEntry`, `FiscalDocument`, `CashSession`,
`Product`. O que falta é a agregação — e ela não pode ser feita no frontend,
porque exigiria baixar a base inteira para somar quatro números.

E os dois indicadores que a maquete escolheu — produtos e parceiros cadastrados —
são números de implantação, não de operação. Contam quantas vezes alguém usou um
formulário, não como o negócio foi hoje. Eles saem.

## What Changes

- **Módulo `dashboard` novo**, só de leitura: nenhuma rota escreve, nenhuma cria
  entidade. Ele consolida o que os outros módulos já governam.
- **Sete endpoints, um por bloco**, para que a tela componha em paralelo e cada
  parte falhe sozinha: uma consulta financeira lenta não pode segurar o
  faturamento do dia.
- **Cada endpoint exige a permissão do domínio que ele resume** — `sales.list`
  para faturamento, `receivables.list` para o que entra, `payables.list` para o
  que sai, `fiscal.read` para os documentos, `products.list` para o estoque,
  `cash.list` para os caixas. A home deixa de ser uma porta lateral para
  números que a tela do domínio nega.
- **O dia é o dia do lojista, não o do servidor.** Os recortes "hoje", "ontem" e
  "mês" são calculados no fuso da operação, e não em UTC.
- **O fechamento às cegas continua cego.** Quando `cashBlindClose` está ligado, a
  home não revela o total vendido de uma sessão aberta — que é exatamente o
  número que a conferência às cegas existe para esconder.
- **Recorte por empresa, com filtro opcional por estabelecimento** (`?establishmentId=`),
  para o gerente que quer ver só a loja dele.

**Fora do escopo, de propósito:**

- **Relatórios.** O que entra aqui responde "como estamos agora"; período
  arbitrário, exportação e detalhamento por produto ou vendedor são relatório, e
  relatório tem tela própria.
- **Metas e comparação com orçado.** Não existe entidade de meta no sistema.
- **Cache ou materialização.** As agregações são sobre índices que já existem;
  medir antes de otimizar. Se algum bloco doer, ele é o candidato — não todos.
- **Alterar as telas de domínio.** O dashboard lê; quem escreve continua sendo
  cada módulo.

## Capabilities

### New Capabilities
- `dashboard`: os indicadores consolidados da tela de início — o que a empresa
  vendeu, o que tem a receber e a pagar, como está a emissão fiscal, quais
  produtos estão acabando e quais caixas estão abertos.

### Modified Capabilities

Nenhuma. O dashboard não muda regra de venda, de título nem de emissão — ele lê
o que esses módulos produziram. Escrever requisito de faturamento dentro de
`nfce-emission` faria uma capacidade descrever a regra de outra.

## Impact

- **Banco: nenhuma migration de tabela.** Só leitura sobre modelos existentes.
- **Backend:** módulo novo `src/dashboard/`, mais um utilitário de fuso em
  `src/common/utils/`.
- **Permissões:** nenhuma permissão nova. O dashboard reaproveita as dos
  domínios — de propósito, para não criar um código que conceda em bloco o que
  as telas concedem em separado.
- **API:** `GET /dashboard/sales`, `/dashboard/sales-chart`,
  `/dashboard/receivables`, `/dashboard/payables`, `/dashboard/fiscal`,
  `/dashboard/stock-alerts` e `/dashboard/cash`.
- **Frontend:** nenhuma mudança aqui. Trocar a maquete pelo consumo real é
  trabalho do repositório do frontend, em change própria — esta entrega para no
  contrato, já espelhado no `API.md` de lá.
