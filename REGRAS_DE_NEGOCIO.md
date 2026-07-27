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
2. **Permissão granular (`dominio.acao`)** — códigos como `products.create`, guardados na tabela `permissions` e vinculados aos papéis em `role_permissions`. Usado na maioria dos endpoints de CRUD.

Na prática o papel não concede acesso por si só: ele define **qual conjunto de permissões** o usuário carrega.

### OWNER
- Controle total da empresa; possui **todas** as permissões
- Único que pode: fazer o onboarding, alterar papéis, remover membros, excluir estabelecimentos e gerenciar permissões
- **Não pode ser removido da empresa**
- **Não pode ter seu papel alterado**

### ADMIN
- Acesso operacional completo (CRUD de produtos, parceiros, estoque, compras, estabelecimentos)
- Pode confirmar e cancelar compras
- **Não possui `users.create` por padrão** — logo, não cadastra novos membros

### MEMBER
- Acesso operacional restrito, totalmente configurável pelo OWNER
- Por padrão: cria compras e as confirma, mas **não pode cancelá-las**; lê estabelecimentos mas não os cria/edita; não edita dados da empresa
- Por padrão **possui `users.create`**, ou seja, cadastra novos membros

### Tabela resumida (configuração padrão)

| Ação | OWNER | ADMIN | MEMBER | Controlado por |
|------|:-----:|:-----:|:------:|----------------|
| Configurar empresa (onboarding) | ✅ | ❌ | ❌ | Papel |
| Editar dados da empresa | ✅ | ✅ | ❌ | `company.edit` |
| Criar membros | ✅ | ❌ | ✅ | `users.create` |
| Listar membros | ✅ | ✅ | ✅ | `users.list` |
| Alterar papéis | ✅ | ❌ | ❌ | Papel |
| Remover membros | ✅ | ❌ | ❌ | Papel |
| Gerenciar permissões | ✅ | somente leitura | ❌ | Papel |
| Criar/editar estabelecimentos | ✅ | ✅ | ❌ | `establishments.create` / `.edit` |
| Excluir estabelecimento | ✅ | ❌ | ❌ | Papel |
| CRUD de produtos | ✅ | ✅ | ✅ | `products.*` |
| CRUD de parceiros | ✅ | ✅ | ✅ | `partners.*` |
| Criar/editar compras (rascunho) | ✅ | ✅ | ✅ | `purchases.create` / `.edit` |
| Confirmar compras | ✅ | ✅ | ✅ | `purchases.confirm` |
| Cancelar compras | ✅ | ✅ | ❌ | `purchases.cancel` |
| Movimentação manual de estoque | ✅ | ✅ | ✅ | `stock.create` |

> A lista completa de códigos está no [API.md](./API.md#catálogo-de-permissões).

### Gestão de permissões

- Apenas o **OWNER** pode alterar permissões, e **somente as do papel MEMBER** — as de OWNER e ADMIN são fixas (`400` ao tentar alterá-las)
- A atualização é uma **substituição total**: o conjunto enviado passa a ser o único conjunto do papel
- Códigos inexistentes na tabela `permissions` são rejeitados com `404`
- ⚠️ **As permissões são globais, não por empresa.** `role_permissions` não tem `company_id`, então alterar o papel MEMBER afeta todas as empresas da instância. Enquanto isso não mudar, trate a tela de permissões como configuração de plataforma, não de tenant.

### Vinculação de usuários

- `POST /memberships` cria usuário + membership na empresa ativa (senha provisória interna)
- `POST /users` cria usuário + membership e devolve a senha provisória em `temporaryPassword`
- `POST /users/:id/memberships` vincula um usuário já existente à empresa ativa
- Um usuário não pode ter dois memberships ativos na mesma empresa (`409`)
- ⚠️ O papel informado na criação **não é validado contra o papel de quem cria** — hoje qualquer usuário com `users.create` consegue criar um `OWNER`

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
- Filiais podem ser criadas e excluídas livremente (por OWNER ou ADMIN)
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
- Apenas compras em RASCUNHO ou CANCELADO podem ser excluídas (soft delete) — ⚠️ na prática o endpoint `DELETE /purchases/:id` exige a permissão `purchases.delete`, que não existe na tabela `permissions`, então a exclusão está indisponível para todos os papéis
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
