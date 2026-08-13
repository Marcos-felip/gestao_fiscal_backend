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
                  │ cash_session_id (FK opc│──> cash_sessions
                  │ deleted_at             │
                  └───────┬────────────────┘
                          │1:N
                  ┌───────┴────────┐
                  │   sale_items   │
                  │ (FK: sale,     │
                  │  FK: product)  │
                  └────────────────┘

                  ┌────────────────┐
                  │ sale_payments  │  formas de pagamento da venda à vista
                  │────────────────│
                  │ method, amount │
                  │ amount_received│  (só dinheiro)
                  │ change_given   │  (troco)
                  │ (FK: sale CASC)│
                  └────────────────┘

  ── Caixa ──

                  ┌────────────────┐          ┌──────────────────────────┐
                  │ cash_registers │────1:N──<│      cash_sessions       │  o turno do operador
                  │────────────────│          │──────────────────────────│
                  │ id (PK)        │          │ id (PK)                  │
                  │ company_id(FK) │          │ cash_register_id (FK)    │
                  │ establishment_ │          │ operator_id (FK users)   │
                  │   id (FK)      │          │ status (ABERTA/FECHADA)  │
                  │ name (UQ p/    │          │ opening_amount           │
                  │  estab.)       │          │ expected/counted_cash    │  (só no fechamento)
                  │ is_active      │          │ difference, closing_notes│
                  │ deleted_at     │          └────────────┬─────────────┘
                  └────────────────┘                       │1:N
                                               ┌───────────┴──────────────┐
                                               │      cash_movements      │  sangria / suprimento
                                               │ (FK: session ON DEL CASC)│
                                               └──────────────────────────┘

  ── Fiscal ──

                  ┌──────────────────────────┐          ┌──────────────────────────┐
                  │     fiscal_settings      │          │     fiscal_documents     │  append-only
                  │──────────────────────────│          │──────────────────────────│
                  │ id (PK)                  │          │ id (PK)                  │
                  │ establishment_id (FK)    │          │ company_id (FK)          │
                  │ ambiente (HOMOL/PROD)    │          │ establishment_id (FK)    │
                  │  UQ (establishment,      │          │ sale_id (FK, UQ, opc)    │──> sales
                  │      ambiente)           │          │ modelo (NFE/NFCE)        │
                  │ serie_nfce               │          │ serie, numero            │
                  │ proximo_numero_nfce      │          │ chave_acesso (UQ)        │
                  │ codigo_csc, id_csc       │          │ ambiente                 │
                  │ certificado_ref  (cifr.) │          │ status                   │
                  │ certificado_senha_ref    │          │ protocolo                │
                  │ certificado_validade     │          │ rejeicao_codigo/mensagem │
                  │ ativo  (config. em uso)  │          │ xml_*/danfe_url/qr_code  │
                  │ producao_liberada        │          │ idempotency_key (UQ)     │
                  └───────┬──────────────────┘          │ attempts, snapshot(JSONB)│
                          │1:N                          └────────────┬─────────────┘
       ┌──────────────────┴───────────────────┐                      │1:N
       │                                      │          ┌───────────┴──────────────┐
┌──────┴───────────────────┐  ┌───────────────┴───────┐  │  fiscal_status_history   │  de/para
│ fiscal_certificate_events│  │ fiscal_settings_events│  │──────────────────────────│
│ upload / substituicao    │  │ serie/csc/ambiente/   │  │  fiscal_document_events  │  emissao,
└──────────────────────────┘  │ producao (auditoria)  │  │  (detalhes JSONB)        │  consulta,
                              └───────────────────────┘  └──────────────────────────┘  cancelamento

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
| `cash_blind_close` | BOOLEAN | ✅ | Default `false`; fechamento de caixa às cegas (o operador não vê o esperado antes de contar) |
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
| `ibge_code` | VARCHAR | ❌ | Código IBGE do município (7 dígitos) — o `cMun` do destinatário da NF-e |
| `ind_ie_dest` | INT | ❌ | Indicador de IE na NF-e: `1` contribuinte, `2` isento, `9` não contribuinte |
| `is_active` | BOOLEAN | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

> `ibge_code` e `ind_ie_dest` são **nulos por padrão e obrigatórios só na
> emissão de NF-e**. Não há valor certo para presumir: `ind_ie_dest` não se
> deduz do tipo de pessoa — prestadora de serviço é PJ e não é contribuinte de
> ICMS. Cliente sem eles é recusado nomeando o campo, em vez de o cadastro
> bloquear quem nunca vai receber NF-e.
>
> Quando `ind_ie_dest = 1`, o `rg_ie` passa a ser lido como inscrição estadual e
> é obrigatório. Nos outros dois casos ele **não** é enviado ao motor: mandar IE
> de quem se declarou não contribuinte é contradição que a SEFAZ recusa.

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

> ⚠️ **Limitação conhecida: o estoque é por empresa, não por estabelecimento.**
>
> Não existe `establishment_id` aqui, nem em `products.current_stock`. Uma empresa
> com matriz e filial tem **um saldo só**, somando as duas — vender na filial
> baixa do mesmo número que a matriz enxerga.
>
> Hoje isso não incomoda porque as empresas em uso têm um estabelecimento só.
> **Passa a incomodar na NF-e (etapa 3 do roteiro fiscal):** a nota é emitida por
> estabelecimento, com CNPJ e endereço próprios, e declarar saída de mercadoria
> de um local cujo estoque não é rastreado separadamente é incoerência que
> aparece na primeira conferência.
>
> Consertar tem três partes, e nenhuma é pequena: coluna e índice novos,
> `current_stock` deixando de ser campo do produto para virar saldo por
> estabelecimento, e migration rateando o saldo atual — que não tem como ser
> feita corretamente sem alguém dizer onde a mercadoria está.
>
> Registrado em 12/08/2026. Ver a tarefa correspondente na change
> `emitir-nfe-modelo-55`.

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
| `payment_method` | ENUM `PaymentMethod` | ❌ | Forma **predominante**, só para exibição — ver `sale_payments` |
| `payment_condition` | ENUM `PaymentCondition` | ✅ | `A_VISTA` (default) ou `A_PRAZO` |
| `installments` | INTEGER | ✅ | Número de parcelas (default 1; usado só em `A_PRAZO`) |
| `first_due_date` | TIMESTAMP | ❌ | Vencimento da 1ª parcela; nulo = hoje + `interval_days` na finalização |
| `interval_days` | INTEGER | ✅ | Dias entre parcelas (default 30) |
| `notes` | TEXT | ❌ | Observações |
| `cash_session_id` | UUID (FK) | ❌ | Sessão de caixa que registrou a venda (`ON DELETE SET NULL`) |
| `sale_date` | TIMESTAMP | ✅ | Data da venda (default agora) |
| `created_at` / `updated_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

**Três eixos de status, independentes de propósito:**

| Eixo | Coluna | Quem move |
|------|--------|-----------|
| Comercial | `status` | módulo de vendas (`confirm`, `cancel`) |
| Financeiro | `payment_status` | módulo financeiro — **só o cancelamento mexe nele**, levando `APROVADO` → `ESTORNADO` |
| Fiscal | `fiscal_status` | módulo fiscal — espelha o status do `fiscal_documents` da venda |

- **UNIQUE:** `(company_id, sale_number)` · **Índices:** `company_id`, `(company_id, status)`, `(company_id, sale_date)`
- `ORCAMENTO` **não reserva nem baixa estoque.** A validação de saldo e as movimentações `SAIDA`
  acontecem só na finalização — um orçamento pode ficar dias parado e o estoque mudar no intervalo
- ⚠️ **A numeração ignora o soft delete.** `sale_number` é calculado com `MAX` sobre **todas** as
  vendas da empresa, inclusive as excluídas. O índice único não enxerga `deleted_at`, então contar só
  as ativas faria a próxima venda reutilizar o número de uma excluída e estourar `P2002`. A mesma
  regra vale para `purchases.purchase_number`
- As colunas de parcelamento ficam **na venda**, não só no DTO: um orçamento a prazo pode ser
  finalizado dias depois por `POST /sales/:id/confirm`, e o plano de parcelas precisa sobreviver até lá
- `cash_session_id` é carimbado na **finalização**, quando o operador tem sessão aberta — inclusive na
  venda a prazo, que não põe dinheiro na gaveta mas conta como movimento do turno. Orçamento e venda
  finalizada sem sessão ficam nulos. Ver [`cash_sessions`](#cash_sessions--turnos-de-caixa)

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

### `sale_payments` — Formas de pagamento da venda

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa (`ON DELETE CASCADE`) |
| `sale_id` | UUID (FK) | ✅ | Venda (`ON DELETE CASCADE`) |
| `method` | ENUM `PaymentMethod` | ✅ | Forma usada nesta linha |
| `amount` | DECIMAL(12,2) | ✅ | Valor pago nesta forma |
| `amount_received` | DECIMAL(12,2) | ❌ | Valor entregue pelo cliente; **só DINHEIRO** |
| `change_given` | DECIMAL(12,2) | ❌ | Troco = `amount_received - amount` |
| `created_at` | TIMESTAMP | ✅ | |

- **N linhas por venda:** o balcão aceita pagamento dividido (parte no PIX, parte em dinheiro)
- Preenchida **só na finalização** de venda `A_VISTA`; venda `A_PRAZO` não gera nenhuma linha aqui —
  o que fica em aberto vira `financial_entries`
- A soma dos `amount` fecha o `total_amount` da venda, com tolerância de um centavo
- **Esta tabela é a fonte de verdade do pagamento.** `sales.payment_method` continua existindo, mas
  passa a valer apenas como **forma predominante** (a de maior `amount`), para exibição e relatório
- **Sem soft delete:** cancelar a venda não apaga os pagamentos — são histórico de caixa
- Nas demais formas que não DINHEIRO, `amount_received` e `change_given` ficam nulos

### `cash_registers` — Terminais de caixa

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa (`ON DELETE CASCADE`) |
| `establishment_id` | UUID (FK) | ✅ | Estabelecimento onde a gaveta fica |
| `name` | VARCHAR | ✅ | Ex: "Caixa 01" |
| `is_active` | BOOLEAN | ✅ | Default `true`; inativo não aceita abertura |
| `created_at` / `updated_at` | TIMESTAMP | ✅ | |
| `deleted_at` | TIMESTAMP | ❌ | Soft delete |

- **UNIQUE:** `(company_id, establishment_id, name)` — dois estabelecimentos podem ter cada um o seu
  "Caixa 01"
- Terminal com sessão aberta não pode ser desativado nem excluído

### `cash_sessions` — Turnos de caixa

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa (`ON DELETE CASCADE`) |
| `establishment_id` | UUID (FK) | ✅ | Copiado do terminal na abertura |
| `cash_register_id` | UUID (FK) | ✅ | Terminal |
| `operator_id` | UUID (FK → `users.id`) | ✅ | Quem abriu o turno |
| `status` | ENUM `CashSessionStatus` | ✅ | Default `ABERTA` |
| `opening_amount` | DECIMAL(12,2) | ✅ | Fundo de troco na abertura |
| `opened_at` | TIMESTAMP | ✅ | Default agora |
| `closed_at` | TIMESTAMP | ❌ | Preenchido no fechamento |
| `expected_cash` | DECIMAL(12,2) | ❌ | Esperado em gaveta, **congelado no fechamento** |
| `counted_cash` | DECIMAL(12,2) | ❌ | Dinheiro contado pelo operador |
| `difference` | DECIMAL(12,2) | ❌ | `counted_cash - expected_cash`; negativo é falta |
| `closing_notes` | TEXT | ❌ | Justificativa; obrigatória quando há diferença |
| `created_at` / `updated_at` | TIMESTAMP | ✅ | |

- **Sem `deleted_at`:** a sessão é registro de auditoria do turno, não se exclui
- As quatro colunas de fechamento ficam nulas enquanto a sessão está aberta — os números do turno em
  andamento são **calculados na leitura**, não gravados
- `expected_cash` é gravado uma vez, no `close`: é o valor contra o qual a contagem foi conferida
  naquele instante. Recalcular depois daria outro número se uma venda fosse cancelada
- **Unicidade da sessão aberta é garantida pelo service, não pelo banco** — um terminal com uma
  aberta, um operador com uma aberta. Um índice parcial `UNIQUE ... WHERE status = 'ABERTA'` daria a
  garantia no banco, mas devolveria `409` genérico no lugar das duas mensagens que a tela precisa
  distinguir

### `cash_movements` — Sangrias e suprimentos

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Empresa (`ON DELETE CASCADE`) |
| `session_id` | UUID (FK) | ✅ | Sessão (`ON DELETE CASCADE`) |
| `type` | ENUM `CashMovementType` | ✅ | `SANGRIA` tira da gaveta, `SUPRIMENTO` coloca |
| `amount` | DECIMAL(12,2) | ✅ | Sempre positivo — o sinal vem do `type` |
| `reason` | TEXT | ❌ | Ex: "Depósito bancário" |
| `created_by_id` | UUID (FK → `users.id`) | ✅ | Quem registrou |
| `created_at` | TIMESTAMP | ✅ | |

- **Sem soft delete e sem `updated_at`:** movimento de gaveta não se edita nem se apaga; o que se faz
  é lançar o contrário
- Só aceito em sessão `ABERTA`

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

### `fiscal_settings` — Configuração fiscal por estabelecimento e ambiente

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `establishment_id` | UUID (FK) | ✅ | Estabelecimento emissor |
| `company_id` | UUID (FK) | ✅ | Tenant |
| `ambiente` | ENUM `FiscalEnvironment` | ✅ | Default `HOMOLOGACAO` |
| `serie_nfce` | INT | ✅ | Série da NFC-e (1 a 999), default 1 |
| `proximo_numero_nfce` | INT | ✅ | Próximo número a reservar, default 1 |
| `serie_nfe` | INT | ✅ | Série da NF-e modelo 55 (1 a 999), default 1 |
| `proximo_numero_nfe` | INT | ✅ | Próximo número da NF-e a reservar, default 1 |
| `codigo_csc` | VARCHAR | ❌ | CSC do ambiente (segredo; não sai em auditoria) |
| `id_csc` | VARCHAR | ❌ | Identificador do CSC |
| `certificado_ref` | TEXT | ❌ | .pfx cifrado em AES-256-GCM |
| `certificado_senha_ref` | TEXT | ❌ | Senha cifrada em AES-256-GCM |
| `certificado_validade` | TIMESTAMP | ❌ | Validade extraída do certificado |
| `certificado_subject` | VARCHAR | ❌ | Subject DN do certificado |
| `ativo` | BOOLEAN | ✅ | Configuração **em uso**; no máximo uma por estabelecimento |
| `producao_liberada` | BOOLEAN | ✅ | Default `false`; libera a emissão em produção |
| `producao_liberada_em` | TIMESTAMP | ❌ | Quando foi liberada |
| `producao_liberada_por` | TEXT | ❌ | Usuário que liberou |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | | Padrão |

- **UNIQUE:** `(establishment_id, ambiente)` — homologação e produção são linhas distintas,
  com série, numeração, CSC e certificado próprios · **Índice:** `company_id`
- O certificado **nunca** é gravado em texto claro; só é decifrado na chamada ao motor fiscal

### `fiscal_certificate_events` — Auditoria do certificado A1

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Tenant |
| `fiscal_settings_id` | UUID (FK) | ✅ | Configuração afetada |
| `tipo` | VARCHAR | ✅ | `upload` ou `substituicao` |
| `subject` / `titular` | VARCHAR | ❌ | Identificação do certificado enviado |
| `valido_ate` | TIMESTAMP | ❌ | Validade do certificado enviado |
| `subject_anterior` | VARCHAR | ❌ | Certificado que estava configurado antes |
| `usuario_id` | TEXT | ❌ | Quem enviou ou substituiu |
| `created_at` | TIMESTAMP | ✅ | Data do evento |

- **Índices:** `company_id`, `fiscal_settings_id` · **FKs:** `ON DELETE CASCADE`

### `fiscal_settings_events` — Auditoria da configuração fiscal

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Tenant |
| `fiscal_settings_id` | UUID (FK) | ✅ | Configuração afetada |
| `tipo` | VARCHAR | ✅ | `serie`, `csc`, `ambiente`, `producao_liberada`, `producao_revogada` |
| `valor_anterior` | VARCHAR | ❌ | Valor antes da alteração |
| `valor_novo` | VARCHAR | ❌ | Valor depois |
| `usuario_id` | TEXT | ❌ | Quem alterou |
| `created_at` | TIMESTAMP | ✅ | Data do evento |

- **Índices:** `company_id`, `fiscal_settings_id` · **FKs:** `ON DELETE CASCADE`
- O **valor do CSC não é gravado** — o evento registra apenas o idCSC, que o identifica

### `fiscal_documents` — Documento fiscal

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `company_id` | UUID (FK) | ✅ | Tenant |
| `establishment_id` | UUID (FK) | ✅ | Estabelecimento emissor |
| `sale_id` | UUID (FK) | ❌ | Venda de origem (único) |
| `modelo` | ENUM `FiscalDocumentModel` | ✅ | `NFE` (55) ou `NFCE` (65) |
| `serie` / `numero` | INT | ✅ | Numeração reservada na criação |
| `chave_acesso` | VARCHAR(44) | ❌ | Único; devolvido pela SEFAZ |
| `ambiente` | ENUM `FiscalEnvironment` | ✅ | Carimbado na criação; define qual CSC/certificado usar |
| `status` | ENUM `FiscalDocumentStatus` | ✅ | Default `PENDENTE` |
| `protocolo` | VARCHAR | ❌ | Protocolo de autorização (15 dígitos) |
| `rejeicao_codigo` / `rejeicao_mensagem` | VARCHAR | ❌ | Motivo da recusa |
| `data_emissao` / `data_autorizacao` / `data_cancelamento` | TIMESTAMP | ❌ | Marcos do documento |
| `valor_total` | DECIMAL(15,2) | ❌ | Total transmitido |
| `xml_enviado` / `xml_autorizado` / `xml_cancelamento` | TEXT | ❌ | Chave do storage ou conteúdo |
| `danfe_url` | TEXT | ❌ | Chave do PDF no storage |
| `qr_code` | TEXT | ❌ | URL do QR Code da NFC-e |
| `idempotency_key` | VARCHAR | ❌ | Único; impede emissão duplicada |
| `attempts` | INT | ✅ | Tentativas de emissão, default 0 |
| `engine` | VARCHAR | ❌ | Motor usado (`dfe-net`) |
| `snapshot` | JSONB | ❌ | Retrato imutável da venda no momento da emissão |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | | Padrão |

- **UNIQUE:** `chave_acesso`, `sale_id`, `idempotency_key`
- **Índices:** `company_id`, `(company_id, status)`, `sale_id`
- **Append-only:** documento fiscal não tem exclusão física

### `fiscal_status_history` — Transições de status

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `fiscal_document_id` | UUID (FK) | ✅ | Documento |
| `status_from` / `status_to` | ENUM `FiscalDocumentStatus` | ✅ | Origem e destino |
| `motivo` | TEXT | ❌ | Ex.: `Tentativa de emissão #2` |
| `usuario_id` | TEXT | ❌ | Quem originou (nulo na emissão sem operador) |
| `created_at` | TIMESTAMP | ✅ | Data da transição |

### `fiscal_document_events` — Eventos do documento

| Coluna | Tipo | Obrig. | Descrição |
|--------|------|--------|-----------|
| `id` | UUID | ✅ | Chave primária |
| `fiscal_document_id` | UUID (FK) | ✅ | Documento |
| `tipo` | VARCHAR | ✅ | `emissao`, `consulta`, `cancelamento`, `retry` |
| `detalhes` | JSONB | ❌ | Retorno técnico completo da operação |
| `usuario_id` | TEXT | ❌ | Quem acionou |
| `created_at` | TIMESTAMP | ✅ | Data do evento |


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
| `CashSessionStatus` | `ABERTA`, `FECHADA` |
| `CashMovementType` | `SANGRIA`, `SUPRIMENTO` |
| `FiscalDocumentModel` | `NFE` (55), `NFCE` (65) |
| `FiscalEnvironment` | `HOMOLOGACAO`, `PRODUCAO` |
| `FiscalDocumentStatus` | `NAO_EMITIDO`, `PENDENTE`, `PROCESSANDO`, `AUTORIZADO`, `REJEITADO`, `ERRO`, `CONTINGENCIA`, `CANCELAMENTO_PENDENTE`, `CANCELADO`, `INUTILIZADO` |
| `TaxRegimeCode` | `SIMPLES_NACIONAL` (CRT 1), `SIMPLES_EXCESSO` (CRT 2), `REGIME_NORMAL` (CRT 3), `SIMPLES_MEI` (CRT 4 — MEI) |
| `FiscalPaymentCode` | `DINHEIRO`, `CHEQUE`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `CREDITO_LOJA`, `VALE_ALIMENTACAO`, `VALE_REFEICAO`, `VALE_PRESENTE`, `VALE_COMBUSTIVEL`, `BOLETO`, `PIX`, `SEM_PAGAMENTO`, `OUTRO` |

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
| `sale_payments` | INDEX | `sale_id` |
| `sale_payments` | INDEX | `company_id` |
| `sale_payments` | FK CASCADE | `sale_id → sales(id)` |
| `sale_payments` | FK CASCADE | `company_id → companies(id)` |
| `sales` | INDEX | `cash_session_id` |
| `sales` | FK SET NULL | `cash_session_id → cash_sessions(id)` |
| `cash_registers` | UNIQUE | `(company_id, establishment_id, name)` |
| `cash_registers` | INDEX | `company_id` |
| `cash_registers` | FK CASCADE | `company_id → companies(id)` |
| `cash_registers` | FK RESTRICT | `establishment_id → establishments(id)` |
| `cash_sessions` | INDEX | `(company_id, status)` |
| `cash_sessions` | INDEX | `(cash_register_id, status)` |
| `cash_sessions` | INDEX | `(operator_id, status)` |
| `cash_sessions` | FK CASCADE | `company_id → companies(id)` |
| `cash_sessions` | FK RESTRICT | `cash_register_id → cash_registers(id)`, `establishment_id`, `operator_id` |
| `cash_movements` | INDEX | `session_id` |
| `cash_movements` | INDEX | `company_id` |
| `cash_movements` | FK CASCADE | `session_id → cash_sessions(id)`, `company_id → companies(id)` |
| `cash_movements` | FK RESTRICT | `created_by_id → users(id)` |
| `fiscal_settings` | UNIQUE | `(establishment_id, ambiente)` |
| `fiscal_settings` | INDEX | `company_id` |
| `fiscal_documents` | UNIQUE | `chave_acesso`, `sale_id`, `idempotency_key` |
| `fiscal_documents` | INDEX | `company_id`, `(company_id, status)`, `sale_id` |
| `fiscal_status_history` | INDEX | `fiscal_document_id` |
| `fiscal_document_events` | INDEX | `fiscal_document_id` |
| `fiscal_certificate_events` | INDEX | `company_id`, `fiscal_settings_id` |
| `fiscal_settings_events` | INDEX | `company_id`, `fiscal_settings_id` |
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

Todas as tabelas de negócio (exceto `purchase_items`, `sale_items`, `sale_payments`, `financial_payments`, `cash_sessions`, `cash_movements` e as tabelas de autorização — `permissions`, `role_permissions`, `company_role_permissions`, `permission_profiles`, `permission_profile_permissions` e `membership_profiles`) possuem o campo `deleted_at TIMESTAMP NULL`.

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
| `20260731144625_sale_payments` | Cria `sale_payments` (várias formas de pagamento por venda, com valor recebido e troco). Sem permissões novas: o pagamento entra pelas rotas de venda já existentes |
| `20260731153056_cash_registers_and_sessions` | Cria `cash_registers`, `cash_sessions` e `cash_movements` e os enums `CashSessionStatus` e `CashMovementType`; adiciona `companies.cash_blind_close` e `sales.cash_session_id`; acrescenta os 10 códigos `cash-registers.*` e `cash.*` ao catálogo, concede a OWNER e ADMIN no padrão e faz o backfill das empresas existentes (MEMBER fica de fora) |
| `20260804120000_fiscal_module_mvp` | Cria `fiscal_settings`, `fiscal_documents`, `fiscal_status_history` e `fiscal_document_events` e os enums `FiscalDocumentModel`, `FiscalEnvironment`, `FiscalDocumentStatus`, `TaxRegimeCode` e `FiscalPaymentCode`; estende `companies` e `products` com os campos fiscais; acrescenta os 5 códigos `fiscal.*` ao catálogo, concede a OWNER e ADMIN no padrão e faz o backfill das empresas existentes (MEMBER fica de fora) |
| `20260804154411_fiscal_certificate_events` | Cria `fiscal_certificate_events` para auditar o envio e a substituição do certificado A1 |
| `20260804180000_fiscal_settings_por_ambiente` | Troca o UNIQUE de `fiscal_settings` de `establishment_id` para `(establishment_id, ambiente)` — homologação e produção passam a ter série, numeração, CSC e certificado próprios; adiciona `producao_liberada`, `producao_liberada_em` e `producao_liberada_por`; cria `fiscal_settings_events` para auditar série, CSC, troca de ambiente e liberação de produção |
| `20260813120000_nfe_modelo_55` | Adiciona `serie_nfe` e `proximo_numero_nfe` a `fiscal_settings` (sequência própria da NF-e), `ind_ie_dest` e `ibge_code` a `partners`, e semeia `fiscal.nfe.emit` e `fiscal.nfe.cancel` com os três passos |

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
