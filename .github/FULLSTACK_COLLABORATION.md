# Protocolo Canonico — Fullstack Planning (FE + BE)

## Objetivo

Produzir um plano unico de implementacao para `feat/fix/task`, com acordo entre:
- Tech Lead Frontend
- Tech Lead Backend
- Dev Frontend
- Dev Backend
- QA Frontend
- QA Backend

## Entrada obrigatoria

1. Contexto de negocio e problema
2. Escopo (in/out)
3. API/DTO/workflow potencialmente impactados
4. Criterios de aceite funcionais e tecnicos
5. Restricoes (prazo, compatibilidade, riscos)

## Contrato de trilhas

Cada rodada deve definir:
1. Responsavel por trilha
2. Arquivos permitidos
3. Arquivos proibidos
4. Dependencias entre trilhas
5. Evidencias esperadas

Regra: sem escrita concorrente no mesmo arquivo.

## Fluxo da "reuniao" tecnica

1. Kickoff (Tech Leads FE/BE): alinhar escopo e criterios de aceite
2. DEV FE/BE: propor estrategia tecnica por camada
3. QA FE/BE: avaliar riscos, cenarios criticos e criterio de validacao
4. Consolidacao TL FE+BE: resolver conflitos e fechar plano unico
5. Validacao humana: aprovacao antes da implementacao

## Checklist de sincronizacao FE/BE

- API.md atualizado quando houver mudanca de endpoint/DTO/enums/status HTTP
- Impactos no frontend descritos (tipos, formularios, tabelas, estados de erro)
- Impactos no backend descritos (guards, permissoes, transacoes, soft delete)
- Workflow de dominio preservado (DRAFT -> CONFIRMED -> CANCELLED)
- Multi-tenancy e permissoes por papel preservadas

## Compatibilidade com sync por .env

- Manter a linha `- Frontend: \`...\`` em `.github/copilot-instructions.md` no formato esperado pelo script de sincronizacao.
- O path do frontend deve continuar vindo de `FRONTEND_COPILOT_INSTRUCTIONS_PATH` no `.env`.
- Quando necessario atualizar o caminho, executar `npm run sync:copilot-instructions`.

## Formato obrigatorio da saida (plano final)

1. Contexto e escopo validado
2. Decisoes FE (arquitetura, componentes, contratos consumidos)
3. Decisoes BE (endpoints, DTOs, regras, persistencia)
4. Riscos e mitigacoes
5. Backlog de implementacao (com dependencias)
6. Criterios de aceite e validacao
7. Status final: pronto para implementar | precisa ajuste
