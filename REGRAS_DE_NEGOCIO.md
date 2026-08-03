# Regras de Negócio — Gestão Fiscal

## 1. Visão Geral

O sistema é um SaaS (Software as a Service) de gestão fiscal e operacional para empresas brasileiras. Ele permite:

- Gerenciar múltiplas empresas com usuários compartilhados
- Controlar acesso por papéis e permissões granulares
- Controlar estoque de produtos
- Registrar e controlar compras
- Registrar vendas e orçamentos (PDV)
- Manter cadastro de clientes e fornecedores
- Preparar a base para emissão fiscal (NF-e)

- Controlar contas a receber, com títulos gerados pelas vendas a prazo

> **Contas a pagar** compartilha a mesma tabela (`financial_entries` com `type: PAGAR`), mas ainda
> **não tem regras nem endpoints**.

---

## 2. Multi-tenancy

### Regra fundamental
**Toda** entidade de negócio (produto, compra, parceiro, etc.) pertence a uma empresa específica, identificada pelo campo `company_id`.

### Contexto ativo
- Cada usuário possui uma **empresa ativa** (`company_active_id`)
- Todas as operações são executadas no contexto da empresa ativa
- O usuário pode trocar de empresa ativa a qualquer momento (desde que seja membro)
- Um usuário sem empresa ativa não pode acessar nenhum recurso protegido

### Isolamento de dados
- Um usuário **só pode ver dados da empresa ativa**
- Um usuário **só pode acessar empresas onde possui membership**
- Dados de empresas diferentes nunca se misturam

---

## 3. Fluxo de Onboarding

O sistema exige um fluxo obrigatório de 3 etapas para que o usuário possa operar:

### Etapa 1 — Criar conta de usuário
**Campos obrigatórios:** nome, e-mail, senha

**Resultado:** usuário criado, tokens JWT retornados

### Etapa 2 — Criar empresa
**Campos obrigatórios:** nome da empresa
**Campos opcionais:** tipo (MEI, ME, EPP, LTDA, SA, EIRELI, SLU), telefone

**Resultado automático:**
- Empresa criada
- Membership criado com papel **OWNER**
- Empresa definida como empresa ativa do usuário

### Etapa 3 — Configurar a empresa (Onboarding)
**Campos obrigatórios:** CNPJ, regime tributário, nome do estabelecimento
**Campos opcionais:** inscrição estadual, inscrição municipal, endereço completo

**Resultado:**
- Empresa atualizada com CNPJ e regime tributário
- Estabelecimento **MATRIZ** criado
- Empresa marcada como `is_onboarded = true`

> ⚠️ O onboarding só pode ser feito uma vez por empresa. Tentativas repetidas retornam erro.

---

## 4. Papéis e Permissões

A autorização acontece em **três camadas**:

1. **Papel (`MembershipRole`)** — `OWNER`, `ADMIN` ou `MEMBER`, definido no membership do usuário naquela empresa. Usado diretamente em operações estruturais (onboarding, gestão de papéis, exclusão de estabelecimento, gestão de permissões).
2. **Permissão granular (`dominio.acao`)** — códigos como `products.create`, guardados na tabela `permissions` e vinculados aos papéis **de cada empresa** em `company_role_permissions`. Usado na maioria dos endpoints de CRUD.
3. **Perfil de permissão** — conjunto nomeado de permissões vinculado a um membro específico. É o **único** caminho de acesso do papel MEMBER.

Na prática o papel não concede acesso por si só: ele define **qual conjunto de permissões** o usuário carrega.

```
efetivas(OWNER)  = catálogo completo (o guard nem consulta o banco)
efetivas(ADMIN)  = company_role_permissions[ADMIN]      → todas, por padrão
efetivas(MEMBER) = company_role_permissions[MEMBER] ∪ perfis vinculados
                   └── vazio por padrão ──┘
```

### OWNER
- **Acesso total por definição** — o guard de permissões nunca barra um OWNER, independentemente do que está cadastrado
- Único que pode: fazer o onboarding, alterar papéis e gerenciar permissões
- **Não pode alterar as próprias permissões** (nem as do ADMIN) — o que ele configura são os perfis dos MEMBERs
- **Não pode ser removido da empresa** e **não pode ter seu papel alterado**
- Não existe exclusão de empresa na API

### ADMIN
- Recebe **todas as permissões** por padrão: opera tudo abaixo do OWNER
- Cadastra, edita e remove usuários da empresa — **exceto o OWNER**
- O que o separa do OWNER são as operações travadas por papel: onboarding, alterar papéis e gerenciar permissões
- Suas permissões são fixas, como as do OWNER

