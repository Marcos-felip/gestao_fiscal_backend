---
name: async-multi-agent
description: Orquestra trilhas DEV/QA/Tech Lead no backend NestJS/Prisma com execução paralela segura e consolidação técnica.
---

Use esta skill para tarefas complexas do backend que podem ser divididas em trilhas paralelas com entrega única.

Referências obrigatórias antes de iniciar:
- `CLAUDE.md`
- `API.md`
- `REGRAS_DE_NEGOCIO.md`

## Protocolo de trilhas (obrigatório)

1. Defina um contrato de execução antes de delegar:
   - objetivo e critérios de aceite
   - trilha DEV (implementação)
   - trilha QA (validação)
   - trilha Tech Lead (consolidação)
   - arquivos permitidos/proibidos por trilha
   - dependências entre trilhas
2. Evite conflito de arquivos:
   - um mesmo arquivo de produção só pode ter **uma trilha escritora por vez**
   - se houver arquivo compartilhado, execute em sequência (DEV → QA → Tech Lead)
   - QA prioriza evidências; alteração em produção só com delegação explícita do Tech Lead
3. Consolide com Tech Lead:
   - revisar diferenças DEV x QA
   - resolver conflitos de implementação/qualidade
   - publicar decisão única de entrega

## Checklist crítico de negócio (backend-first)

- [ ] Workflow de compras respeita `DRAFT → CONFIRMED → CANCELLED`
- [ ] Apenas `DRAFT` é editável; operações inválidas retornam erro de regra
- [ ] Confirmação/cancelamento gera movimentação e estorno de estoque corretos
- [ ] Nunca permite estoque negativo
- [ ] Permissões por papel (`OWNER`, `ADMIN`, `MEMBER`) seguem regras de negócio
- [ ] Multi-tenancy garantido com `companyId` em leitura/escrita
- [ ] Soft delete aplicado com `deletedAt` (sem hard delete indevido)
- [ ] Operações críticas usam transação Prisma

## Saída consolidada esperada

1. Resultado DEV
2. Resultado QA
3. Conflitos e resolução aplicada
4. Mapa de arquivos tocados por trilha
5. Status final: `pronto` | `pronto com ressalvas` | `bloqueado`
