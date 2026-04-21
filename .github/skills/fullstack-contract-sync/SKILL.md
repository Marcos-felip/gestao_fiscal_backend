---
name: fullstack-contract-sync
description: Sincroniza mudanças de endpoint/DTO/enum entre backend e frontend com foco em contratos e regras críticas.
---

Use esta skill sempre que houver mudança de contrato que afete backend e frontend.

## Quando acionar

- inclusão/remoção/renomeação de endpoint
- mudança de método HTTP, parâmetros, query params ou status code
- alteração em DTO de request/response
- inclusão/remoção de valores de enum
- alteração de regra de workflow (vendas, compras, estoque)

## Fluxo de sincronização (backend + frontend)

1. Backend primeiro (fonte do contrato)
   - [ ] atualizar controller/service/DTO
   - [ ] validar regras de negócio em `REGRAS_DE_NEGOCIO.md`
   - [ ] atualizar `API.md` com exemplos e erros
2. Propagação no frontend
   - [ ] atualizar tipos/interfaces/enums
   - [ ] ajustar chamadas HTTP, payload e parsing
   - [ ] revisar telas/formulários e mensagens de erro
3. Validação cruzada de regras críticas
   - [ ] workflow `DRAFT → CONFIRMED → CANCELLED`
   - [ ] apenas `DRAFT` editável
   - [ ] confirmação/cancelamento com efeito correto no estoque
   - [ ] proteção de permissões por papel
   - [ ] multi-tenancy no contexto da empresa ativa
   - [ ] sem exposição de itens soft deleted
4. Governança de mudança
   - [ ] classificar breaking vs non-breaking
   - [ ] definir plano de rollout/migração quando necessário
   - [ ] registrar pendências por trilha (DEV/QA)

## Entregável esperado

- Matriz de compatibilidade Backend x Frontend (ok/divergente)
- Lista de ajustes obrigatórios por camada
- Riscos de regressão e plano de mitigação
- Status final: `100% sincronizado` ou `sincronização pendente`