### MEMBER
- **Nasce sem nenhuma permissão.** A empresa nova não recebe nenhuma linha de `company_role_permissions` para o papel MEMBER
- **Sem perfil vinculado = sem acesso a nada.** Todo endpoint protegido por permissão devolve `403`, e `GET /permissions/me` devolve `[]`
- Único papel que aceita **perfis de permissão** — é assim que se define o que cada membro pode fazer
- Dois MEMBERs da mesma empresa podem ter acessos completamente diferentes, conforme os perfis de cada um

### Tabela resumida (empresa recém-criada)

A coluna MEMBER é **❌ em todas as linhas** e por isso foi omitida: o papel nasce sem nenhuma
permissão. O que um MEMBER pode fazer depende exclusivamente dos perfis vinculados a ele — qualquer
linha desta tabela vira ✅ para um MEMBER específico se algum perfil dele contiver o código.

| Ação | OWNER | ADMIN | Controlado por |
|------|:-----:|:-----:|----------------|
| Configurar empresa (onboarding) | ✅ | ❌ | Papel |
| Editar dados da empresa | ✅ | ✅ | `company.edit` |
| Criar membros | ✅ | ✅ | `users.create` |
| Listar membros | ✅ | ✅ | `users.list` |
| Editar dados de outro usuário | ✅ | ✅ (menos o OWNER) | `users.edit` |
| Remover membros | ✅ | ✅ (menos o OWNER) | `users.delete` |
| Alterar papéis | ✅ | ❌ | Papel |
| Gerenciar o baseline do papel MEMBER (legado) | ✅ | somente leitura | Papel |
| Gerenciar perfis de permissão | ✅ | ✅ | `permissions.manage` |
| Vincular perfis a um membro | ✅ | ✅ | `permissions.manage` |
| Ver as próprias permissões | ✅ | ✅ | — (`GET /permissions/me`, aberto a qualquer membro) |
| Criar/editar estabelecimentos | ✅ | ✅ | `establishments.create` / `.edit` |
| Excluir estabelecimento | ✅ | ✅ | `establishments.delete` |
| CRUD de produtos | ✅ | ✅ | `products.*` |
| CRUD de parceiros | ✅ | ✅ | `partners.*` |
| Criar/editar compras (rascunho) | ✅ | ✅ | `purchases.create` / `.edit` |
| Confirmar compras | ✅ | ✅ | `purchases.confirm` |
| Cancelar compras | ✅ | ✅ | `purchases.cancel` |
| Excluir compras | ✅ | ✅ | `purchases.delete` |
| Criar/editar vendas e orçamentos | ✅ | ✅ | `sales.create` / `.edit` |
| Finalizar vendas | ✅ | ✅ | `sales.confirm` |
| Cancelar vendas | ✅ | ✅ | `sales.cancel` |
| Excluir vendas | ✅ | ✅ | `sales.delete` |
| Listar/ler contas a receber | ✅ | ✅ | `receivables.list` / `.read` |
| Criar título a receber manual | ✅ | ✅ | `receivables.create` |
| Registrar recebimento | ✅ | ✅ | `receivables.pay` |
| Cancelar título a receber | ✅ | ✅ | `receivables.cancel` |
| Listar/ler contas a pagar | ✅ | ✅ | `payables.list` / `.read` |
| Criar título a pagar manual | ✅ | ✅ | `payables.create` |
| Registrar pagamento | ✅ | ✅ | `payables.pay` |
| Cancelar título a pagar | ✅ | ✅ | `payables.cancel` |
| Movimentação manual de estoque | ✅ | ✅ | `stock.create` |

