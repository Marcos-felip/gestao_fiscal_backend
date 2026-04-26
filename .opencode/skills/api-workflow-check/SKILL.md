---
name: api-workflow-check
description: Valida contratos da API NestJS/Prisma e regras de workflow para integracoes sem regressao funcional.
---

Use esta skill quando houver endpoint, DTO, enum, formulario ou fluxo de negocio impactando API.

Referencias obrigatorias:
- `API.md`
- `REGRAS_DE_NEGOCIO.md`
- `CLAUDE.md`
- Frontend: `/home/marcos/Projetos/gestao_fiscal_frontend/API.md`

## Checklist de validacao (backend-first)

1. Contrato HTTP
   - [ ] metodo e endpoint corretos
   - [ ] autenticacao/guards corretos (`JwtAuthGuard`, tenant e roles)
   - [ ] payload de request aderente ao DTO
   - [ ] shape de response aderente ao contrato
2. DTOs e validacao
   - [ ] campos obrigatorios/opcionais corretos
   - [ ] `class-validator` consistente com regras de negocio
   - [ ] mensagens de erro em PT-BR
3. Paginacao e filtros
   - [ ] `page`, `limit`, `search` e limites aplicados
   - [ ] resposta `{ data, total, page, limit }`
4. Regras criticas
   - [ ] workflow `DRAFT -> CONFIRMED -> CANCELLED` em vendas/compras
   - [ ] somente `DRAFT` editavel
   - [ ] confirmacao/cancelamento com impacto correto no estoque
   - [ ] bloqueio de estoque negativo
5. Permissoes e multi-tenancy
   - [ ] acoes restritas por papel (`OWNER`, `ADMIN`, `MEMBER`)
   - [ ] dados sempre no contexto da empresa ativa
6. Soft delete e erros
   - [ ] leituras ignoram `deletedAt != null`
   - [ ] exclusao logica preservada
   - [ ] formato de erro `{ statusCode, message, error }`

## Saida esperada

- Lista de inconsistencias contrato x implementacao
- Impacto funcional por inconsistencia
- Correcao sugerida por prioridade (alta/media/baixa)