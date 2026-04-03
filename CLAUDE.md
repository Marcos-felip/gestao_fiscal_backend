# Gestao Fiscal Backend

## About
Sistema SaaS multi-tenant de gestao fiscal para empresas brasileiras.
Stack: NestJS + Prisma + PostgreSQL + Passport JWT.

## Commands
- `npm run start:dev` — development server
- `npm test` — unit tests
- `npm run test:e2e` — integration tests
- `npm run test:cov` — test coverage
- `npx prisma migrate dev` — run migrations
- `npx prisma generate` — generate Prisma client
- `npx prisma studio` — open Prisma Studio
- `docker compose up -d` — start PostgreSQL + pgAdmin

## Architecture
- Multi-tenant via row-level isolation (every business entity has `company_id`)
- Guard chain: JwtAuthGuard -> CompanyTenantGuard -> RolesGuard
- Soft delete on all entities via Prisma middleware (`deletedAt`)
- All monetary values use Decimal(12,2), quantities use Decimal(12,4)

## Conventions
- NestJS standard module structure (module, controller, service, DTOs)
- DTOs use class-validator decorators
- Database columns use snake_case (via @map), code uses camelCase
- API prefix: /api/v1
- Swagger docs at /api/v1/docs

## Multi-tenancy Rules
- ALL business entities MUST have `companyId` field
- ALL queries MUST filter by `companyId` from the authenticated user's active company
- Use `@CurrentCompany()` decorator to get companyId in controllers
- Use `@TenantProtected()` decorator to apply JwtAuth + CompanyTenant + Roles guards

## Modules
- prisma — global database service with soft delete middleware
- auth — JWT authentication with access + refresh tokens
- users — user profile management
- companies — company (tenant) management
- memberships — user-company association with roles
- establishments — matriz/filiais
- products — inventory items
- partners — clients and suppliers
- stock — inventory movements
- sales — sale orders with items
- purchases — purchase orders with items
