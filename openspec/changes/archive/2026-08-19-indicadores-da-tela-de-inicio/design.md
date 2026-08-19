## Context

A tela de início existe no frontend (`src/modules/dashboard/`) e é inteiramente
falsa: quatro cartões com literais e um timer de 700ms no lugar da requisição.
No backend não há módulo correspondente.

Os dados estão todos lá, e com índices úteis já criados:

- `Sale` — `@@index([companyId, saleDate])` e `@@index([companyId, status])`
- `FinancialEntry` — `@@index([companyId, type, status])` e `@@index([companyId, dueDate])`
- `FiscalDocument` — `@@index([companyId, status])`
- `CashSession` — `@@index([companyId, status])`
- `Product` — `currentStock`, `minStock`

Ou seja: o trabalho é de agregação e de recorte de período, não de modelagem.

## Goals / Non-Goals

**Goals:**

- Responder "como está a operação agora" em uma tela, sem o usuário abrir sete.
- Cada bloco carrega e falha sozinho.
- Nenhum número aparece para quem não pode vê-lo na tela do domínio.
- Os recortes de tempo batem com o dia do lojista.

**Non-Goals:**

- Relatório com período livre, exportação e detalhamento — tela própria.
- Metas e orçado — não há entidade de meta.
- Cache, view materializada ou tabela de resumo — otimização sem medição.
- Personalizar quais cartões cada usuário vê — a permissão já faz o recorte.

## Decisions

### Um endpoint por bloco, cada um com a permissão do seu domínio

A alternativa era um `GET /dashboard` devolvendo tudo. Ela perde em dois pontos.

**Latência:** a tela inteira passa a esperar a consulta mais lenta, e qualquer
erro de agregação derruba a home toda. Com sete rotas, o faturamento aparece
enquanto o financeiro ainda soma.

**Autorização:** um endpoint único só pode ter uma permissão. Ou ele seria
liberado a todos — e aí a home vira porta lateral para o faturamento que
`sales.list` nega ao estoquista — ou exigiria a permissão mais restritiva, e o
vendedor sem acesso ao financeiro ficaria sem nenhum indicador.

Com uma rota por domínio, o guard existente resolve tudo sem código novo, e o
frontend, que já conhece as permissões efetivas (`usePermissions`), simplesmente
não chama o que não pode ver.

**Trade-off aceito:** até sete requisições ao abrir a home. São paralelas,
independentes e cada uma toca um índice; o custo é de conexões, não de tempo de
parede.

### O bloco financeiro são duas rotas, não uma

Visualmente "financeiro" é um bloco só, mas `receivables` e `payables` são
domínios separados no sistema, com permissões separadas. Uni-los numa rota faria
quem tem só `receivables.list` receber o contas a pagar de brinde. A composição
visual é problema do frontend; o contrato segue a fronteira de autorização.

### O dia é o do lojista, não o do servidor

`new Date()` no servidor é UTC. Calcular "hoje" com fronteira UTC quebra de
forma silenciosa e no pior horário: às 21h de Brasília já é o dia seguinte em
UTC, então a loja ainda vendendo veria o faturamento do dia zerar. O usuário
concluiria que o sistema perdeu as vendas.

Os limites de dia e de mês são calculados no fuso da operação
(`America/Sao_Paulo`, com `APP_TIMEZONE` para sobrepor) usando `Intl`, e não um
deslocamento fixo de `-03:00`. O Brasil não tem horário de verão desde 2019, mas
gravar `-03:00` no código é apostar que ele não volta; `Intl` acompanha a base
de fusos do sistema sem que ninguém precise lembrar.

O instante gravado continua sendo UTC — muda só a fronteira da consulta.

### Faturamento é venda CONCLUIDA

`ORCAMENTO` é proposta, `EM_ABERTO` é venda em digitação e `CANCELADA` não
existe para efeito de receita. Somar qualquer um deles inflaria o número que o
dono usa para decidir. Orçamento aparece à parte, como "em aberto", que é
informação de funil e não de caixa.

### Saldo em aberto é `amount − paidAmount`, nunca `amount`

Um título `PARCIAL` de R$ 500 com R$ 100 recebidos deve pesar R$ 400 no "a
receber", não R$ 500. Como `Σ(a − p) = Σa − Σp`, os dois campos são somados no
mesmo `aggregate` e subtraídos depois — sem `$queryRaw` e sem trazer linha para
a memória.

