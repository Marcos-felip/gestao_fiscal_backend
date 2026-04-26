---
name: fullstack-contract-sync
description: Sincroniza mudancas de endpoint/DTO/enum entre backend e frontend com foco em contratos e regras criticas.
---

Use esta skill sempre que houver mudanca de contrato que afete backend e frontend.

## Quando acionar

- inclusao/remocao/renomeacao de endpoint
- mudanca de metodo HTTP, parametros, query params ou status code
- alteracao em DTO de request/response
- inclusao/remocao de valores de enum
- alteracao de regra de workflow (vendas, compras, estoque)

## Fluxo de sincronizacao (backend + frontend)

1. Backend primeiro (fonte do contrato)
   - [ ] atualizar controller/service/DTO
   - [ ] validar regras de negocio em `REGRAS_DE_NEGOCIO.md`
   - [ ] atualizar `API.md` com exemplos e erros
   - [ ] atualizar `API.md` no frontend (`/home/marcos/Projetos/gestao_fiscal_frontend/API.md`) com exemplos e erros

2. Propagacao no frontend
   - [ ] atualizar tipos/interfaces/enums
   - [ ] ajustar chamadas HTTP, payload e parsing
   - [ ] revisar telas/formularios e mensagens de erro

3. Validacao cruzada de regras criticas
   - [ ] workflow `DRAFT -> CONFIRMED -> CANCELLED`
   - [ ] apenas `DRAFT` editavel
   - [ ] confirmacao/cancelamento com efeito correto no estoque
   - [ ] protecao de permissoes por papel
   - [ ] multi-tenancy no contexto da empresa ativa
   - [ ] sem exposicao de itens soft deleted

4. Governanca de mudanca
   - [ ] classificar breaking vs non-breaking
   - [ ] definir plano de rollout/migracao quando necessario
   - [ ] registrar pendencias por trilha (DEV/QA)

## Entregavel esperado

- Matriz de compatibilidade Backend x Frontend (ok/divergente)
- Lista de ajustes obrigatorios por camada
- Riscos de regressao e plano de mitigacao
- Status final: `100% sincronizado` ou `sincronizacao pendente`