# Gestão Fiscal Backend — Contexto para Claude Code

## Sobre o projeto

Sistema SaaS multi-tenant de gestão fiscal para empresas brasileiras.
Stack: **NestJS 11 + Prisma 7 + PostgreSQL 16 + Passport JWT**.

O sistema permite que múltiplas empresas (tenants) compartilhem a mesma infraestrutura com isolamento total de dados por `company_id`.

## Comandos essenciais

```bash
npm run start:dev          # Servidor de desenvolvimento
npm test                   # Testes unitários (Jest)
npm run test:e2e           # Testes de integração
npm run test:cov           # Cobertura de testes
npm run build              # Build TypeScript
npx prisma migrate dev     # Criar e aplicar migration
npx prisma generate        # Regenerar Prisma Client
npx prisma studio          # Interface visual do banco
docker compose up -d       # Subir PostgreSQL + pgAdmin
```

## Variáveis de ambiente necessárias

```env
DATABASE_URL=postgresql://gestao_fiscal:gestao_fiscal_dev@localhost:5432/gestao_fiscal?schema=public
JWT_SECRET=seu-segredo
JWT_REFRESH_SECRET=seu-segredo-refresh
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
PORT=3000
```

## Arquitetura e decisões técnicas

### Multi-tenancy
- Estratégia: **Row-Level Isolation** — todos os dados de negócio têm `companyId`
- O usuário autenticado possui um `companyActiveId` que define o contexto ativo
- **Regra crítica:** todo `findMany`/`findFirst`/`findUnique` em entidades de negócio DEVE incluir `where: { companyId, deletedAt: null }`

### Prisma 7
- A URL do banco **não vai no `schema.prisma`** — vai no `prisma.config.ts` (para migrations) e no construtor do `PrismaService` (para runtime)
- O `PrismaService` usa o adapter `@prisma/adapter-pg`:
```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
super({ adapter });
```
- Arquivo de config: `prisma.config.ts` na raiz

### Soft delete
- **Todas** as entidades de negócio têm o campo `deletedAt DateTime?`
- **Não há middleware automático** — o soft delete é feito **manualmente** em cada query:
  - Leitura: sempre adicionar `deletedAt: null` no `where`
  - Exclusão: `update({ data: { deletedAt: new Date() } })`
- Entidades que **não podem ser deletadas**: MATRIZ (Establishment), OWNER (Membership)

### Autenticação JWT
- **Access token**: 15 minutos (`JWT_SECRET`)
- **Refresh token**: 7 dias (`JWT_REFRESH_SECRET`), armazenado hasheado (bcrypt) em `user.refreshToken`
- Payload do JWT: `{ sub: userId, email }`
- Logout: zera `refreshToken` no banco

## Cadeia de guards

Existem **duas cadeias**, conforme o tipo de autorização:

```
Por papel:      JwtAuthGuard → CompanyTenantGuard → RolesGuard
Por permissão:  JwtAuthGuard → CompanyTenantGuard → RequirePermissionGuard
```

- `JwtAuthGuard`: valida o Bearer token, popula `request.user = { id, email }`
- `CompanyTenantGuard`: carrega o usuário, valida membership na empresa ativa, popula `request.companyId` e `request.membership`
- `RolesGuard`: verifica se `request.membership.role` está nos papéis permitidos pelo `@Roles()`
- `RequirePermissionGuard`: **libera OWNER sem consultar o banco**; para os demais papéis consulta `company_role_permissions` por `(companyId, role, permissionCode)`. Sem `@RequirePermission()` no handler, o guard libera o acesso

### Uso nos controllers

```typescript
// Autorização por PERMISSÃO (padrão para CRUD):
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
@RequirePermission('products.create')

// Autorização por PAPEL — qualquer membro autenticado com empresa ativa:
@TenantProtected()

// Apenas OWNER e ADMIN:
@TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)

// Apenas OWNER (onboarding, gestão de papéis, gestão de permissões):
@TenantProtected(MembershipRole.OWNER)

// Somente JWT sem tenant (ex: criar empresa, listar empresas do usuário):
@UseGuards(JwtAuthGuard)
```

