---
name: fullstack-planning
description: Conduz reuniao tecnica FE/BE e gera plano unico com contrato de trilhas e formato obrigatorio.
---

Use esta skill para iniciar qualquer demanda com impacto em backend + frontend.

Referencias obrigatorias:
- `.github/FULLSTACK_COLLABORATION.md`
- `API.md`
- `REGRAS_DE_NEGOCIO.md`
- `.github/copilot-instructions.md`
- Frontend: `/home/marcos/Projetos/gestao_fiscal_frontend/SPEC.md`
- Frontend: `/home/marcos/Projetos/gestao_fiscal_frontend/API.md`

## Rito de reuniao FE/BE (obrigatorio)

1. Kickoff (Tech Leads FE/BE): alinhar contexto, escopo e criterios de aceite
2. DEV FE/BE: propor estrategia tecnica por camada
3. QA FE/BE: mapear riscos, cenarios criticos e validacoes
4. Consolidacao TL FE+BE: resolver conflitos e fechar plano unico
5. Validacao humana: aprovar plano antes da implementacao

## Contrato de trilhas por rodada (obrigatorio)

Definir explicitamente:
1. Responsavel por trilha
2. Arquivos permitidos
3. Arquivos proibidos
4. Dependencias entre trilhas
5. Evidencias esperadas

Regra: sem escrita concorrente no mesmo arquivo.

## Checklist de sincronizacao FE/BE

- [ ] `API.md` atualizado quando houver mudanca de endpoint/DTO/enums/status HTTP
- [ ] Impactos no frontend descritos (tipos, formularios, tabelas, estados de erro)
- [ ] Impactos no backend descritos (guards, permissoes, transacoes, soft delete)
- [ ] Workflow de dominio preservado (`DRAFT -> CONFIRMED -> CANCELLED`)
- [ ] Multi-tenancy e permissoes por papel preservadas

## Formato obrigatorio do plano final

1. Contexto e escopo validado
2. Decisoes FE (arquitetura, componentes, contratos consumidos)
3. Decisoes BE (endpoints, DTOs, regras, persistencia)
4. Riscos e mitigacoes
5. Backlog de implementacao (com dependencias)
6. Criterios de aceite e validacao
7. Status final: `pronto para implementar` | `precisa ajuste`