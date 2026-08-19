## ADDED Requirements

### Requirement: Indicadores de venda da tela de início
O sistema SHALL fornecer, para a empresa ativa, o faturamento e a quantidade de
vendas de hoje, de ontem e do mês corrente, com o ticket médio de cada recorte.

Somente vendas `CONCLUIDA` e não excluídas compõem o faturamento. Orçamento é
proposta e venda em digitação não é receita; somá-los inflaria o número que o
dono usa para decidir.

#### Scenario: Dia com vendas concluídas
- **WHEN** a empresa concluiu vendas hoje
- **THEN** o bloco devolve a quantidade, o valor somado e o ticket médio do dia

#### Scenario: Orçamento não é faturamento
- **WHEN** existem vendas em `ORCAMENTO` ou `EM_ABERTO` no período
- **THEN** elas ficam fora do faturamento e aparecem apenas como propostas em aberto

#### Scenario: Venda cancelada
- **WHEN** uma venda concluída é cancelada
- **THEN** ela deixa de compor o faturamento do período

#### Scenario: Dia sem venda
- **WHEN** nenhuma venda foi concluída hoje
- **THEN** o bloco devolve zero em quantidade e valor, e ticket médio zero — não um erro

### Requirement: Recortes de tempo no fuso da operação
O sistema SHALL calcular as fronteiras de "hoje", "ontem" e "mês corrente" no
fuso horário da operação, e não no fuso do servidor.

Às 21h de Brasília já é o dia seguinte em UTC. Com fronteira UTC, a loja ainda
aberta veria o faturamento do dia zerar e concluiria que o sistema perdeu as
vendas.

#### Scenario: Venda no fim da noite
- **WHEN** uma venda é concluída às 21h no horário local, já em outra data UTC
- **THEN** ela conta no dia local em que foi feita

#### Scenario: Virada do mês
- **WHEN** o mês local vira
- **THEN** o recorte "mês corrente" começa na meia-noite local do dia 1º

### Requirement: Série de faturamento para o gráfico
O sistema SHALL fornecer a série temporal de faturamento do período pedido, com
**um ponto para cada intervalo do eixo**, inclusive os sem venda.

Devolver só os dias que tiveram venda faz o gráfico desenhar uma reta entre duas
datas distantes: uma queda de movimento é lida como estabilidade.

#### Scenario: Período com dias vazios
- **WHEN** o período pedido contém dias sem nenhuma venda
- **THEN** esses dias aparecem na série com total zero

#### Scenario: Períodos aceitos
- **WHEN** o cliente pede a série
- **THEN** o sistema aceita os últimos 30 dias ou os últimos 12 meses, recusando outro valor em português

### Requirement: Indicadores de contas a receber e a pagar
O sistema SHALL fornecer, separadamente para receber e pagar, os títulos
vencidos, os que vencem hoje, os que vencem nos próximos sete dias e o total em
aberto, com quantidade e valor.

#### Scenario: Título parcialmente pago
- **WHEN** um título de R$ 500 tem R$ 100 baixados
- **THEN** ele pesa R$ 400 no total em aberto, não R$ 500

#### Scenario: Título vencido
- **WHEN** um título `ABERTO` ou `PARCIAL` tem vencimento no passado
- **THEN** ele é contado como vencido, pelo mesmo critério que o módulo financeiro usa na leitura

#### Scenario: Título cancelado ou quitado
- **WHEN** o título está `PAGO` ou `CANCELADO`
- **THEN** ele não compõe nenhum dos recortes em aberto

### Requirement: Situação fiscal do mês
O sistema SHALL fornecer a contagem de documentos fiscais do mês corrente por
situação e o valor autorizado no período, além do aviso de certificado A1
próximo do vencimento.

#### Scenario: Documentos do mês
- **WHEN** o mês teve documentos autorizados, rejeitados e cancelados
- **THEN** cada situação aparece com sua contagem, e o valor somado considera só os autorizados

#### Scenario: Certificado perto de vencer
- **WHEN** o certificado de um estabelecimento vence dentro de 30 dias
- **THEN** o bloco avisa, informando a data e os dias restantes

#### Scenario: Empresa que ainda não emite
- **WHEN** não há configuração fiscal ativa
- **THEN** o bloco devolve as contagens zeradas e nenhum aviso de certificado, sem erro

### Requirement: Alerta de estoque
O sistema SHALL apontar os produtos ativos zerados e os que estão no mínimo ou
abaixo dele, com a contagem de cada grupo e uma amostra dos itens mais críticos.

Produto sem estoque mínimo definido não entra no alerta de mínimo: não há
parâmetro contra o qual comparar, e supor um faria o sistema alarmar sozinho.

#### Scenario: Produto abaixo do mínimo
- **WHEN** um produto ativo tem estoque atual menor ou igual ao mínimo definido
- **THEN** ele é contado no alerta e pode aparecer na amostra

#### Scenario: Produto sem mínimo definido
- **WHEN** o produto não tem estoque mínimo cadastrado
- **THEN** ele não entra no alerta de mínimo, mas entra no de zerado se o saldo for zero

#### Scenario: Produto inativo ou excluído
- **WHEN** o produto está inativo ou foi excluído
- **THEN** ele não aparece em nenhum alerta

### Requirement: Situação dos caixas
O sistema SHALL informar quais caixas estão abertos, desde quando e sob qual
operador, e quantas sessões foram fechadas hoje.

#### Scenario: Caixa aberto
- **WHEN** existe sessão `ABERTA`
- **THEN** o bloco informa o caixa, o operador e o horário de abertura

#### Scenario: Empresa com fechamento às cegas
- **WHEN** a empresa usa conferência às cegas e a sessão está aberta
- **THEN** o valor movimentado na sessão não é revelado — é o número que a conferência existe para esconder

#### Scenario: Empresa sem fechamento às cegas
- **WHEN** a empresa não usa conferência às cegas
- **THEN** o valor vendido na sessão aberta pode ser exibido

### Requirement: Cada bloco exige a permissão do seu domínio
O sistema SHALL exigir, em cada bloco do dashboard, a mesma permissão que a tela
do domínio correspondente exige, e SHALL recusar o bloco a quem não a tem.

A tela de início não pode ser uma porta lateral: quem não pode listar vendas não
pode ler o faturamento delas em outro endereço.

#### Scenario: Usuário sem acesso ao financeiro
- **WHEN** um membro sem `receivables.list` pede o bloco de contas a receber
- **THEN** o acesso é recusado, e os blocos que ele pode ver continuam funcionando

#### Scenario: OWNER
- **WHEN** o usuário é OWNER
- **THEN** todos os blocos respondem, sem depender de concessão cadastrada

### Requirement: Recorte por estabelecimento
O sistema SHALL consolidar os indicadores de toda a empresa por padrão e SHALL
aceitar um estabelecimento opcional para restringir o recorte.

#### Scenario: Sem filtro
- **WHEN** nenhum estabelecimento é informado
- **THEN** os números somam todos os estabelecimentos da empresa ativa

#### Scenario: Estabelecimento de outra empresa
- **WHEN** o estabelecimento informado não pertence à empresa ativa
- **THEN** a requisição é recusada em português, sem revelar se ele existe
