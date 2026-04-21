---
name: prisma-multi-tenant-check
description: Audita queries Prisma para isolamento multi-tenant, soft delete e integridade de regras críticas.
---

Use esta skill para revisar segurança e consistência de dados no backend NestJS + Prisma.

Referências obrigatórias:
- `CLAUDE.md`
- `REGRAS_DE_NEGOCIO.md`
- `API.md`

## Checklist de auditoria Prisma

1. Isolamento multi-tenant
   - [ ] toda query de entidade de negócio filtra por `companyId`
   - [ ] escrita cria/atualiza no tenant correto
   - [ ] nenhuma operação cruza dados de empresas diferentes
2. Soft delete
   - [ ] leitura considera `deletedAt: null`
   - [ ] exclusão usa `update({ deletedAt })`, não hard delete
   - [ ] entidades com restrição (ex.: OWNER, MATRIZ) respeitam bloqueios
3. Operações de risco
   - [ ] não usar `findUnique`/`update`/`delete` por `id` sem validar tenant
   - [ ] `updateMany`/`deleteMany` com filtros defensivos
   - [ ] nenhuma query sem escopo em módulos críticos (sales/purchases/stock)
4. Workflow e estoque
   - [ ] transições de status válidas (`DRAFT`, `CONFIRMED`, `CANCELLED`)
   - [ ] apenas rascunho editável
   - [ ] confirmação/cancelamento em transação Prisma
   - [ ] proteção contra estoque negativo
5. Integridade de negócio
   - [ ] unicidade por empresa (ex.: SKU, barcode)
   - [ ] numeração de venda/compra consistente por empresa
   - [ ] histórico de movimentações de estoque preservado

## Formato de resultado

Para cada achado, reportar:
- arquivo + trecho
- risco (alto/médio/baixo)
- impacto de negócio
- correção objetiva sugerida
