# GitHub Copilot Instructions — Gestão Fiscal Backend

## 1) Projeto e Stack

Backend de um SaaS multi-tenant de gestão fiscal para empresas brasileiras.

- **Framework:** NestJS 11 (arquitetura modular)
- **ORM:** Prisma 7 + `@prisma/adapter-pg`
- **Banco:** PostgreSQL 16
- **Auth:** JWT (access 15min + refresh 7d) com Passport
- **Validação:** `class-validator` + `class-transformer`
- **Documentação:** Swagger/OpenAPI em `/api/v1/docs`
- **Testes:** Jest (unitário e e2e)

## 2) Convenções de Código

- Código (classes, métodos, variáveis e nomes técnicos) em **inglês**.
- Mensagens de erro, descrições de Swagger e textos de regra de negócio em **português brasileiro**.
- Seguir padrão modular do NestJS: `module/controller/service/dto`.
- DTOs com validação explícita; nunca usar `any` em contratos públicos.
- Endpoints em **kebab-case** e payloads consistentes com `API.md`.
- Operações críticas de domínio devem usar `prisma.$transaction()`.

## 3) Multi-tenancy, Soft Delete, Guards e Permissões

### Multi-tenancy
- Todo dado de negócio é isolado por `companyId`.
- Toda consulta de entidade de negócio deve filtrar por contexto ativo e por não deletado:
  - `where: { companyId, deletedAt: null }`
- Usuário sem empresa ativa não acessa recursos tenant-protegidos.

### Soft delete
- Exclusão lógica manual com `deletedAt` (sem middleware automático global).
- Leitura sempre exclui registros com `deletedAt != null`.
- Regras especiais:
  - não remover membership com papel `OWNER`
  - não excluir estabelecimento `MATRIZ`

### Cadeia de guards
- Ordem padrão: **`JwtAuthGuard → CompanyTenantGuard → RolesGuard`**.
- Utilizar `@TenantProtected()` para rotas com contexto de empresa.
- Utilizar `@TenantProtected(MembershipRole.OWNER, MembershipRole.ADMIN)` quando a ação exigir elevação.
- Utilizar apenas `@UseGuards(JwtAuthGuard)` em rotas sem contexto tenant (ex.: criar empresa).

### Permissões
- Papéis válidos: `OWNER`, `ADMIN`, `MEMBER`.
- `OWNER` tem controle total (incluindo gestão de membros).
- `ADMIN` opera gestão diária, sem poderes de owner.
- `MEMBER` opera fluxo básico sem ações administrativas sensíveis.

## 4) Workflows de Venda, Compra e Estoque

### Vendas
- Ciclo: **`DRAFT → CONFIRMED → CANCELLED`**.
- Apenas `DRAFT` é editável.
- Confirmar venda: baixa estoque (`SAIDA`) por item.
- Cancelar venda confirmada: estorna estoque (`ENTRADA`) por item.

### Compras
- Ciclo: **`DRAFT → CONFIRMED → CANCELLED`**.
- Apenas `DRAFT` é editável.
- Confirmar compra: entrada de estoque (`ENTRADA`) por item.
- Cancelar compra confirmada: estorno (`SAIDA`) por item.

### Estoque
- Estoque **nunca** pode ficar negativo.
- Movimentações (`ENTRADA`, `SAIDA`, `AJUSTE`) devem manter histórico auditável.
- Operações que alteram saldo e criam movimentação devem ser atômicas (transação).

## 5) Padrão de DTO, Erros e Swagger (pt-BR)

### DTO
- Seguir nomenclatura por contexto: `CreateXDto`, `UpdateXDto`, `ListXQueryDto`, etc.
- Validar campos obrigatórios/opcionais com `class-validator`.
- Garantir tipagem precisa para enums de domínio (`SaleStatus`, `PurchaseStatus`, etc.).

### Erros
- Mensagens de exceção em **pt-BR**.
- Formato de resposta:

```json
{ "statusCode": 404, "message": "Produto não encontrado", "error": "Not Found" }
```

- Respeitar mapeamento de erros do Prisma via `PrismaExceptionFilter` (ex.: `P2002` → `409`, `P2025` → `404`).

### Swagger
- Decorar controllers/DTOs para documentação clara em português.
- Manter exemplos de request/response alinhados ao contrato real.
- Toda mudança em endpoint/DTO/status code deve refletir Swagger e `API.md`.

## 6) Comandos de Qualidade

Executar no backend (`/home/marcos/Projetos/gestao_fiscal_backend`):

```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

Comandos adicionais úteis:

```bash
npm run test:cov
npm run start:dev
```

## 7) Agentes e Skills Customizados

### Agentes (`.github/agents`)
- `tech-lead`: coordena estratégia técnica e consolidação final.
- `dev-engineer`: implementa/refatora código backend.
- `qa-engineer`: valida regras de negócio, regressão e qualidade.

### Skills (`.github/skills`)
- `/api-workflow-check`: valida aderência entre contratos de API, DTOs e workflow de negócio.
- `/async-multi-agent`: orquestra DEV + QA em paralelo com consolidação técnica.
- `/prisma-multi-tenant-check`: audita queries Prisma para isolamento tenant, soft delete e integridade.
- `/fullstack-contract-sync`: coordena sincronização de contrato entre backend e frontend.

### Fluxo recomendado em tarefas grandes
1. `tech-lead` define plano e divide trilhas.
2. `dev-engineer` implementa com foco em contrato + domínio.
3. `qa-engineer` valida testes, permissões, multi-tenancy e regressão.
4. `tech-lead` consolida resultado final.

## 8) Protocolo de Trabalho Conjunto FE/BE

- `API.md` é a **fonte de verdade compartilhada** entre frontend e backend.
- Qualquer alteração em controller, DTO, enum, status code, paginação ou regra de workflow **deve** atualizar `API.md` na mesma entrega.
- Mudança que impacta frontend deve incluir checklist de impacto:
  - rotas alteradas
  - campos adicionados/removidos/renomeados
  - mudanças de validação
  - mudanças de status HTTP e mensagens
  - mudanças de enum/estados (`DRAFT/CONFIRMED/CANCELLED`)
- Para mudanças breaking, comunicar explicitamente estratégia de migração (compatibilidade temporária, feature flag ou rollout coordenado).
- Frontend deve consumir apenas contratos documentados; backend não deve introduzir divergência silenciosa entre implementação e documentação.
- Antes de merge, validar fluxo ponta a ponta de autenticação, tenant ativo, permissões e impactos em telas de venda/compra/estoque.

## Documentação Relacionada

- `CLAUDE.md`
- `REGRAS_DE_NEGOCIO.md`
- `API.md`
- Frontend: `/home/marcos/Projetos/gestao_fiscal_frontend/.github/copilot-instructions.md`
