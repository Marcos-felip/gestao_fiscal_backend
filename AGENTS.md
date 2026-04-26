# Gestao Fiscal Backend — Instrucoes para Agentes

## Projeto

SaaS multi-tenant de gestao fiscal para empresas brasileiras.
Backend: NestJS 11 + Prisma 7 + PostgreSQL 16 + Passport JWT
Frontend: Angular 19+ (standalone, signals) + Tailwind CSS + PrimeNG (unstyled) + ngx-echarts

## Repositorios

- **Backend:** `/home/marcos/Projetos/gestao_fiscal_backend/`
- **Frontend:** `/home/marcos/Projetos/gestao_fiscal_frontend/`

## Documentacao obrigatoria

### Backend
- `CLAUDE.md` — contexto do backend
- `API.md` — contratos da API
- `REGRAS_DE_NEGOCIO.md` — regras de negocio
- `BANCO_DE_DADOS.md` — modelagem do banco
- `.github/copilot-instructions.md` — convencoes do backend

### Frontend
- `/home/marcos/Projetos/gestao_fiscal_frontend/SPEC.md` — especificacao completa
- `/home/marcos/Projetos/gestao_fiscal_frontend/API.md` — contratos da API REST
- `/home/marcos/Projetos/gestao_fiscal_frontend/DESIGN_SYSTEM.md` — design system completo
- `/home/marcos/Projetos/gestao_fiscal_frontend/.github/copilot-instructions.md` — convencoes de codigo

## Convencoes de codigo

### Backend (NestJS)
- Arquitetura modular: `module/controller/service/dto`
- DTOs com `class-validator` + `class-transformer`
- Multi-tenant: toda query de negocio com `where: { companyId, deletedAt: null }`
- Soft delete manual: `update({ data: { deletedAt: new Date() } })`
- Transacoes criticas com `prisma.$transaction()`
- Cadeia de guards: `JwtAuthGuard -> CompanyTenantGuard -> RolesGuard`
- Decorators: `@CurrentUser()`, `@CurrentCompany()`, `@TenantProtected()`
- Mensagens de erro em PT-BR
- Paginacao: `PaginationDto` com resposta `{ data, total, page, limit }`

### Frontend (Angular)
- Standalone components, signals, `inject()`, `computed()`
- Consumo HTTP via `ApiService`
- Tailwind CSS com tokens do design system
- `changeDetection: ChangeDetectionStrategy.OnPush`

## Regras de negocio criticas

1. Multi-tenant: toda operacao no contexto da empresa ativa
2. Refresh token: interceptor faz refresh silencioso em 401
3. Permissoes: OWNER > ADMIN > MEMBER
4. Workflow vendas/compras: DRAFT -> CONFIRMED -> CANCELLED
5. Estoque nunca negativo; confirmacao baixa, cancelamento estorna
6. Soft delete: frontend so chama DELETE, backend faz exclusao logica
7. Validacoes brasileiras: CPF, CNPJ, CEP, telefone

## Comandos de qualidade

### Backend
```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

### Frontend
```bash
cd /home/marcos/Projetos/gestao_fiscal_frontend && ng build
cd /home/marcos/Projetos/gestao_fiscal_frontend && ng lint
cd /home/marcos/Projetos/gestao_fiscal_frontend && ng test
```

## Agentes disponiveis (backend)

- `tech-lead`: coordenacao tecnica e consolidacao de entregas
- `dev-engineer`: implementacao e refatoracao NestJS/Prisma
- `qa-engineer`: validacao de contratos, regras de negocio e testes
- `backend-developer`: implementacao backend especializada
- `qa-tester`: testes unitarios e de integracao com Jest

## Skills disponiveis (backend)

- `/fullstack-planning`: planejamento colaborativo FE/BE com contrato de trilhas
- `/api-workflow-check`: validacao de contratos da API e workflows de negocio
- `/async-multi-agent`: execucao paralela DEV + QA com consolidacao por Tech Lead
- `/fullstack-contract-sync`: sincronizacao de contratos entre backend e frontend
- `/prisma-multi-tenant-check`: auditoria de queries Prisma para isolamento tenant

## Fluxo recomendado para tarefas maiores

1. Em tarefas FE+BE, iniciar com a skill `/fullstack-planning`
2. Iniciar com o agente `tech-lead`
3. Delegar implementacao para `dev-engineer` ou `backend-developer`
4. Delegar validacao para `qa-engineer` ou `qa-tester`
5. Consolidar decisao final via `tech-lead`