### VENCIDO é derivado, como já é no financeiro

`receivables.service` já calcula o vencimento contra o agora em vez de gravar o
status, justamente para a tabela não mentir entre execuções de um job. O
dashboard usa o mesmo critério — `status ∈ {ABERTO, PARCIAL}` e `dueDate` no
passado — para que os dois lugares nunca discordem sobre quantos títulos estão
vencidos.

### A série do gráfico preenche os dias sem venda

`groupBy` devolve só os dias que tiveram venda. Plotar isso direto desenha uma
linha contínua entre 10/08 e 14/08 como se os dias no meio não existissem: a
queda vira estabilidade. O serviço gera o eixo completo do período e projeta os
totais sobre ele, com zero onde não houve venda.

### A série do gráfico é a única consulta em SQL cru

Agrupar por dia local não se expressa no `groupBy` do Prisma: ele agruparia por
instante exato, e cada venda viraria um ponto. As saídas eram trazer as vendas
do período para a memória e somar em JS, ou deixar o Postgres agrupar.

Um ano de uma loja movimentada são dezenas de milhares de linhas trafegadas para
produzir doze números. O Postgres faz `date_trunc('day', sale_date AT TIME ZONE
$tz)` sobre o índice `(company_id, sale_date)` e devolve a série pronta.

**Trade-off aceito:** é o primeiro `$queryRaw` do backend, e nele o filtro de
`company_id` e de `deleted_at` é escrito à mão, sem a rede de proteção do
Prisma. Por isso ele fica isolado num método só, parametrizado, e é o caso mais
coberto por teste do módulo. Nenhuma outra consulta do dashboard usa SQL cru.

### O alerta de estoque ignora o filtro de estabelecimento

`Product` não tem `establishmentId` — o saldo é da empresa, não da loja. Aceitar
o filtro e devolver o mesmo número seria mentir por omissão; recusá-lo quebraria
a home de quem escolheu uma filial. O bloco responde os números da empresa e
**declara no contrato** que o recorte não se aplica a ele, para que o frontend
não rotule o cartão com o nome da loja.

### O fechamento às cegas continua cego

`Company.cashBlindClose` esconde `salesTotal` e `expectedCash` de uma sessão
**aberta**, para que o operador conte a gaveta sem saber o esperado. Um bloco de
caixa ingênuo publicaria na home exatamente esse número.

O bloco de caixa mostra quais caixas estão abertos, desde quando e com quem — e
só revela o valor da sessão aberta quando a empresa não usa conferência às
cegas. A regra é lida da mesma coluna, não reimplementada.

### Nenhuma permissão nova

Criar `dashboard.read` seria criar um código que concede em bloco o que o resto
do sistema concede por domínio: quem o recebesse veria faturamento, contas e
fiscal de uma vez, contornando o desenho de perfis. Reaproveitar as permissões
existentes custa uma linha por rota e mantém uma verdade só sobre quem vê o quê.

## Risks / Trade-offs

- **Sete requisições na abertura da home.** Aceito: paralelas e baratas. Se o
  número incomodar, o caminho é HTTP/2 e não um endpoint gordo.
- **Sem cache.** Cada abertura reconsulta. As agregações batem em índices
  existentes e o volume por empresa é pequeno; materializar agora seria otimizar
  no escuro. O primeiro bloco que doer ganha cache — sozinho.
- **`Intl` depende do ICU do Node.** O Node 18+ oficial já vem com ICU completo;
  numa imagem `small-icu` o fuso cairia para UTC. O utilitário falha alto na
  inicialização se o fuso pedido não for reconhecido, em vez de calcular errado
  em silêncio.
- **Estabelecimento opcional muda o significado de alguns números.** Título
  financeiro tem `establishmentId` anulável; com o filtro ligado, títulos sem
  estabelecimento ficam de fora. Documentado no contrato.

## Migration Plan

Não há migration. O módulo é aditivo e só lê; nenhuma rota existente muda de
comportamento. O frontend troca a maquete pelo consumo real na change irmã, e
pode fazê-lo bloco a bloco.

## Open Questions

- O fuso deveria ser por empresa, e não do processo? Só faz diferença para um
  cliente fora de `America/Sao_Paulo`. Quando aparecer, vira coluna em
  `Company` e o utilitário passa a receber o fuso em vez de lê-lo do ambiente —
  a assinatura já foi desenhada para isso.