> `@TenantProtected()` **não** aplica o `RequirePermissionGuard`. Para exigir permissão, declare os guards explicitamente com `@UseGuards(...)`.

## Sistema de permissões

Seis tabelas:

| Tabela | Papel no sistema |
|--------|------------------|
| `permissions` | Catálogo global de códigos `dominio.acao` + descrição |
| `role_permissions` | **Template padrão** por papel. Não é lido em runtime — é copiado ao criar a empresa |
| `company_role_permissions` | Conjunto **efetivo** por papel, por empresa. É a primeira consulta do guard |
| `permission_profiles` | Perfil = conjunto nomeado de permissões, escopado por empresa (`name` único por empresa) |
| `permission_profile_permissions` | Permissões que compõem cada perfil |
| `membership_profiles` | Vínculo N-N membro ↔ perfil. É a segunda consulta do guard, só para MEMBER |

- **OWNER tem acesso total**: o guard nunca o barra. Não é preciso conceder nada a OWNER
- **ADMIN** recebe todas as permissões por padrão; o que o separa do OWNER são endpoints travados por papel
- **MEMBER nasce sem nenhuma permissão** — a cópia do template exclui o papel de propósito. Todo o
  acesso dele vem dos perfis: `efetivas(MEMBER) = company_role_permissions[MEMBER] ∪ perfis vinculados`,
  com o primeiro termo vazio por padrão. **Sem perfil = sem acesso**
- Só MEMBER aceita perfil (`409` para OWNER/ADMIN); gerenciar e vincular exige `permissions.manage`
- `PATCH /permissions/:role` continua existindo (só OWNER, só MEMBER) mas é **legado** — não usar para
  conceder acesso; ele preencheria o baseline de todos os MEMBERs de uma vez
