---
name: prisma-multi-tenant-check
description: Audita queries Prisma para isolamento multi-tenant, soft delete e integridade de regras criticas no backend NestJS.
---

Use esta skill para revisar seguranca e consistencia de dados no backend NestJS + Prisma.

Referencias obrigatorias:
- `/home/marcos/Projetos/gestao_fiscal_backend/CLAUDE.md`
- `/home/marcos/Projetos/gestao_fiscal_backend/REGRAS_DE_NEGOCIO.md`
- `/home/marcos/Projetos/gestao_fiscal_backend/API.md`
- `/home/marcos/Projetos/gestao_fiscal_backend/BANCO_DE_DADOS.md`

## Checklist de auditoria Prisma

1. Isolamento multi-tenant
   - [ ] toda query de entidade de negocio filtra por `companyId`
   - [ ] escrita cria/atualiza no tenant correto
   - [ ] nenhuma operacao cruza dados de empresas diferentes

2. Soft delete
   - [ ] leitura considera `deletedAt: null`
   - [ ] exclusao usa `update({ deletedAt })`, nao hard delete
   - [ ] entidades com restricao (ex.: OWNER, MATRIZ) respeitam bloqueios

3. Operacoes de risco
   - [ ] nao usar `findUnique`/`update`/`delete` por `id` sem validar tenant
   - [ ] `updateMany`/`deleteMany` com filtros defensivos
   - [ ] nenhuma query sem escopo em modulos criticos (purchases/stock)

4. Workflow e estoque
   - [ ] transicoes de status validas (`DRAFT`, `CONFIRMED`, `CANCELLED`)
   - [ ] apenas rascunho editavel
   - [ ] confirmacao/cancelamento em transacao Prisma
   - [ ] protecao contra estoque negativo

5. Integridade de negocio
   - [ ] unicidade por empresa (ex.: SKU, barcode)
   - [ ] numeracao de compra consistente por empresa
   - [ ] historico de movimentacoes de estoque preservado

## Formato de resultado

Para cada achado, reportar:
- arquivo + trecho
- risco (alto/medio/baixo)
- impacto de negocio
- correcao objetiva sugerida