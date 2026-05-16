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
| `reference_id` | UUID | ❌ | ID da compra geradora |
| `created_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

### `purchases` e `purchase_items` — Compras

Estrutura com `purchase_number` (numeracao sequencial por empresa) e `supplier_id` (fornecedor, opcional).

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
| `establishments` | INDEX | `company_id` |

---

## Soft Delete

Todas as tabelas (exceto `purchase_items`) possuem o campo `deleted_at TIMESTAMP NULL`.

- Registros ativos: `deleted_at IS NULL`
- Registros excluídos: `deleted_at IS NOT NULL`
- **Não existe exclusão física** de registros de negócio
- O filtro `deleted_at: null` é adicionado manualmente em todas as queries do ORM

---

## Migrations

As migrations ficam em `prisma/migrations/`.

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
