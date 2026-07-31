# Banco de Dados — Gestão Fiscal

## Tecnologia

- **SGBD:** PostgreSQL 16
- **ORM:** Prisma 7
- **Ambiente de desenvolvimento:** Docker Compose (`docker compose up -d`)
- **Porta padrão:** 5432
- **Interface visual:** pgAdmin em `http://localhost:5050`

## Diagrama de Entidades (ERD)

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│    users    │────<│ memberships  │>────│    companies      │
│─────────────│     │──────────────│     │───────────────────│
│ id (PK)     │     │ id (PK)      │     │ id (PK)           │
│ name        │     │ user_id (FK) │     │ name              │
│ email       │     │ company_id(FK│     │ type              │
│ password_   │     │ role         │     │ phone             │
│   hash      │     │ deleted_at   │     │ cnpj              │
│ refresh_    │     └──────────────┘     │ tax_regime        │
│   token     │                          │ is_onboarded      │
│ company_    │                          │ deleted_at        │
│   active_id │──────────────────────────┤                   │
│ deleted_at  │                          └────────┬──────────┘
└─────────────┘                                   │
                                                  │1
                        ┌─────────────────────────┤
                        │                         │
                  ┌─────┴──────────┐   ┌──────────┴──────────┐
                  │establishments  │   │      products        │
                  │────────────────│   │──────────────────────│
                  │ id (PK)        │   │ id (PK)              │
                  │ company_id(FK) │   │ company_id (FK)      │
                  │ type (MATRIZ/  │   │ name, sku, barcode   │
                  │   FILIAL)      │   │ unit, cost_price     │
                  │ name, cnpj     │   │ sale_price           │
                  │ endereco...    │   │ current_stock        │
                  │ deleted_at     │   │ ncm, cest, cfop      │
                  └────────┬───────┘   │ deleted_at           │
                           │           └──────────┬───────────┘
                           │                      │
                   ┌───────┴──────┐     ┌─────────┴──────────┐
                   │  purchases   │     │  stock_movements   │
                   │ (FK: estab,  │     │ (FK: product)      │
                   │  FK: supplier│     └────────────────────┘
                   └──────┬───────┘
                          │
                   ┌──────┴──────────┐
                   │ purchase_items  │
                   │ (FK: purchase,  │
                   │  FK: product)   │
                   └─────────────────┘

                  ┌───────────────┐
                  │   partners    │
                  │───────────────│
                  │ id (PK)       │
                  │ company_id(FK)│
                  │ type          │
                  │ person_type   │
                  │ name, cpf_cnpj│
                  │ endereco...   │
                  │ deleted_at    │
                  └───────────────┘

  ── Vendas ──

                  ┌────────────────────────┐
                  │         sales          │
                  │────────────────────────│
                  │ id (PK)                │
                  │ company_id (FK)        │
                  │ establishment_id (FK)  │
                  │ customer_id (FK part.) │
                  │ status                 │  ORCAMENTO/EM_ABERTO/CONCLUIDA/CANCELADA
                  │ payment_status         │  eixo do financeiro
                  │ fiscal_status          │  eixo do fiscal
                  │ sale_number (UQ p/ emp)│
                  │ subtotal, discount     │
                  │ total_amount           │
                  │ deleted_at             │
                  └───────┬────────────────┘
                          │1:N
                  ┌───────┴────────┐
                  │   sale_items   │
                  │ (FK: sale,     │
                  │  FK: product)  │
                  └────────────────┘

  ── Financeiro (RECEBER → /receivables · PAGAR → /payables) ──

           ┌───────────────────────────┐
           │     financial_entries     │  título a receber (venda) ou a pagar (compra)
           │───────────────────────────│
           │ id (PK)                   │
           │ company_id (FK)           │
           │ establishment_id (FK, opc)│
           │ type (RECEBER/PAGAR)      │
           │ status                    │
           │ partner_id (FK, opc)      │
           │ sale_id (FK, opc)         │──> sales
           │ purchase_id (FK, opc)     │──> purchases
           │ amount, paid_amount       │
           │ due_date                  │
           │ installment_number/total  │
           │ deleted_at                │
           └───────────┬───────────────┘
                       │1:N
           ┌───────────┴───────────────┐
           │    financial_payments     │  baixas parciais ou totais
           │ (FK: entry ON DELETE CASC)│
           └───────────────────────────┘

  ── Autorização ──

      ┌──────────────────┐          ┌────────────────────────┐
      │   permissions    │────1:N──<│    role_permissions    │  (template padrão)
      │──────────────────│          │────────────────────────│
      │ code (PK)        │          │ role (PK, enum)        │
      │ description      │          │ permission_code (PK,FK)│
      └────────┬─────────┘          └────────────────────────┘
               │
               │            ┌──────────────────────────────┐
               ├────1:N────<│  company_role_permissions    │  (efetivo, por empresa)
               │            │──────────────────────────────│
               │            │ company_id (PK, FK companies)│
               │            │ role (PK, enum)              │
               │            │ permission_code (PK, FK)     │
               │            └──────────────────────────────┘
               │
               │            ┌───────────────────────────────┐
               └────1:N────<│permission_profile_permissions │
                            │───────────────────────────────│
                            │ profile_id (PK, FK)           │
                            │ permission_code (PK, FK)      │
                            └───────────────┬───────────────┘
                                            │N:1
                            ┌───────────────┴───────────────┐
                            │     permission_profiles       │>──N:1──┐
                            │───────────────────────────────│        │
                            │ id (PK)                       │        │
                            │ company_id (FK companies)     │────────┘
                            │ name (UNIQUE por empresa)     │
                            │ description                   │
                            └───────────────┬───────────────┘
                                            │1:N
                            ┌───────────────┴───────────────┐
                            │      membership_profiles      │
                            │───────────────────────────────│
                            │ membership_id (PK, FK)        │──> memberships
                            │ profile_id (PK, FK)           │
                            └───────────────────────────────┘
```

## Modelos

### `users` — Usuários

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `name` | VARCHAR | ✅ | Nome completo |
| `email` | VARCHAR | ✅ | E-mail único |
| `password_hash` | VARCHAR | ✅ | Senha hasheada (bcrypt) |
| `refresh_token` | VARCHAR | ❌ | Refresh token hasheado (nulo após logout) |
| `company_active_id` | UUID (FK) | ❌ | Empresa ativa |
| `force_password_change` | BOOLEAN | ✅ | Exige troca de senha no próximo acesso (default `false`; `true` para usuários criados por administradores) |
| `password_changed_at` | TIMESTAMP | ❌ | Data da última troca de senha |
| `created_at` | TIMESTAMP | ✅ | Data de criação |
| `updated_at` | TIMESTAMP | ✅ | Data de atualização |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

### `companies` — Empresas (Tenant)

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `name` | VARCHAR | ✅ | Nome da empresa |
| `type` | ENUM | ❌ | Tipo: MEI, ME, EPP, LTDA, SA, EIRELI, SLU |
| `phone` | VARCHAR | ❌ | Telefone |
| `cnpj` | VARCHAR | ❌ | CNPJ (único, preenchido no onboarding) |
| `tax_regime` | ENUM | ❌ | Regime tributário |
| `is_onboarded` | BOOLEAN | ✅ | Empresa configurada? |
| `created_at` | TIMESTAMP | ✅ | |
| `updated_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

### `memberships` — Vínculos Usuário-Empresa

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `user_id` | UUID (FK) | ✅ | Referência ao usuário |
| `company_id` | UUID (FK) | ✅ | Referência à empresa |
| `role` | ENUM | ✅ | OWNER, ADMIN ou MEMBER |
| `created_at` | TIMESTAMP | ✅ | |
| `updated_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

**Constraint:** `(user_id, company_id)` é UNIQUE.

### `establishments` — Estabelecimentos

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa proprietária |
| `type` | ENUM | ✅ | MATRIZ ou FILIAL |
| `name` | VARCHAR | ✅ | Nome do estabelecimento |
| `cnpj` | VARCHAR | ❌ | CNPJ do estabelecimento |
| `inscricao_estadual` | VARCHAR | ❌ | Inscrição Estadual |
| `inscricao_municipal` | VARCHAR | ❌ | Inscrição Municipal |
| `cep` | VARCHAR | ❌ | CEP |
| `street` | VARCHAR | ❌ | Logradouro |
| `number` | VARCHAR | ❌ | Número |
| `complement` | VARCHAR | ❌ | Complemento |
| `neighborhood` | VARCHAR | ❌ | Bairro |
| `city` | VARCHAR | ❌ | Cidade |
| `state` | CHAR(2) | ❌ | UF (ex: SP, RJ) |
| `ibge_code` | VARCHAR | ❌ | Código IBGE do município |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

### `products` — Produtos

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa proprietária |
| `name` | VARCHAR | ✅ | Nome do produto |
| `description` | TEXT | ❌ | Descrição |
| `sku` | VARCHAR | ❌ | Código interno (único por empresa) |
| `barcode` | VARCHAR | ❌ | Código de barras (único por empresa) |
| `unit` | ENUM | ✅ | Unidade: UN, KG, LT, MT, CX, PC, PCT, DZ |
| `cost_price` | DECIMAL(12,4) | ❌ | Preço de custo |
| `sale_price` | DECIMAL(12,4) | ❌ | Preço de venda |
| `current_stock` | DECIMAL(12,4) | ✅ | Estoque atual (default 0) |
| `min_stock` | DECIMAL(12,4) | ❌ | Estoque mínimo (alerta) |
| `is_active` | BOOLEAN | ✅ | Produto ativo? |
| `ncm` | VARCHAR | ❌ | Nomenclatura Comum do Mercosul |
| `cest` | VARCHAR | ❌ | Código CEST |
| `cfop` | VARCHAR | ❌ | CFOP padrão |
| `origin` | SMALLINT | ❌ | Origem da mercadoria (0-8) |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

**Constraints:** `(company_id, sku)` UNIQUE · `(company_id, barcode)` UNIQUE

### `partners` — Parceiros (Clientes/Fornecedores)

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa proprietária |
| `type` | ENUM | ✅ | CLIENT, SUPPLIER ou BOTH |
| `person_type` | ENUM | ✅ | PF ou PJ |
| `name` | VARCHAR | ✅ | Nome / Razão social |
| `trade_name` | VARCHAR | ❌ | Nome fantasia |
| `cpf_cnpj` | VARCHAR | ❌ | CPF ou CNPJ |
| `rg_ie` | VARCHAR | ❌ | RG ou Inscrição Estadual |
| `email` | VARCHAR | ❌ | E-mail |
| `phone` | VARCHAR | ❌ | Telefone |
| *(campos de endereço)* | — | ❌ | Mesmos campos de Establishment |
| `is_active` | BOOLEAN | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

### `stock_movements` — Movimentações de Estoque

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa |
| `product_id` | UUID (FK) | ✅ | Produto |
| `type` | ENUM | ✅ | ENTRADA, SAIDA ou AJUSTE |
| `quantity` | DECIMAL(12,4) | ✅ | Quantidade movimentada |
| `reason` | VARCHAR | ❌ | Motivo (movimentações manuais) |
| `reference_id` | UUID | ❌ | ID da compra ou da venda geradora |
| `created_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

### `purchases` e `purchase_items` — Compras

Estrutura com `purchase_number` (numeracao sequencial por empresa) e `supplier_id` (fornecedor, opcional).

Colunas de parcelamento, espelhando `sales`:

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `payment_condition` | ENUM `PaymentCondition` | ✅ | `A_VISTA` (default) ou `A_PRAZO` |
| `installments` | INTEGER | ✅ | Número de parcelas (default 1; usado só em `A_PRAZO`) |
| `first_due_date` | TIMESTAMP | ❌ | Vencimento da 1ª parcela; nulo = hoje + `interval_days` na confirmação |
| `interval_days` | INTEGER | ✅ | Dias entre parcelas (default 30) |

- O plano de parcelas é **gravado na compra**, não passado na confirmação: a compra nasce em RASCUNHO
  e é confirmada depois, então o dado precisa sobreviver ao intervalo
- Os títulos a pagar nascem **só na confirmação** — RASCUNHO ainda pode ser editado ou excluído, e o
  financeiro não deve enxergar dívida que talvez não exista
- ⚠️ **A numeração ignora o soft delete**, pela mesma razão descrita em `sales.sale_number`

### `sales` — Vendas

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa |
| `establishment_id` | UUID (FK) | ✅ | Estabelecimento que vendeu |
| `customer_id` | UUID (FK → `partners.id`) | ❌ | Cliente (venda de balcão pode não ter) |
| `status` | ENUM `SaleStatus` | ✅ | Default `ORCAMENTO` |
| `payment_status` | ENUM `PaymentStatus` | ✅ | Default `PENDENTE` |
| `fiscal_status` | ENUM `FiscalStatus` | ✅ | Default `NAO_EMITIDO` |
| `sale_number` | INTEGER | ✅ | Numeração sequencial por empresa |
| `subtotal` | DECIMAL(12,2) | ✅ | Soma dos itens |
| `discount` | DECIMAL(12,2) | ✅ | Default 0; nunca maior que o subtotal |
| `total_amount` | DECIMAL(12,2) | ✅ | `subtotal - discount` |
| `payment_method` | ENUM `PaymentMethod` | ❌ | Forma de pagamento |
| `payment_condition` | ENUM `PaymentCondition` | ✅ | `A_VISTA` (default) ou `A_PRAZO` |
| `installments` | INTEGER | ✅ | Número de parcelas (default 1; usado só em `A_PRAZO`) |
| `first_due_date` | TIMESTAMP | ❌ | Vencimento da 1ª parcela; nulo = hoje + `interval_days` na finalização |
| `interval_days` | INTEGER | ✅ | Dias entre parcelas (default 30) |
| `notes` | TEXT | ❌ | Observações |
| `sale_date` | TIMESTAMP | ✅ | Data da venda (default agora) |
| `created_at` / `updated_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

**Três eixos de status, independentes de propósito:**

| Eixo | Coluna | Quem move |
|------|--------|-----------|
| Comercial | `status` | módulo de vendas (`confirm`, `cancel`) |
| Financeiro | `payment_status` | módulo financeiro — **só o cancelamento mexe nele**, levando `APROVADO` → `ESTORNADO` |
| Fiscal | `fiscal_status` | módulo fiscal (ainda não implementado); hoje é apenas coluna |

- **UNIQUE:** `(company_id, sale_number)` · **Índices:** `company_id`, `(company_id, status)`, `(company_id, sale_date)`
- `ORCAMENTO` **não reserva nem baixa estoque.** A validação de saldo e as movimentações `SAIDA`
  acontecem só na finalização — um orçamento pode ficar dias parado e o estoque mudar no intervalo
- ⚠️ **A numeração ignora o soft delete.** `sale_number` é calculado com `MAX` sobre **todas** as
  vendas da empresa, inclusive as excluídas. O índice único não enxerga `deleted_at`, então contar só
  as ativas faria a próxima venda reutilizar o número de uma excluída e estourar `P2002`. A mesma
  regra vale para `purchases.purchase_number`
- As colunas de parcelamento ficam **na venda**, não só no DTO: um orçamento a prazo pode ser
  finalizado dias depois por `POST /sales/:id/confirm`, e o plano de parcelas precisa sobreviver até lá

### `sale_items` — Itens da venda

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `sale_id` | UUID (FK) | ✅ | Venda (`ON DELETE CASCADE`) |
| `product_id` | UUID (FK) | ✅ | Produto |
| `quantity` | DECIMAL(12,4) | ✅ | Quantidade |
| `unit_price` | DECIMAL(12,4) | ✅ | Preço unitário praticado |
| `total` | DECIMAL(12,2) | ✅ | `quantity × unit_price` |

- **Índice:** `sale_id` · **Sem soft delete** (segue a venda, como `purchase_items`)
- Editar uma venda com `items` no corpo **apaga fisicamente** os itens e recria a lista

### `financial_entries` — Contas a receber e a pagar

> Uma tabela, dois módulos: `type = RECEBER` é servido por `receivables`, `type = PAGAR` por
> `payables`. Cada service **força o próprio `type` em toda query**, então um módulo nunca enxerga
> nem baixa título do outro.

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa |
| `establishment_id` | UUID (FK) | ❌ | Estabelecimento |
| `type` | ENUM `FinancialType` | ✅ | `RECEBER` ou `PAGAR` |
| `status` | ENUM `FinancialStatus` | ✅ | Default `ABERTO` |
| `partner_id` | UUID (FK → `partners.id`) | ❌ | Cliente (RECEBER) ou fornecedor (PAGAR) |
| `sale_id` | UUID (FK → `sales.id`) | ❌ | Origem: venda |
| `purchase_id` | UUID (FK → `purchases.id`) | ❌ | Origem: compra |
| `category` | TEXT | ❌ | Agrupador para relatórios (vira plano de contas depois) |
| `description` | TEXT | ✅ | Descrição do título |
| `amount` | DECIMAL(12,2) | ✅ | Valor da parcela |
| `paid_amount` | DECIMAL(12,2) | ✅ | Total já baixado (default 0) |
| `issue_date` | TIMESTAMP | ✅ | Emissão |
| `due_date` | TIMESTAMP | ✅ | Vencimento |
| `installment_number` / `installment_total` | INTEGER | ✅ | Parcela X de Y (default 1 de 1) |
| `payment_method` | ENUM `PaymentMethod` | ❌ | |
| `notes` | TEXT | ❌ | |
| `created_at` / `updated_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

- **Índices:** `(company_id, type, status)` e `(company_id, due_date)` — os dois recortes que a tela
  de contas e o fluxo de caixa usam
- Uma venda parcelada gera **N linhas**, uma por parcela, todas com o mesmo `sale_id`; uma compra
  parcelada faz o mesmo com `purchase_id`
- Título **sem** `sale_id` nem `purchase_id` é lançamento manual (`POST /receivables` ou `POST /payables`) —
  é o caminho para despesa que não vem de compra, como aluguel e energia
- **`status = VENCIDO` nunca é gravado.** O enum tem o valor, mas o vencimento é derivado na leitura
  (`due_date < agora` e status em `ABERTO`/`PARCIAL`), exposto como `isOverdue`. Gravar exigiria um
  job diário e deixaria a coluna desatualizada entre duas execuções
- O resto dos centavos do parcelamento vai **todo na última parcela**: R$ 100,00 em 3× vira
  33,33 + 33,33 + 33,34, senão o somatório dos títulos ficaria abaixo do total da venda para sempre
- `paid_amount` é mantido pelo service a cada baixa; a fonte da verdade das baixas é `financial_payments`

### `financial_payments` — Baixas de um título

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `entry_id` | UUID (FK) | ✅ | Título (`ON DELETE CASCADE`) |
| `amount` | DECIMAL(12,2) | ✅ | Valor da baixa |
| `paid_at` | TIMESTAMP | ✅ | Data do pagamento |
| `method` | ENUM `PaymentMethod` | ❌ | |
| `notes` | TEXT | ❌ | |
| `created_at` | TIMESTAMP | ✅ | |

- Permite **baixa parcial**: a soma dos pagamentos alimenta `financial_entries.paid_amount` e define
  se o título fica `PARCIAL` ou `PAGO`
- Sem soft delete: estorno de baixa é exclusão física da linha

> **Relatórios (item 4 do roadmap) não têm tabela própria.** Fluxo de caixa e faturamento são
> agregações sobre `sales`, `financial_entries` e `financial_payments` por período e tipo.

### `permissions` — Catálogo de permissões

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `code` | TEXT (PK) | ✅ | Código no formato `dominio.acao` (ex: `products.create`) |
| `description` | TEXT | ✅ | Descrição legível em PT-BR |

- Tabela **global** (não possui `company_id`) e **sem soft delete**
- Populada por migration (seed em SQL), não por código da aplicação
- Domínios atuais: `company`, `users`, `permissions`, `establishments`, `products`, `purchases`, `sales`, `receivables`, `payables`, `stock` e `partners`

### `role_permissions` — Conjunto padrão por papel (template)

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `role` | ENUM `MembershipRole` | ✅ | OWNER, ADMIN ou MEMBER |
| `permission_code` | TEXT (FK → `permissions.code`) | ✅ | Permissão concedida por padrão |

- **PK composta:** `(role, permission_code)`
- **FK:** `permission_code → permissions(code)` com `ON DELETE CASCADE ON UPDATE CASCADE`
- Tabela **global** e **sem soft delete**
- **Não é consultada em tempo de requisição.** Serve apenas de molde: é copiada para
  `company_role_permissions` quando uma empresa é criada (`CompaniesService.create`, dentro da transação)
- A cópia **exclui o papel MEMBER** (`where: { role: { not: MEMBER } }`) — o papel nasce com baseline
  vazio e recebe acesso apenas por perfis
- As linhas de MEMBER foram **preservadas** mesmo tendo deixado de ser copiadas: são o registro do
  antigo conjunto padrão e servem de base para montar o primeiro perfil de cada empresa

### `company_role_permissions` — Permissões efetivas por empresa

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `company_id` | TEXT (FK → `companies.id`) | ✅ | Empresa dona do conjunto |
| `role` | ENUM `MembershipRole` | ✅ | OWNER, ADMIN ou MEMBER |
| `permission_code` | TEXT (FK → `permissions.code`) | ✅ | Permissão concedida |

- **PK composta:** `(company_id, role, permission_code)` · **Índice:** `(company_id, role)`
- **FKs:** `company_id → companies(id)` e `permission_code → permissions(code)`, ambas `ON DELETE CASCADE ON UPDATE CASCADE`
- Sem soft delete
- É **esta** tabela que o `RequirePermissionGuard` consulta primeiro. O papel OWNER não é verificado
  aqui: tem acesso total por definição
- **Não contém linhas de MEMBER por padrão.** Empresas novas não recebem nenhuma, e a migration
  `20260728150000_empty_member_baseline` apagou as das empresas existentes. O acesso do MEMBER vem de
  `permission_profiles` / `membership_profiles`
- A atualização é feita por substituição total (`deleteMany` + `createMany` dentro de `$transaction`),
  sempre filtrando por `company_id`

### `permission_profiles` — Perfis de permissão (por empresa)

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | TEXT (PK) | ✅ | UUID |
| `company_id` | TEXT (FK → `companies.id`) | ✅ | Empresa dona do perfil |
| `name` | TEXT | ✅ | Nome do perfil (único dentro da empresa) |
| `description` | TEXT | ❌ | Descrição livre |
| `created_at` | TIMESTAMP | ✅ | Data de criação |
| `updated_at` | TIMESTAMP | ✅ | Data da última alteração |

- **UNIQUE:** `(company_id, name)` · **Índice:** `company_id`
- **FK:** `company_id → companies(id)` com `ON DELETE CASCADE ON UPDATE CASCADE`
- **Sem soft delete** — perfil é configuração de acesso, não dado de negócio. O `DELETE` é físico
  e o cascade em `membership_profiles` desvincula o perfil de todos os membros

### `permission_profile_permissions` — Permissões que compõem o perfil

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `profile_id` | TEXT (FK → `permission_profiles.id`) | ✅ | Perfil |
| `permission_code` | TEXT (FK → `permissions.code`) | ✅ | Permissão concedida pelo perfil |

- **PK composta:** `(profile_id, permission_code)` · **Índice:** `permission_code`
- **FKs:** ambas `ON DELETE CASCADE ON UPDATE CASCADE`
- Atualizada por substituição total (`deleteMany` + `createMany` dentro de `$transaction`)

### `membership_profiles` — Vínculo N-N usuário ↔ perfil

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `membership_id` | TEXT (FK → `memberships.id`) | ✅ | Membro |
| `profile_id` | TEXT (FK → `permission_profiles.id`) | ✅ | Perfil vinculado |

- **PK composta:** `(membership_id, profile_id)` · **Índice:** `profile_id`
- **FKs:** ambas `ON DELETE CASCADE ON UPDATE CASCADE`
- Só recebe memberships de papel `MEMBER` — a regra é da aplicação, não do banco
- As permissões efetivas de um MEMBER são a **união** de `company_role_permissions[MEMBER]` com as
  permissões de todos os perfis vinculados aqui. É a segunda consulta do `RequirePermissionGuard`,
  executada apenas quando o papel não concedeu a permissão
- Como o baseline do MEMBER é vazio, na prática **é esta tabela que decide** o acesso de um MEMBER:
  sem linha aqui, ele recebe `403` em tudo

---

## Enums

| Enum | Valores |
|------|---------|
| `MembershipRole` | `OWNER`, `ADMIN`, `MEMBER` |
| `CompanyType` | `MEI`, `ME`, `EPP`, `LTDA`, `SA`, `EIRELI`, `SLU` |
| `TaxRegime` | `SIMPLES_NACIONAL`, `LUCRO_PRESUMIDO`, `LUCRO_REAL`, `MEI` |
| `EstablishmentType` | `MATRIZ`, `FILIAL` |
| `PartnerType` | `CLIENT`, `SUPPLIER`, `BOTH` |
| `PersonType` | `PF`, `PJ` |
| `StockMovementType` | `ENTRADA`, `SAIDA`, `AJUSTE` |
| `PurchaseStatus` | `DRAFT`, `CONFIRMED`, `CANCELLED` |
| `SaleStatus` | `ORCAMENTO`, `EM_ABERTO`, `CONCLUIDA`, `CANCELADA` |
| `PaymentStatus` | `PENDENTE`, `APROVADO`, `RECUSADO`, `ESTORNADO` |
| `FiscalStatus` | `NAO_EMITIDO`, `PROCESSANDO`, `AUTORIZADO`, `REJEITADO`, `CANCELADO` |
| `PaymentMethod` | `DINHEIRO`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `PIX`, `BOLETO`, `OUTRO` |
| `PaymentCondition` | `A_VISTA`, `A_PRAZO` |
| `FinancialType` | `RECEBER`, `PAGAR` |
| `FinancialStatus` | `ABERTO`, `PARCIAL`, `PAGO`, `VENCIDO`, `CANCELADO` |
| `UnitOfMeasure` | `UN`, `KG`, `LT`, `MT`, `CX`, `PC`, `PCT`, `DZ` |

---

## Índices e Constraints

| Tabela | Tipo | Colunas |
|--------|------|---------|
| `users` | UNIQUE | `email` |
| `companies` | UNIQUE | `cnpj` |
| `memberships` | UNIQUE | `(user_id, company_id)` |
| `memberships` | INDEX | `company_id` |
| `products` | UNIQUE | `(company_id, sku)` |
| `products` | UNIQUE | `(company_id, barcode)` |
| `products` | INDEX | `company_id` |
| `partners` | INDEX | `company_id` |
| `partners` | INDEX | `(company_id, type)` |
| `stock_movements` | INDEX | `company_id` |
| `stock_movements` | INDEX | `product_id` |
| `stock_movements` | INDEX | `(company_id, created_at)` |
| `purchases` | UNIQUE | `(company_id, purchase_number)` |
| `purchases` | INDEX | `company_id` |
| `purchase_items` | INDEX | `purchase_id` |
| `sales` | UNIQUE | `(company_id, sale_number)` |
| `sales` | INDEX | `company_id` |
| `sales` | INDEX | `(company_id, status)` |
| `sales` | INDEX | `(company_id, sale_date)` |
| `sales` | FK CASCADE | `company_id → companies(id)` |
| `sale_items` | INDEX | `sale_id` |
| `sale_items` | FK CASCADE | `sale_id → sales(id)` |
| `financial_entries` | INDEX | `(company_id, type, status)` |
| `financial_entries` | INDEX | `(company_id, due_date)` |
| `financial_entries` | FK CASCADE | `company_id → companies(id)` |
| `financial_payments` | INDEX | `entry_id` |
| `financial_payments` | FK CASCADE | `entry_id → financial_entries(id)` |
| `establishments` | INDEX | `company_id` |
| `permissions` | PK | `code` |
| `role_permissions` | PK | `(role, permission_code)` |
| `role_permissions` | FK CASCADE | `permission_code → permissions(code)` |
| `company_role_permissions` | PK | `(company_id, role, permission_code)` |
| `company_role_permissions` | INDEX | `(company_id, role)` |
| `company_role_permissions` | FK CASCADE | `company_id → companies(id)` |
| `company_role_permissions` | FK CASCADE | `permission_code → permissions(code)` |
| `permission_profiles` | PK | `id` |
| `permission_profiles` | UNIQUE | `(company_id, name)` |
| `permission_profiles` | INDEX | `company_id` |
| `permission_profiles` | FK CASCADE | `company_id → companies(id)` |
| `permission_profile_permissions` | PK | `(profile_id, permission_code)` |
| `permission_profile_permissions` | INDEX | `permission_code` |
| `permission_profile_permissions` | FK CASCADE | `profile_id → permission_profiles(id)` |
| `permission_profile_permissions` | FK CASCADE | `permission_code → permissions(code)` |
| `membership_profiles` | PK | `(membership_id, profile_id)` |
| `membership_profiles` | INDEX | `profile_id` |
| `membership_profiles` | FK CASCADE | `membership_id → memberships(id)` |
| `membership_profiles` | FK CASCADE | `profile_id → permission_profiles(id)` |

---

## Soft Delete

Todas as tabelas de negócio (exceto `purchase_items`, `sale_items`, `financial_payments` e as tabelas de autorização — `permissions`, `role_permissions`, `company_role_permissions`, `permission_profiles`, `permission_profile_permissions` e `membership_profiles`) possuem o campo `deleted_at TIMESTAMP NULL`.

- Registros ativos: `deleted_at IS NULL`
- Registros excluídos: `deleted_at IS NOT NULL`
- **Não existe exclusão física** de registros de negócio
- O filtro `deleted_at: null` é adicionado manualmente em todas as queries do ORM

---

## Migrations

As migrations ficam em `prisma/migrations/`.

| Migration | O que faz |
|-----------|-----------|
| `20260403201053_init` | Esquema inicial (users, companies, memberships, establishments, products, partners, stock, purchases, sales) |
| `20260422110000_add_business_segment_technical_attributes` | `companies.business_segment` e `products.technical_attributes` |
| `20260424082316_add_permissions_table` | Cria `permissions` e `role_permissions` + seed dos códigos e da matriz padrão por papel |
| `20260426120000_add_force_password_change_fields` | `users.force_password_change` e `users.password_changed_at` |
| `20260426130000_add_establishments_permissions` | Seed das permissões `establishments.*` para OWNER, ADMIN e MEMBER |
| `20260516000000_remove_sales_module` | Remove as tabelas `sales` / `sale_items` e o enum `SaleStatus` (as permissões `sales.*` **não** foram removidas — foram reaproveitadas em `20260730133757`) |
| `20260525191254` | Recria a FK de `role_permissions` com `ON UPDATE CASCADE` |
| `20260727120000_company_scoped_permissions` | Cria `company_role_permissions`; adiciona `purchases.delete` ao catálogo; concede `users.create` e `purchases.delete` ao ADMIN no padrão; faz o backfill do padrão para todas as empresas existentes |
| `20260728120000_permission_profiles` | Cria `permission_profiles`, `permission_profile_permissions` e `membership_profiles`; adiciona `permissions.manage` ao catálogo, concede a OWNER e ADMIN no padrão e faz o backfill das empresas existentes |
| `20260728150000_empty_member_baseline` | **Apaga todas as linhas de `company_role_permissions` com `role = 'MEMBER'`**, em todas as empresas. A partir daqui o MEMBER só tem acesso por perfil — os MEMBERs existentes ficam sem acesso até receberem um. As linhas de MEMBER em `role_permissions` são preservadas como referência |
| `20260730133757_sales_and_financial_modules` | Recria `sales` / `sale_items` (agora com os três eixos de status) e cria `financial_entries` / `financial_payments`; adiciona os enums `SaleStatus`, `PaymentStatus`, `FiscalStatus`, `PaymentMethod`, `FinancialType` e `FinancialStatus`; acrescenta `sales.delete` ao catálogo, concede a OWNER e ADMIN no padrão e faz o backfill de todos os códigos `sales.*` para as empresas existentes (MEMBER fica de fora, o baseline dele é vazio) |
| `20260730204512_sale_payment_condition_and_receivables` | Adiciona o enum `PaymentCondition` e as colunas `payment_condition`, `installments`, `first_due_date` e `interval_days` em `sales`; acrescenta os 5 códigos `receivables.*` ao catálogo, concede a OWNER e ADMIN no padrão e faz o backfill das empresas existentes (MEMBER fica de fora) |
| `20260731132618_purchase_payment_condition_and_payables` | Adiciona as mesmas quatro colunas de parcelamento em `purchases`; acrescenta os 5 códigos `payables.*` ao catálogo, concede a OWNER e ADMIN no padrão e faz o backfill das empresas existentes (MEMBER fica de fora). Nenhuma tabela nova: contas a pagar reusa `financial_entries` / `financial_payments` |

> As permissões são semeadas **por migration SQL**, não por script de seed do Prisma. Ao criar um módulo novo, a migration precisa fazer **três coisas**:
>
> ```sql
> -- 1. registrar os códigos no catálogo
> INSERT INTO "permissions" ("code", "description") VALUES ('nfe.emit', 'Emitir NF-e')
> ON CONFLICT ("code") DO NOTHING;
>
> -- 2. incluir no padrão (vale para empresas criadas dali em diante)
> INSERT INTO "role_permissions" ("role", "permission_code") VALUES ('ADMIN', 'nfe.emit')
> ON CONFLICT DO NOTHING;
>
> -- 3. propagar para as empresas que já existem
> INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
> SELECT c."id", 'ADMIN', 'nfe.emit' FROM "companies" c
> ON CONFLICT DO NOTHING;
> ```
>
> Sem o passo 3 as empresas existentes ficam sem a permissão e o endpoint retorna `403`.
> O passo 2 sozinho não afeta ninguém, porque `role_permissions` não é lida em runtime.
> OWNER não precisa de nenhum dos passos: tem acesso total por definição.
> **Nunca conceda ao papel MEMBER** nos passos 2 e 3 — o baseline dele é vazio de propósito. Para dar
> o código novo a um MEMBER, inclua-o em um perfil (`permission_profile_permissions`).

```bash
# Criar nova migration
npx prisma migrate dev --name nome_da_migration

# Aplicar migrations pendentes em produção
npx prisma migrate deploy

# Verificar status das migrations
npx prisma migrate status
```

---

## Convenções

| Aspecto | Convenção |
|---------|-----------|
| Nome de tabelas | `snake_case` plural (ex: `stock_movements`) |
| Nome de colunas | `snake_case` (ex: `company_id`) |
| Nome no código | `camelCase` (ex: `companyId`) — mapeado via `@map` no Prisma |
| Chaves primárias | UUID gerado pelo banco (`@default(uuid())`) |
| Timestamps | `created_at`, `updated_at`, `deleted_at` em todas as tabelas |
| Valores monetários | `DECIMAL(12,2)` |
| Quantidades | `DECIMAL(12,4)` |
