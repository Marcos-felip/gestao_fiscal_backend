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

> As tabelas de **contas a pagar e a receber** (`financial_entries`, `financial_payments`) já existem
> no banco, mas ainda **não têm regras nem endpoints**. Ver [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md#financial_entries--contas-a-receber-e-a-pagar).

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
- Pode ser editada (fornecedor, notas)
- Pode ser confirmada ou cancelada

### CONFIRMADO
- Estoque **aumentado** automaticamente (movimentação ENTRADA por item)
- Numeração sequencial por empresa (`purchase_number`)
- **Não pode ser editada**
- Pode ser cancelada (com estorno automático do estoque)

### CANCELADO
- Se veio de CONFIRMADO: estoque **estornado** automaticamente (movimentação SAIDA por item)
- Não pode mais ser alterado

### Regras adicionais
- Apenas compras em RASCUNHO ou CANCELADO podem ser excluídas (soft delete) — exige a permissão `purchases.delete`, concedida por padrão a OWNER e ADMIN
- Número da compra (`purchase_number`) é único por empresa e sequencial
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
- Não pode mais ser alterada

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

### Regras adicionais
- Apenas vendas em `ORCAMENTO` ou `CANCELADA` podem ser excluídas (soft delete) — exige `sales.delete`, concedida por padrão a OWNER e ADMIN
- Número da venda (`sale_number`) é único por empresa e sequencial
- `subtotal` = `Σ (quantidade × preço_unitário)`; `total_amount` = `subtotal - discount`
- O desconto **não pode ser maior que o subtotal**
- Cliente é opcional — venda de balcão pode não ter cliente identificado
- Itens: mínimo 1 item por venda; enviar `items` no `PATCH` substitui a lista inteira

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
