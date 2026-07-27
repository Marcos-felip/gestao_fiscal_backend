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
- `RequirePermissionGuard`: consulta `role_permissions` pelo `request.membership.role` e verifica o código exigido pelo `@RequirePermission()`. Sem `@RequirePermission()` no handler, o guard libera o acesso

### Uso nos controllers

```typescript
// Autorização por PERMISSÃO (padrão para CRUD):
@UseGuards(JwtAuthGuard, CompanyTenantGuard, RequirePermissionGuard)
@RequirePermission('products.create')

// Autorização por PAPEL — qualquer membro autenticado com empresa ativa:
@TenantProtected()

// Apenas OWNER e ADMIN:
@TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)

// Apenas OWNER (onboarding, gestão de papéis, permissões, excluir estabelecimento):
@TenantProtected(MembershipRole.OWNER)

// Somente JWT sem tenant (ex: criar empresa, listar empresas do usuário):
@UseGuards(JwtAuthGuard)
```

> `@TenantProtected()` **não** aplica o `RequirePermissionGuard`. Para exigir permissão, declare os guards explicitamente com `@UseGuards(...)`.

## Sistema de permissões

- Códigos no formato `dominio.acao` (ex: `purchases.confirm`), na tabela `permissions`
- Vínculo papel → permissão na tabela `role_permissions` (PK composta `role + permission_code`)
- **Seed é feito por migration SQL**, não por script de seed do Prisma. Ao criar um módulo novo, adicione uma migration com `INSERT ... ON CONFLICT DO NOTHING` para os códigos e para os vínculos de OWNER/ADMIN/MEMBER
- `PATCH /permissions/:role` só aceita `MEMBER`; OWNER e ADMIN têm conjuntos fixos
- ⚠️ **`role_permissions` não tem `company_id`** — as permissões são globais da instância, não por tenant. Alterar MEMBER afeta todas as empresas
- Catálogo completo e matriz padrão: [API.md](./API.md#catálogo-de-permissões)

## Decorators disponíveis

```typescript
@CurrentUser()                        // Retorna { id, email } do request.user
@CurrentCompany()                     // Retorna o companyId do request.companyId
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
6. Criar migration que insere os códigos de permissão do módulo em `permissions` e os vincula aos papéis em `role_permissions` — **sem isso o endpoint retorna 403 para todos**
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
├── establishments/  CRUD de estabelecimentos (MATRIZ/FILIAL)
├── products/        CRUD de produtos com paginação
├── partners/        CRUD de parceiros (clientes/fornecedores)
├── stock/           Movimentações de estoque
└── purchases/       Compras com controle de estoque
```

## Transações críticas

As seguintes operações **obrigatoriamente** usam `prisma.$transaction()`:
- Criar empresa (company + membership + update user)
- Criar membro (create user + create membership)
- Atualizar permissões de um papel (deleteMany + createMany em `role_permissions`)
- Onboarding (update company + create establishment)
- Confirmar compra (criar StockMovements + atualizar currentStock + confirmar purchase)
- Cancelar compra confirmada (reverter StockMovements + atualizar currentStock)
- Movimentação manual de estoque (criar StockMovement + atualizar currentStock)

## Documentações relacionadas

- [README.md](./README.md) — setup e como rodar
- [REGRAS_DE_NEGOCIO.md](./REGRAS_DE_NEGOCIO.md) — regras de negócio
- [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md) — modelagem do banco
- [API.md](./API.md) — contratos de API para agentes frontend
