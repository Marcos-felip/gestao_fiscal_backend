---
name: api-workflow-check
description: Valida contratos da API NestJS/Prisma e regras de workflow para integrações sem regressão funcional.
---

Use esta skill quando houver endpoint, DTO, enum, formulário ou fluxo de negócio impactando API.

Referências obrigatórias:
- `API.md`
- `REGRAS_DE_NEGOCIO.md`
- `CLAUDE.md`

## Checklist de validação (backend-first)

1. Contrato HTTP
   - [ ] método e endpoint corretos
   - [ ] autenticação/guards corretos (`JwtAuthGuard`, tenant e roles)
   - [ ] payload de request aderente ao DTO
   - [ ] shape de response aderente ao contrato
2. DTOs e validação
   - [ ] campos obrigatórios/opcionais corretos
   - [ ] `class-validator` consistente com regras de negócio
   - [ ] mensagens de erro em PT-BR
3. Paginação e filtros
   - [ ] `page`, `limit`, `search` e limites aplicados
   - [ ] resposta `{ data, total, page, limit }`
4. Regras críticas
   - [ ] workflow `DRAFT → CONFIRMED → CANCELLED` em compras
   - [ ] somente `DRAFT` editável
   - [ ] confirmação/cancelamento com impacto correto no estoque
   - [ ] bloqueio de estoque negativo
5. Permissões e multi-tenancy
   - [ ] ações restritas por papel (`OWNER`, `ADMIN`, `MEMBER`)
   - [ ] dados sempre no contexto da empresa ativa
6. Soft delete e erros
   - [ ] leituras ignoram `deletedAt != null`
   - [ ] exclusão lógica preservada
   - [ ] formato de erro `{ statusCode, message, error }`

## Saída esperada

- Lista de inconsistências contrato x implementação
- Impacto funcional por inconsistência
- Correção sugerida por prioridade (alta/média/baixa)