> A lista completa de códigos está no [API.md](./API.md#catálogo-de-permissões), com os códigos que
> compunham o antigo padrão do MEMBER marcados como sugestão para o primeiro perfil.

### Gestão de permissões

- As permissões são **por empresa**: cada empresa recebe uma cópia do conjunto padrão do sistema no momento em que é criada, e passa a evoluir de forma independente
- A cópia **exclui o papel MEMBER de propósito** — ele nasce vazio e é servido pelos perfis
- Qualquer membro consulta as próprias permissões em `GET /permissions/me` — é assim que o frontend decide o que exibir

**Baseline do papel MEMBER (legado).** `PATCH /permissions/:role` continua existindo e ainda permite
ao OWNER gravar um conjunto para o papel MEMBER, que valeria para **todos** os membros da empresa,
inclusive os sem perfil. O frontend não usa mais esse caminho e o conjunto fica vazio por padrão;
ele foi mantido apenas como escotilha de emergência. Regras dele:

- Apenas o **OWNER** pode alterar, e **somente o papel MEMBER** — OWNER e ADMIN são fixos (`400`)
- A atualização é uma **substituição total** dentro da empresa ativa
- Códigos inexistentes na tabela `permissions` são rejeitados com `404`

### Perfis de permissão

Um **perfil** é um conjunto nomeado de permissões (ex: "Estoquista", "Comprador"). Como o papel
MEMBER nasce vazio, o perfil é o **único** mecanismo que dá acesso a um MEMBER.

- Perfis são **da empresa**: o `name` é único por empresa e só é possível vincular perfis da própria empresa
- Um membro pode ter **vários perfis ao mesmo tempo** (N-N)
- **Só se aplicam a MEMBER.** Vincular perfil a OWNER ou ADMIN é rejeitado com `409` — eles já têm
  acesso amplo e fixo, então um perfil não mudaria nada
- Gerenciar e vincular perfis exige a permissão `permissions.manage` (por padrão OWNER e ADMIN)
- Vincular perfis obedece à mesma hierarquia de gerenciar usuário: ninguém mexe em quem tem papel superior ao seu
- Atualizar as permissões de um perfil, ou os perfis de um membro, é sempre **substituição total** da lista
- Excluir um perfil é **definitivo** (não é soft delete) e o desvincula de todos os membros
- Códigos inexistentes no catálogo são rejeitados com `422`

**Permissões efetivas de um MEMBER:**

```
efetivas(MEMBER) = company_role_permissions[MEMBER] ∪ (permissões de todos os perfis vinculados)
                   └──── vazio por padrão ────┘
```

Na prática, com o baseline vazio, isso é simplesmente a união dos perfis. A fórmula preserva o
baseline como termo porque o `PATCH /permissions/MEMBER` legado ainda pode preenchê-lo; o perfil
sempre **soma** acesso, nunca tira. OWNER (catálogo completo) e ADMIN (conjunto do papel) não passam
por essa etapa.

**Consequência operacional:** um MEMBER recém-criado — ou qualquer MEMBER que existia antes da
migration `20260728150000_empty_member_baseline` — não consegue fazer **nada** até receber um perfil.
Ao cadastrar um membro, vincular o perfil faz parte do fluxo, não é opcional. O conjunto que era o
padrão do MEMBER continua registrado em `role_permissions` e serve de base para o primeiro perfil.

### Hierarquia de papéis

**Ao atribuir papel** (`POST /memberships`, `POST /users`, `POST /users/:id/memberships`, `PATCH /memberships/:id/role`):

- O papel **OWNER nunca é atribuível pela API** — ele nasce com a criação da empresa
- Ninguém pode atribuir um papel **superior ao seu**: OWNER atribui ADMIN/MEMBER, ADMIN atribui ADMIN/MEMBER, MEMBER (se receber `users.create`) atribui apenas MEMBER

**Ao editar ou remover usuário** (`PATCH /users/:id`, `DELETE /memberships/:id`, `PUT /memberships/:id/profiles`):

- Ninguém gerencia um usuário de papel **superior ao seu** — um ADMIN não edita nem remove o OWNER
- Papéis de mesmo nível podem se gerenciar (ADMIN edita/remove outro ADMIN)
- O **OWNER continua não removível** por ninguém, nem por outro OWNER
- A edição altera apenas dados cadastrais (nome e e-mail); o papel continua sendo alterado só em `PATCH /memberships/:id/role`, exclusivo do OWNER

### Vinculação de usuários

- `POST /memberships` cria usuário + membership na empresa ativa (senha provisória interna)
- `POST /users` cria usuário + membership e devolve a senha provisória em `temporaryPassword`; o `companyId` do corpo **precisa ser a empresa ativa** (`403` caso contrário)
- `POST /users/:id/memberships` vincula um usuário já existente à empresa ativa
- Um usuário não pode ter dois memberships ativos na mesma empresa (`409`)
- **Todo usuário criado já recebe a empresa ativa (`companyActiveId`)** no mesmo passo. Sem isso ele
  faz login normalmente mas leva `403 No active company selected` em qualquer rota de tenant. Ao
  vincular um usuário que já existe, a empresa ativa só é definida se ele ainda não tiver nenhuma —
  quem já opera em outra empresa não tem o contexto trocado sem pedir

### Remoção de membro

`DELETE /memberships/:id` remove o **vínculo**, não a conta. Conta e vínculo são coisas separadas:
um usuário pode existir sem empresa nenhuma (é o estado de quem acabou de se registrar).

- O usuário continua conseguindo fazer login — ele cai no estado "sem empresa"
- Se a empresa removida era a ativa, o sistema aponta para outra empresa dele ou zera o campo
- Ficando **sem nenhuma empresa**, o refresh token também é zerado: sem isso o removido seguiria
  autenticado por até 7 dias
- Ele nunca enxerga dados da empresa de onde saiu: `GET /companies` e o `CompanyTenantGuard` só
  consideram memberships com `deleted_at IS NULL`
- Para readmitir, use `POST /users/:id/memberships`. `POST /memberships` devolve `409` porque a conta
  continua existindo com aquele e-mail

---

## 4.1. Senha provisória e primeiro acesso

- Usuários criados por um administrador (via `POST /memberships` ou `POST /users` sem `password`) recebem uma **senha provisória de 12 caracteres** e nascem com `force_password_change = true`
- O login desses usuários é bem-sucedido, mas a resposta traz `forcePasswordChange: true` — cabe ao frontend bloquear a navegação e conduzir à troca de senha
- A nova senha exige: mínimo 8 caracteres, ao menos uma maiúscula, uma minúscula e um dígito
- A nova senha **não pode ser igual à atual**, e `newPassword` deve conferir com `confirmPassword`
- Após a troca: `force_password_change = false` e `password_changed_at` recebe a data/hora
- Usuários que se auto-registram (`POST /auth/register`) nascem com `force_password_change = false`

---

## 5. Estabelecimentos

- Cada empresa pode ter múltiplos estabelecimentos (MATRIZ e FILIAIs)
- **Toda empresa deve ter exatamente uma MATRIZ** (criada no onboarding)
- **Não é possível criar uma segunda MATRIZ** para a mesma empresa
- **Não é possível excluir a MATRIZ**
- Filiais podem ser criadas e excluídas por quem tiver `establishments.create` / `establishments.delete` (por padrão OWNER e ADMIN)
- Compras são vinculadas a um estabelecimento específico

---

## 6. Produtos

- Cada produto pertence a uma empresa (isolamento multi-tenant)
- **SKU deve ser único dentro de uma empresa** (duas empresas diferentes podem ter o mesmo SKU)
- **Código de barras deve ser único dentro de uma empresa**
- Produtos têm estoque controlado pelo campo `current_stock`
- Produtos com `is_active = false` não aparecem nas listagens padrão
- Soft delete: produtos excluídos têm `deleted_at` preenchido e não aparecem mais
- Campos fiscais (NCM, CEST, CFOP, origem) são opcionais no MVP

### Unidades de medida aceitas
`UN`, `KG`, `LT`, `MT`, `CX`, `PC`, `PCT`, `DZ`

---

## 7. Parceiros (Clientes e Fornecedores)

- Um parceiro pode ser **CLIENT** (cliente), **SUPPLIER** (fornecedor) ou **BOTH** (ambos)
- Parceiros do tipo **PF** (Pessoa Física) usam CPF
- Parceiros do tipo **PJ** (Pessoa Jurídica) usam CNPJ
- O campo `cpf_cnpj` é validado com as regras do documento informado
- Parceiros com `is_active = false` não aparecem nas listagens padrão
- Soft delete disponível

---

## 8. Estoque

### Tipos de movimentação
| Tipo | Efeito no estoque | Quando usar |
|------|-------------------|-------------|
| `ENTRADA` | Aumenta `current_stock` | Recebimento de mercadorias |
| `SAIDA` | Diminui `current_stock` | Saída de mercadorias |
| `AJUSTE` | **Define** o valor do estoque | Correção de inventário |

### Regras
- **Estoque não pode ficar negativo**: tentativa de SAIDA com quantidade maior que o estoque atual retorna erro
- Movimentações manuais de estoque são registradas com motivo (opcional)
- Movimentações automáticas têm o `reference_id` preenchido com o ID do documento que as gerou — a compra (ENTRADA na confirmação, SAIDA no cancelamento) ou a venda (SAIDA na finalização, ENTRADA no cancelamento)
- Toda movimentação é registrada de forma permanente (histórico completo)
- A operação de criação de movimentação e atualização do estoque é **atômica** (transação)

---

## 9. Compras

### Ciclo de vida

```
RASCUNHO → CONFIRMADO → CANCELADO
RASCUNHO → CANCELADO
```

### RASCUNHO
- Compra criada mas não executada
- Estoque **não é afetado**
- **Nenhum título a pagar é gerado** — a compra ainda pode ser editada ou excluída, e o financeiro não
  deve enxergar dívida que talvez não exista
- Pode ser editada (fornecedor, notas, condição de pagamento)
- Pode ser confirmada ou cancelada

### CONFIRMADO
- Estoque **aumentado** automaticamente (movimentação ENTRADA por item)
- Numeração sequencial por empresa (`purchase_number`)
- Se `A_PRAZO`: os **títulos a pagar nascem aqui**, na mesma transação
- **Não pode ser editada**
- Pode ser cancelada (com estorno automático do estoque)

### CANCELADO
- Se veio de CONFIRMADO: estoque **estornado** automaticamente (movimentação SAIDA por item)
- Os títulos a pagar da compra passam a `CANCELADO` na mesma transação
- Não pode mais ser alterado

### Condição de pagamento e geração dos títulos

A compra guarda a condição (`paymentCondition`), o número de parcelas, o vencimento da primeira e o
intervalo entre elas. Guardar em vez de receber tudo na confirmação é deliberado: a compra nasce em
RASCUNHO e é confirmada depois, possivelmente por outra pessoa — sem persistir, o plano escolhido no
lançamento se perderia.

Na confirmação, dentro da transação que dá entrada no estoque:

| Condição | Títulos gerados |
|----------|-----------------|
| `A_VISTA` | **Nenhum** — foi pago no ato; contas a pagar é só o que fica em aberto |
| `A_PRAZO` | Um `FinancialEntry` `PAGAR` por parcela, status `ABERTO` |

Cada parcela recebe `amount = totalAmount / installments`, com **o resto dos centavos todo na última**
(R$ 100,00 em 3× vira 33,33 + 33,33 + 33,34 — senão a soma dos títulos ficaria abaixo do total da
compra para sempre), `dueDate` espaçado por `intervalDays` e `description` no formato
`Compra #<numero> (i/N)`. Sem `firstDueDate`, a primeira vence em `hoje + intervalDays`.

### Cancelar compra com parcela já paga

Se **qualquer** título da compra tiver pagamento registrado, o cancelamento é **recusado**:
`Compra possui parcelas pagas; estorne o financeiro antes`.

O caminho é estornar o título primeiro e só depois cancelar a compra. Cancelar em cascata apagaria
pagamentos já lançados — histórico de caixa não pode sumir por efeito colateral de outro módulo.
A checagem roda **antes** da devolução do estoque, então uma tentativa barrada não deixa nada
revertido pela metade.

### Regras adicionais
- Apenas compras em RASCUNHO ou CANCELADO podem ser excluídas (soft delete) — exige a permissão `purchases.delete`, concedida por padrão a OWNER e ADMIN
- Número da compra (`purchase_number`) é único por empresa e sequencial. **A numeração considera também as compras excluídas**: o índice único não enxerga `deleted_at`, e reaproveitar o número de uma compra excluída quebraria a criação da próxima
- Total calculado automaticamente: `Σ (quantidade × preço_unitário)`
- Itens: mínimo 1 item por compra

---

## 9.1. Vendas (PDV)

### Três eixos de status

Uma venda não tem um estado só. São três colunas independentes, e o módulo de vendas move apenas a primeira:

| Eixo | Coluna | Valores | Quem move |
|------|--------|---------|-----------|
| Comercial | `status` | `ORCAMENTO`, `EM_ABERTO`, `CONCLUIDA`, `CANCELADA` | módulo de vendas |
| Financeiro | `payment_status` | `PENDENTE`, `APROVADO`, `RECUSADO`, `ESTORNADO` | módulo financeiro |
| Fiscal | `fiscal_status` | `NAO_EMITIDO`, `PROCESSANDO`, `AUTORIZADO`, `REJEITADO`, `CANCELADO` | módulo fiscal |

**Única exceção:** cancelar uma venda cujo `payment_status` era `APROVADO` o leva a `ESTORNADO` —
o dinheiro não pode continuar aprovado numa venda desfeita.

Finalizar uma venda **não** aprova o pagamento nem emite documento fiscal. Uma venda pode estar
`CONCLUIDA` com pagamento `PENDENTE` e nota `NAO_EMITIDO`, e isso é o estado normal hoje.

### Ciclo de vida

```
ORCAMENTO → EM_ABERTO → CONCLUIDA → CANCELADA
ORCAMENTO → CONCLUIDA
ORCAMENTO → CANCELADA
```

### ORCAMENTO (estado inicial)
- **Não afeta o estoque.** Não há baixa nem reserva
- Pode ser editada por completo (itens, cliente, desconto, forma de pagamento)
- Pode ser promovida a `EM_ABERTO`, finalizada, cancelada ou excluída

### EM_ABERTO
- Venda em negociação, ainda sem baixa de estoque
- Mesmas permissões de edição do orçamento

### CONCLUIDA
- Estoque **diminuído** automaticamente (movimentação `SAIDA` por item)
- Numeração sequencial por empresa (`sale_number`)
- **Não pode ser editada nem excluída** — só cancelada

### CANCELADA
- Se veio de `CONCLUIDA`: estoque **estornado** (movimentação `ENTRADA` por item)
- Se veio de orçamento: nada acontece com o estoque, porque nada tinha saído
- Se o pagamento estava `APROVADO`: passa a `ESTORNADO`
- Os títulos gerados pela venda passam a `CANCELADO`
- **Bloqueado se alguma parcela já foi recebida** (ver [Condição de pagamento](#condição-de-pagamento-e-geração-dos-títulos))
- Não pode mais ser alterada

### Condição de pagamento e geração dos títulos

A venda declara como será paga. Quem decide se nasce título é essa condição, não a forma de pagamento:

| `paymentCondition` | Ao finalizar | `paymentStatus` |
|--------------------|--------------|-----------------|
| `A_VISTA` (default) | **nenhum título** | `APROVADO` |
| `A_PRAZO` | `installments` títulos `RECEBER`, status `ABERTO` | `PENDENTE` |

O raciocínio: contas a receber guarda **o que ficou em aberto**. Uma venda de balcão paga na hora não
deixa nada a receber — criar um título e quitá-lo no mesmo instante só poluiria o relatório.

Cada parcela vira uma linha com `dueDate = firstDueDate + intervalDays × (i-1)`, descrição
`"Venda #<n> (i/N)"` e o cliente da venda como parceiro. **O resto dos centavos vai todo na última
parcela** — R$ 100,00 em 3× dá 33,33 + 33,33 + **33,34**, senão a soma dos títulos ficaria um centavo
abaixo da venda para sempre.

Se `firstDueDate` não for informado, o 1º vencimento é **hoje + `intervalDays`** no momento da
finalização (não da criação) — um orçamento parado por semanas não nasce vencido.

### Formas de pagamento e troco

Uma venda à vista pode ser paga em **várias formas ao mesmo tempo** — parte no PIX, parte em dinheiro.
Cada forma vira uma linha em `sale_payments`, e é esse conjunto que passa a ser a **fonte de verdade**
do pagamento.

`sales.payment_method` continua existindo, mas foi rebaixada a **forma predominante** — a de maior
valor, gravada só para exibir em lista e agrupar relatório. Uma coluna única não consegue representar
um pagamento dividido, e insistir nela obrigaria a escolher qual forma "mente" menos.

**Quando é exigido:** ao finalizar uma venda `A_VISTA`, seja pelo PDV de uma chamada
(`POST /sales { confirm: true }`) ou pelo `POST /sales/:id/confirm`.

| Situação | `payments` |
|----------|------------|
| Orçamento | Não exigido — as formas são definidas ao fechar, não ao orçar |
| Finalização `A_VISTA` | **Obrigatório**, somando o total da venda |
| Finalização `A_PRAZO` | **Ignorado** — o que fica em aberto vira título, não pagamento |

**A soma tem tolerância de um centavo.** Um rateio arredondado no caixa não pode travar a venda, mas
uma diferença maior é erro de digitação e vira `400 Os pagamentos devem somar o total da venda`.

**Troco só existe em dinheiro.** Com `amountReceived` informado num pagamento `DINHEIRO`, o valor
precisa ser maior ou igual ao `amount` e o sistema grava `changeGiven = amountReceived - amount`. Nas
demais formas o campo é ignorado: em cartão ou PIX o valor entregue é exatamente o cobrado, e aceitar
um "recebido" diferente ali só criaria troco fantasma.

**Pagamento inválido derruba a venda antes de tocar no estoque.** A validação roda antes das
movimentações — não existe venda finalizada com pagamento pela metade, nem estoque baixado por uma
venda que não fechou.

Ao **cancelar** a venda, os pagamentos permanecem gravados. São histórico de caixa: quem conferiu o
fechamento precisa continuar enxergando o que entrou, mesmo depois do estorno.

> Ainda **não** existe entrada (misturar à vista com a prazo na mesma venda). A venda é inteira
> `A_VISTA` ou inteira `A_PRAZO`.

### Cancelar venda com parcela já recebida

**Bloqueado**, com `Venda possui parcelas recebidas; estorne o financeiro antes`.

A alternativa seria estornar os recebimentos automaticamente, e ela foi recusada: apagar uma baixa em
silêncio destrói histórico de caixa que alguém conferiu. O caminho é explícito — cancele ou estorne os
títulos primeiro, depois cancele a venda.

### Quando a disponibilidade de estoque é verificada

**Na finalização, nunca na criação.** Um orçamento pode ficar dias parado e o estoque muda nesse
intervalo — validar na criação daria uma garantia falsa. Consequência prática: é possível criar um
orçamento de 100 unidades tendo 3 em estoque; o erro aparece ao tentar finalizar.

A finalização inteira roda em **uma transação**: se um único item não tiver saldo, nada é gravado —
nem movimentação, nem baixa, nem mudança de status. A mensagem nomeia o produto que faltou
(`Estoque insuficiente para o produto <nome>`).

Quando o mesmo produto aparece em mais de um item da venda, as quantidades **se acumulam** na
validação: 6 + 6 unidades de um produto com saldo 10 é recusado, não aprovado duas vezes contra o
mesmo saldo.

### Venda de balcão (PDV)

`POST /sales` com `confirm: true` cria e finaliza na mesma chamada — um clique no caixa, sem passar
pelo orçamento. É o mesmo caminho de código da finalização, com as mesmas validações e a mesma
transação.

> **Efeito colateral de autorização:** esse caminho exige apenas `sales.create`. Quem pode lançar
> uma venda pode finalizá-la pelo PDV mesmo sem `sales.confirm`. Se a operação precisar separar quem
> lança de quem finaliza, o perfil de quem só lança **não** pode ter `sales.create`.

Desde o módulo de [caixa](#94-caixa), finalizar uma venda `A_VISTA` por esse caminho exige que o
operador tenha uma **sessão de caixa aberta** — o PDV precisa consultar `GET /cash-sessions/current`
antes de vender.

`GET /sales/context` devolve estabelecimentos, clientes e produtos ativos numa chamada só, também sob
`sales.create`. É o que permite que o perfil do vendedor tenha **apenas `sales.*`**: sem esse
endpoint, a tela do PDV dependeria de `establishments.list`, `partners.list` e `products.list`, e
conceder as três abriria os menus de cadastro para quem só deveria vender.

### Regras adicionais
- Apenas vendas em `ORCAMENTO` ou `CANCELADA` podem ser excluídas (soft delete) — exige `sales.delete`, concedida por padrão a OWNER e ADMIN
- Número da venda (`sale_number`) é único por empresa e sequencial
- `subtotal` = `Σ (quantidade × preço_unitário)`; `total_amount` = `subtotal - discount`
- O desconto **não pode ser maior que o subtotal**
- Cliente é opcional — venda de balcão pode não ter cliente identificado
- Itens: mínimo 1 item por venda; enviar `items` no `PATCH` substitui a lista inteira
- `sale_number` **não é reaproveitado**: a numeração considera até as vendas excluídas, porque o
  índice único do banco também as considera

---

## 9.2. Contas a receber

Um título é uma parcela a receber. Chega por dois caminhos: **automático**, na finalização de uma
venda `A_PRAZO`, ou **manual**, para o que não passou pelo módulo de vendas (serviço avulso, acerto
de cliente).

### Ciclo de vida

```
ABERTO → PARCIAL → PAGO
ABERTO → CANCELADO
PARCIAL → CANCELADO
```

| Status | Quando |
|--------|--------|
| `ABERTO` | Nenhuma baixa registrada |
| `PARCIAL` | `0 < paidAmount < amount` |
| `PAGO` | `paidAmount >= amount` |
| `CANCELADO` | Cancelado manualmente ou junto com a venda de origem |

### VENCIDO é derivado, não gravado

O enum tem `VENCIDO`, mas **nenhum título recebe esse status**. O vencimento é calculado na leitura:
`dueDate` no passado e status em `ABERTO` ou `PARCIAL`, exposto como `isOverdue`.

Gravar exigiria um job diário e, entre duas execuções, a tabela estaria mentindo — um título vencido
às 00h01 só apareceria como vencido na próxima rodada. Derivar não tem esse buraco e dispensa
agendador.

### Baixa (recebimento)

- Suporta **baixa parcial**: chamar de novo com o resto quita o título
- Cada baixa é uma linha em `financial_payments` — o histórico fica, mesmo depois de quitado
- `paidAmount` do título é recalculado a cada baixa, e o status junto
- **Bloqueios:** valor acima do saldo (`amount - paidAmount`), título `CANCELADO`, título já quitado
- Tudo em transação: ou grava a baixa e atualiza o título, ou nada

### Cancelamento

- Título `PAGO` **não pode ser cancelado** — quitado é fato consumado
- Cancelar a venda de origem cancela os títulos em bloco, desde que nenhum tenha baixa

---

## 9.3. Contas a pagar

Mesma tabela, mesmas regras, lado oposto: um título é uma parcela **a pagar**. Chega por dois
caminhos: **automático**, na confirmação de uma compra `A_PRAZO`, ou **manual**, para a despesa que
não passa por compra — aluguel, energia, salários, impostos.

O ciclo de vida, o cálculo do vencimento (`isOverdue` derivado na leitura, sem job) e as regras de
baixa são **idênticos aos de contas a receber**, inclusive as mensagens de erro. O que muda:

| | Contas a receber | Contas a pagar |
|---|---|---|
| Tipo do título | `RECEBER` | `PAGAR` |
| Origem automática | Venda `A_PRAZO` finalizada | Compra `A_PRAZO` confirmada |
| Parceiro | Cliente | Fornecedor |
| Permissões | `receivables.*` | `payables.*` |

Cada service **força o próprio `type` em toda consulta**: um usuário com acesso apenas a contas a
pagar não enxerga nem baixa um título a receber, e vice-versa. É o que permite separar as duas
alçadas com perfis diferentes.

### Cancelamento

- Título `PAGO` **não pode ser cancelado**
- Cancelar a compra de origem cancela os títulos em bloco, desde que nenhum tenha baixa —
  ver [Cancelar compra com parcela já paga](#cancelar-compra-com-parcela-já-paga)

---

## 9.4. Caixa

Duas entidades e um turno:

- **Terminal** (`cash_registers`) — a gaveta física, cadastrada por estabelecimento
- **Sessão** (`cash_sessions`) — o turno de um operador naquele terminal, da abertura ao fechamento

A sessão é o que dá endereço ao dinheiro: sem ela, uma diferença na gaveta não teria a quem ser
atribuída, nem período em que teria acontecido.

### Abertura

- O operador é sempre o usuário autenticado — não se abre caixa em nome de outro
- `openingAmount` é o fundo de troco que entra na gaveta
- **Um terminal aceita uma sessão aberta por vez** (`Este caixa já tem uma sessão aberta`)
- **Um operador só pode ter uma sessão aberta por vez** (`Você já tem um caixa aberto`) — em dois
  terminais ao mesmo tempo ficaria ambíguo em qual gaveta a venda dele entra
- Terminal inativo não aceita abertura

### Vender exige caixa aberto

Finalizar uma venda **`A_VISTA`** sem sessão aberta é bloqueado com
`Abra um caixa para registrar vendas em dinheiro`. Vale tanto para `POST /sales { confirm: true }`
quanto para `POST /sales/:id/confirm`.

- Venda **`A_PRAZO`** não exige caixa: não entra dinheiro na gaveta, entra título a receber
- **Orçamento** não exige caixa — nada é movimentado
- Toda venda finalizada com sessão aberta é carimbada com `cash_session_id`, **inclusive a a prazo**.
  Não é dinheiro em gaveta; é o que permite o turno responder quanto saiu fiado
- O carimbo é do operador que finalizou, não de quem criou o orçamento

### Sangria e suprimento

- `SANGRIA` tira dinheiro da gaveta (depósito bancário, retirada de segurança) e **diminui** o esperado
- `SUPRIMENTO` coloca (reforço de troco) e **aumenta** o esperado
- O valor é sempre positivo — o sinal vem do tipo
- Só é aceito em sessão `ABERTA`

### Conferência e fechamento

A conferência é **só de dinheiro**. Cartão e PIX aparecem no resumo como informação, mas não entram
no esperado em gaveta: esse dinheiro nunca passou por ela e não é o operador quem responde por ele.

```
esperado = fundo de troco + vendas em dinheiro + suprimentos - sangrias
diferença = contado - esperado
```

- `vendas em dinheiro` = soma dos `sale_payments` com `method = DINHEIRO` das vendas `CONCLUIDA`
  da sessão. Venda cancelada sai da conta porque deixa de ser `CONCLUIDA`
- Diferença **negativa é falta**, positiva é sobra
- **O caixa fecha sempre.** Quebra é fato a registrar, não motivo para travar o turno
- Diferença acima de **1 centavo** exige justificativa: `Informe uma observação para a diferença de caixa`
- Sessão fechada não reabre nem aceita movimentação

### Fechamento às cegas

Configurável por empresa em `companies.cash_blind_close` (padrão desligado). Serve para o operador
contar a gaveta sem saber o alvo — conferência cega vale mais do que conferência com gabarito.

Com a política ligada e a sessão ainda **aberta**, ficam ocultos o esperado em gaveta, as vendas em
dinheiro, o total vendido, o detalhamento por forma de pagamento e o total a prazo. Continuam
visíveis o fundo de troco, sangrias, suprimentos e a quantidade de vendas.

> Esconder apenas o esperado não resolveria: o operador somaria fundo + dinheiro + suprimentos −
> sangrias e chegaria ao mesmo número. Por isso o bloqueio é do conjunto.

Depois do fechamento tudo é revelado, inclusive para quem fechou: a cegueira existe até a contagem,
não depois dela.

### Regras adicionais

- Terminal com sessão aberta **não pode ser desativado nem excluído**
- Sessão **não tem soft delete**: é registro de auditoria do turno
- O histórico (`cash.list`) é de supervisão — enxerga os turnos de todos os operadores; o operador
  comum precisa apenas da própria sessão (`cash.read`)

---

## 10. Soft Delete

- Registros "excluídos" **não são apagados do banco** — recebem `deleted_at = data/hora`
- Registros com `deleted_at != null` **não aparecem em nenhuma consulta**
- Permite auditoria e recuperação de dados históricos
- Vale para dados de **negócio**. As tabelas de autorização (permissões, perfis e vínculos) são
  configuração e usam exclusão física

### O que NÃO pode ser excluído
| Entidade | Restrição |
|----------|-----------|
| Membership OWNER | Não pode ser removido da empresa |
| Establishment MATRIZ | Não pode ser excluído |
| Compra CONFIRMADA | Não pode ser excluída (apenas cancelada) |
| Venda CONCLUIDA | Não pode ser excluída nem editada (apenas cancelada) |
| Venda com parcela recebida | Não pode ser cancelada até o financeiro ser estornado |
| Título PAGO | Não pode ser cancelado |
| Caixa com sessão aberta | Não pode ser desativado nem excluído |
| Sessão de caixa | Não tem soft delete — é registro de auditoria do turno |
