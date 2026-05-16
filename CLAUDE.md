# Gestão Fiscal Backend — Contexto para Claude Code

## Sobre o projeto

Sistema SaaS multi-tenant de gestão fiscal para empresas brasileiras.
Stack: **NestJS 10 + Prisma 7 + PostgreSQL 16 + Passport JWT**.

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

```
JwtAuthGuard → CompanyTenantGuard → RolesGuard
```

- `JwtAuthGuard`: valida o Bearer token, popula `request.user = { id, email }`
- `CompanyTenantGuard`: carrega o usuário, valida membership na empresa ativa, popula `request.companyId` e `request.membership`
- `RolesGuard`: verifica se `request.membership.role` está nos papéis permitidos pelo `@Roles()`

### Uso nos controllers

```typescript
// Qualquer membro autenticado com empresa ativa:
@TenantProtected()

// Apenas OWNER e ADMIN:
@TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)

// Apenas OWNER:
@TenantProtected(MembershipRole.OWNER)

// Somente JWT sem tenant (ex: criar empresa):
@UseGuards(JwtAuthGuard)
```

## Decorators disponíveis

```typescript
@CurrentUser()      // Retorna { id, email } do request.user
@CurrentCompany()   // Retorna o companyId do request.companyId
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
5. No controller: usar `@TenantProtected()` e `@CurrentCompany()`
6. Registrar o módulo em `src/app.module.ts`
7. Criar `nome-modulo.service.spec.ts` com testes unitários

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
├── auth/            Registro, login, refresh, logout
├── users/           Perfil, troca de empresa ativa
├── companies/       CRUD de empresas + onboarding
├── memberships/     Convite, papéis, remoção de membros
├── establishments/  CRUD de estabelecimentos (MATRIZ/FILIAL)
├── products/        CRUD de produtos com paginação
├── partners/        CRUD de parceiros (clientes/fornecedores)
├── stock/           Movimentações de estoque
└── purchases/       Compras com controle de estoque
```

## Transações críticas

As seguintes operações **obrigatoriamente** usam `prisma.$transaction()`:
- Criar empresa (company + membership + update user)
- Onboarding (update company + create establishment)
- Confirmar compra (criar StockMovements + atualizar currentStock + confirmar purchase)
- Cancelar compra confirmada (reverter StockMovements + atualizar currentStock)
- Movimentação manual de estoque (criar StockMovement + atualizar currentStock)

## Documentações relacionadas

- [README.md](./README.md) — setup e como rodar
- [REGRAS_DE_NEGOCIO.md](./REGRAS_DE_NEGOCIO.md) — regras de negócio
- [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md) — modelagem do banco
- [API.md](./API.md) — contratos de API para agentes frontend