- `GET /permissions/me` devolve as permissões efetivas do usuário — é o endpoint que o frontend usa
- **Seed por migration SQL.** Um módulo novo precisa de: `INSERT` no catálogo, `INSERT` no template
  e **backfill em `company_role_permissions` para as empresas existentes** — o passo 3 é o que
  costuma ser esquecido e causa `403`. Exemplo pronto em [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md#migrations)
- Hierarquia de papéis em `src/common/utils/role-hierarchy.ts`:
  - `assertCanAssignRole` — ao **atribuir** papel: OWNER nunca é atribuível pela API e ninguém atribui papel acima do seu
  - `assertCanManageMember` — ao **editar/remover** usuário: ninguém gerencia quem tem papel acima do seu (o OWNER continua não removível)
- Catálogo completo e matriz padrão: [API.md](./API.md#catálogo-de-permissões)

## Decorators disponíveis

```typescript
@CurrentUser()                        // Retorna { id, email } do request.user
@CurrentCompany()                     // Retorna o companyId do request.companyId
@CurrentMembership()                  // Retorna { id, role, companyId } do request.membership
@Roles(...roles)                      // Papéis aceitos (lido pelo RolesGuard)
@RequirePermission('products.create') // Permissão exigida (lida pelo RequirePermissionGuard)
@TenantProtected(...roles)            // Atalho: JWT + tenant + papéis + @ApiBearerAuth
```

## Paginação

Usar `PaginationDto` de `src/common/dto/pagination.dto.ts`:
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `search` (opcional, string)

Padrão de resposta paginada:
```typescript
{ data: T[], total: number, page: number, limit: number }
```

## Tratamento de erros

- **`PrismaExceptionFilter`** (global): converte erros do Prisma em HTTP (P2002 → 409, P2025 → 404, etc.)
- **Mensagens de erro em português**: todas as exceções (`NotFoundException`, `BadRequestException`, etc.) devem ter mensagens em PT-BR
- Formato de resposta de erro:
```json
{ "statusCode": 404, "message": "Empresa não encontrada", "error": "Not Found" }
```

## Convenções de código

| Aspecto | Convenção |
|---------|-----------|
| Banco de dados | snake_case (via `@map`) |
| Código TypeScript | camelCase |
| Endpoints | kebab-case |
| Mensagens de erro | Português BR |
| Swagger | Português BR |
| Valores monetários | `Decimal(12,2)` |
| Quantidades | `Decimal(12,4)` |

## Como criar um novo módulo

1. Criar pasta `src/nome-modulo/`
2. Criar `nome-modulo.module.ts`, `nome-modulo.controller.ts`, `nome-modulo.service.ts`
3. Criar pasta `dto/` com DTOs usando `class-validator`
4. No service: sempre filtrar por `companyId` e `deletedAt: null`
5. No controller: usar `@CurrentCompany()` + `@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)` com `@RequirePermission('nome-modulo.acao')` (ou `@TenantProtected(...)` quando o controle for por papel)
6. Criar migration com os 3 passos de permissão: catálogo (`permissions`), template (`role_permissions`) e **backfill das empresas existentes** (`company_role_permissions`) — sem o backfill o endpoint retorna 403 para todos menos OWNER
7. Registrar o módulo em `src/app.module.ts`
8. Criar `nome-modulo.service.spec.ts` com testes unitários

## Estrutura de módulos

```
src/
├── prisma/          PrismaService (global) com adapter PG
├── common/
│   ├── decorators/  @CurrentUser, @CurrentCompany, @Roles, @TenantProtected
│   ├── guards/      JwtAuthGuard, CompanyTenantGuard, RolesGuard
│   ├── filters/     PrismaExceptionFilter
│   ├── validators/  @IsCpf, @IsCnpj, @IsCpfOrCnpj
│   ├── dto/         PaginationDto
│   └── types/       Express.d.ts
├── auth/            Registro, login, refresh, logout, troca de senha obrigatória
├── users/           Perfil, troca de empresa ativa, criação de usuário + membership
├── companies/       CRUD de empresas + onboarding
├── memberships/     Criação de membros, papéis, remoção
├── permissions/     Catálogo de permissões e vínculo papel → permissão
├── permission-profiles/ Perfis de permissão e vínculo membro → perfil
├── establishments/  CRUD de estabelecimentos (MATRIZ/FILIAL)
├── products/        CRUD de produtos com paginação
├── partners/        CRUD de parceiros (clientes/fornecedores)
├── stock/           Movimentações de estoque
├── purchases/       Compras com controle de estoque
├── sales/           Vendas e orçamentos (PDV) com baixa de estoque
└── receivables/     Contas a receber: títulos e baixas
```

## Transações críticas

As seguintes operações **obrigatoriamente** usam `prisma.$transaction()`:
- Criar empresa (company + membership + update user + cópia das permissões padrão)
- Criar membro (create user + create membership)
- Atualizar permissões de um papel (deleteMany + createMany em `company_role_permissions`)
- Atualizar as permissões de um perfil (deleteMany + createMany em `permission_profile_permissions`)
- Substituir os perfis de um membro (deleteMany + createMany em `membership_profiles`)
- Onboarding (update company + create establishment)
- Confirmar compra (criar StockMovements + atualizar currentStock + confirmar purchase)
- Cancelar compra confirmada (reverter StockMovements + atualizar currentStock)
- Criar venda (numeração + validar estabelecimento/cliente/produtos + criar itens; com `confirm: true` a baixa de estoque entra na mesma transação)
- Finalizar venda (validar saldo + criar StockMovements SAIDA + atualizar currentStock + concluir sale + gerar os títulos quando A_PRAZO)
- Cancelar venda concluída (cancelar títulos + reverter StockMovements + atualizar currentStock + estornar paymentStatus)
- Criar título a receber parcelado (uma linha por parcela)
- Baixar título (criar FinancialPayment + atualizar paidAmount + recalcular status)
- Atualizar venda com troca de itens (deleteMany dos itens + recriar + recalcular totais)
- Movimentação manual de estoque (criar StockMovement + atualizar currentStock)

## Documentações relacionadas

- [README.md](./README.md) — setup e como rodar
- [REGRAS_DE_NEGOCIO.md](./REGRAS_DE_NEGOCIO.md) — regras de negócio
- [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md) — modelagem do banco
- [API.md](./API.md) — contratos de API para agentes frontend
