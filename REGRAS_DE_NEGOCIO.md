# Regras de Negócio — Gestão Fiscal

## 1. Visão Geral

O sistema é um SaaS (Software as a Service) de gestão fiscal e operacional para empresas brasileiras. Ele permite:

- Gerenciar múltiplas empresas com usuários compartilhados
- Controlar acesso por papéis e permissões granulares
- Controlar estoque de produtos
- Registrar e controlar compras
- Manter cadastro de clientes e fornecedores
- Preparar a base para emissão fiscal (NF-e)

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

A autorização acontece em **duas camadas**:

1. **Papel (`MembershipRole`)** — `OWNER`, `ADMIN` ou `MEMBER`, definido no membership do usuário naquela empresa. Usado diretamente em operações estruturais (onboarding, gestão de papéis, exclusão de estabelecimento, gestão de permissões).
2. **Permissão granular (`dominio.acao`)** — códigos como `products.create`, guardados na tabela `permissions` e vinculados aos papéis **de cada empresa** em `company_role_permissions`. Usado na maioria dos endpoints de CRUD.

Na prática o papel não concede acesso por si só: ele define **qual conjunto de permissões** o usuário carrega.

### OWNER
- **Acesso total por definição** — o guard de permissões nunca barra um OWNER, independentemente do que está cadastrado
- Único que pode: fazer o onboarding, alterar papéis e gerenciar permissões
- **Não pode alterar as próprias permissões** (nem as do ADMIN) — só as do MEMBER são editáveis
- **Não pode ser removido da empresa** e **não pode ter seu papel alterado**
- Não existe exclusão de empresa na API

### ADMIN
- Recebe **todas as permissões** por padrão: opera tudo abaixo do OWNER
- Cadastra, edita e remove usuários da empresa — **exceto o OWNER**
- O que o separa do OWNER são as operações travadas por papel: onboarding, alterar papéis e gerenciar permissões
- Suas permissões são fixas, como as do OWNER

### MEMBER
- Único papel **configurável**, e é para isso que existe o módulo de permissões
- Por padrão: opera produtos, parceiros, estoque e compras; confirma compras mas **não as cancela nem exclui**; lê estabelecimentos mas não os cria/edita; não edita dados da empresa; **não cadastra usuários**

### Tabela resumida (configuração padrão)

| Ação | OWNER | ADMIN | MEMBER | Controlado por |
|------|:-----:|:-----:|:------:|----------------|
| Configurar empresa (onboarding) | ✅ | ❌ | ❌ | Papel |
| Editar dados da empresa | ✅ | ✅ | ❌ | `company.edit` |
| Criar membros | ✅ | ✅ | ❌ | `users.create` |
| Listar membros | ✅ | ✅ | ✅ | `users.list` |
| Editar dados de outro usuário | ✅ | ✅ (menos o OWNER) | ❌ | `users.edit` |
| Remover membros | ✅ | ✅ (menos o OWNER) | ❌ | `users.delete` |
| Alterar papéis | ✅ | ❌ | ❌ | Papel |
| Gerenciar permissões | ✅ | somente leitura | ❌ | Papel |
| Ver as próprias permissões | ✅ | ✅ | ✅ | — (`GET /permissions/me`) |
| Criar/editar estabelecimentos | ✅ | ✅ | ❌ | `establishments.create` / `.edit` |
| Excluir estabelecimento | ✅ | ✅ | ❌ | `establishments.delete` |
| CRUD de produtos | ✅ | ✅ | ✅ | `products.*` |
| CRUD de parceiros | ✅ | ✅ | ✅ | `partners.*` |
| Criar/editar compras (rascunho) | ✅ | ✅ | ✅ | `purchases.create` / `.edit` |
| Confirmar compras | ✅ | ✅ | ✅ | `purchases.confirm` |
| Cancelar compras | ✅ | ✅ | ❌ | `purchases.cancel` |
| Excluir compras | ✅ | ✅ | ❌ | `purchases.delete` |
| Movimentação manual de estoque | ✅ | ✅ | ✅ | `stock.create` |

> A lista completa de códigos está no [API.md](./API.md#catálogo-de-permissões).

### Gestão de permissões

- As permissões são **por empresa**: cada empresa recebe uma cópia do conjunto padrão do sistema no momento em que é criada, e passa a evoluir de forma independente
- Apenas o **OWNER** pode alterar permissões, e **somente as do papel MEMBER** — as de OWNER e ADMIN são fixas (`400` ao tentar alterá-las)
- A atualização é uma **substituição total**: o conjunto enviado passa a ser o único conjunto do papel naquela empresa
- Códigos inexistentes na tabela `permissions` são rejeitados com `404`
- Qualquer membro consulta as próprias permissões em `GET /permissions/me` — é assim que o frontend decide o que exibir

### Hierarquia de papéis

**Ao atribuir papel** (`POST /memberships`, `POST /users`, `POST /users/:id/memberships`, `PATCH /memberships/:id/role`):

- O papel **OWNER nunca é atribuível pela API** — ele nasce com a criação da empresa
- Ninguém pode atribuir um papel **superior ao seu**: OWNER atribui ADMIN/MEMBER, ADMIN atribui ADMIN/MEMBER, MEMBER (se receber `users.create`) atribui apenas MEMBER

**Ao editar ou remover usuário** (`PATCH /users/:id`, `DELETE /memberships/:id`):

- Ninguém gerencia um usuário de papel **superior ao seu** — um ADMIN não edita nem remove o OWNER
- Papéis de mesmo nível podem se gerenciar (ADMIN edita/remove outro ADMIN)
- O **OWNER continua não removível** por ninguém, nem por outro OWNER
- A edição altera apenas dados cadastrais (nome e e-mail); o papel continua sendo alterado só em `PATCH /memberships/:id/role`, exclusivo do OWNER

### Vinculação de usuários

- `POST /memberships` cria usuário + membership na empresa ativa (senha provisória interna)
- `POST /users` cria usuário + membership e devolve a senha provisória em `temporaryPassword`; o `companyId` do corpo **precisa ser a empresa ativa** (`403` caso contrário)
- `POST /users/:id/memberships` vincula um usuário já existente à empresa ativa
- Um usuário não pode ter dois memberships ativos na mesma empresa (`409`)

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
- Movimentações automáticas (geradas por compras confirmadas) têm o `reference_id` preenchido com o ID da compra
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

## 10. Soft Delete

- Registros "excluídos" **não são apagados do banco** — recebem `deleted_at = data/hora`
- Registros com `deleted_at != null` **não aparecem em nenhuma consulta**
- Permite auditoria e recuperação de dados históricos

### O que NÃO pode ser excluído
| Entidade | Restrição |
|----------|-----------|
| Membership OWNER | Não pode ser removido da empresa |
| Establishment MATRIZ | Não pode ser excluído |
| Compra CONFIRMADA | Não pode ser excluída (apenas cancelada) |
