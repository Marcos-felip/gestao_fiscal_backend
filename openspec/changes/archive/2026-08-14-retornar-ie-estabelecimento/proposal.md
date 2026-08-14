## Why

A Inscrição Estadual do emitente vive em **duas colunas** e o usuário só consegue
escrever numa delas sem nunca conseguir lê-la de volta.

O que existe hoje:

- `Company.inscricaoEstadual` — IE da empresa. É lida e devolvida normalmente.
- `Establishment.inscricaoEstadual` — IE do estabelecimento. É **a que a NFC-e
  usa**: `montarEmitente` (`fiscal-snapshot.builder.ts:141`) faz
  `establishment.inscricaoEstadual ?? company.inscricaoEstadual`.
- `PATCH /companies/:id` aceita o campo `stateRegistration`, grava na matriz
  (`companies.service.ts:339-361`) e devolve **apenas a Company** — o valor
  escrito não volta na resposta.
- `GET /companies/:id` devolve a IE da matriz, mas aninhada em
  `establishments[].inscricaoEstadual` (`companies.service.ts:98-113`), com outro
  nome. No topo do recurso, `stateRegistration` **nunca é devolvido**.

O resultado prático: o usuário preenche a IE na seção "Sede" da tela de Empresa,
salva com sucesso, recarrega, e o campo aparece **vazio**. O dado está gravado —
só não tem como voltar pelo nome que foi enviado.

O problema real não é cosmético. A IE que a nota vai carregar é a do
estabelecimento, e a tela que o usuário usa para conferir não a mostra. Durante o
diagnóstico das rejeições de emitente em 09-10/08/2026, boa parte do tempo foi
gasta justamente descobrindo **qual dos dois cadastros** o snapshot tinha usado.
Um campo write-only num recurso REST é um defeito de contrato, e este está no
caminho crítico da emissão.

## What Changes

- **`stateRegistration` passa a ser devolvido** por `GET /companies/:id` e pela
  resposta do `PATCH /companies/:id`, derivado da IE da matriz. O contrato fica
  simétrico: o que o PATCH aceita, o GET devolve, com o mesmo nome.
- **Fonte da verdade declarada**: a IE do **estabelecimento** é a autoritativa
  (ver `design.md`). `Company.inscricaoEstadual` permanece como fallback para
  empresa sem matriz configurada.
- **Divergência silenciosa deixa de ser possível**: quando a requisição informar
  `inscricaoEstadual` (empresa) e `stateRegistration` (matriz) com valores
  diferentes, o sistema recusa em vez de gravar dois valores conflitantes que a
  emissão depois desempata sozinha.
- **Empresa sem matriz**: `stateRegistration` volta `null`, sem erro — é estado
  legítimo de empresa não onboardada.
- `API.md` passa a documentar as duas IEs, qual delas a NFC-e usa, e a precedência.

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova. -->

### Modified Capabilities
- `fiscal-configuration`: a configuração fiscal da empresa passa a expor a IE do
  emitente de forma legível e a impedir divergência entre a IE da empresa e a da
  matriz.

## Impact

- **Sem migration.** Nenhuma coluna é criada, removida ou renomeada; muda a forma
  de resposta e a validação.
- `src/companies/companies.service.ts`: `findOne` passa a derivar
  `stateRegistration` da matriz; `update` passa a devolvê-lo e a checar
  divergência.
- `src/companies/dto/update-company.dto.ts`: documentação do campo e da regra de
  conflito.
- **Mudança de contrato aditiva**: `stateRegistration` é campo novo na resposta.
  Nenhum consumidor existente quebra. O mapper Zod do frontend hoje mascara a
  ausência com `.nullable().default(null)` e continuará funcionando durante a
  transição.
- **Novo 400 possível** no PATCH quando as duas IEs forem informadas divergentes
  na mesma requisição — cenário que hoje grava em silêncio.
- Change irmã no frontend:
  `gestao_fiscal_frontend/openspec/changes/retornar-ie-estabelecimento`.
- **Fora de escopo**: unificar as duas colunas numa só. Ver `design.md`, seção de
  alternativas — exige migration, toca `montarEmitente` e muda o comportamento de
  filiais com IE própria. Não vale o risco agora.
