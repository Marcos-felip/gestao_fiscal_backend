---
name: async-multi-agent
description: Orquestra trilhas DEV/QA/Tech Lead no backend NestJS/Prisma com execucao paralela segura e consolidacao tecnica.
---

Use esta skill para tarefas complexas do backend que podem ser divididas em trilhas paralelas com entrega unica.

Referencias obrigatorias antes de iniciar:
- `CLAUDE.md`
- `API.md`
- `REGRAS_DE_NEGOCIO.md`

## Protocolo de trilhas (obrigatorio)

1. Defina um contrato de execucao antes de delegar:
   - objetivo e criterios de aceite
   - trilha DEV (implementacao)
   - trilha QA (validacao)
   - trilha Tech Lead (consolidacao)
   - arquivos permitidos/proibidos por trilha
   - dependencias entre trilhas
2. Evite conflito de arquivos:
   - um mesmo arquivo de producao so pode ter **uma trilha escritora por vez**
   - se houver arquivo compartilhado, execute em sequencia (DEV -> QA -> Tech Lead)
   - QA prioriza evidencias; alteracao em producao so com delegacao explicita do Tech Lead
3. Consolide com Tech Lead:
   - revisar diferencas DEV x QA
   - resolver conflitos de implementacao/qualidade
   - publicar decisao unica de entrega

## Checklist critico de negocio (backend-first)

- [ ] Workflow de vendas e compras respeita `DRAFT -> CONFIRMED -> CANCELLED`
- [ ] Apenas `DRAFT` e editavel; operacoes invalidas retornam erro de regra
- [ ] Confirmacao/cancelamento gera movimentacao e estorno de estoque corretos
- [ ] Nunca permite estoque negativo
- [ ] Permissoes por papel (`OWNER`, `ADMIN`, `MEMBER`) seguem regras de negocio
- [ ] Multi-tenancy garantido com `companyId` em leitura/escrita
- [ ] Soft delete aplicado com `deletedAt` (sem hard delete indevido)
- [ ] Operacoes criticas usam transacao Prisma

## Saida consolidada esperada

1. Resultado DEV
2. Resultado QA
3. Conflitos e resolucao aplicada
4. Mapa de arquivos tocados por trilha
5. Status final: `pronto` | `pronto com ressalvas` | `bloqueado`