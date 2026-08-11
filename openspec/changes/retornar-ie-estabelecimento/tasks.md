## 1. Leitura da empresa

- [x] 1.1 `companies.service.ts:88` (`findOne`) — derivar `stateRegistration` da matriz (`establishments` já vem no `include`, com `inscricaoEstadual` no `select`; não é preciso query nova)
- [x] 1.2 Devolver `null` quando não houver matriz, sem erro
- [x] 1.3 Manter `establishments[].inscricaoEstadual` na resposta — a mudança é aditiva, nada é removido
- [x] 1.4 Conferir se `findAll` também precisa do campo → **não incluído**. `findAll` é o seletor de empresas do usuário e hoje só faz `include: { memberships }`; carregar estabelecimento de toda empresa para exibir uma IE que a lista não mostra é custo sem uso. Fica no `findOne`.

## 2. Escrita da empresa

- [x] 2.1 `companies.service.ts:339-365` — a resposta do `update` passa a incluir `stateRegistration` com o valor efetivamente gravado na matriz
- [x] 2.2 Recusar com `BadRequestException` quando `dto.inscricaoEstadual` e `dto.stateRegistration` vierem ambos preenchidos e diferentes, com mensagem em PT-BR
- [x] 2.3 Manter o comportamento atual quando só `stateRegistration` vier: grava na matriz dentro da transação existente
- [x] 2.4 Conferir o caminho de `company-establishment.dto.ts:88`, que também aceita `stateRegistration` por estabelecimento, para as duas rotas não divergirem

## 3. Contrato

- [x] 3.1 `update-company.dto.ts:47` — descrever no Swagger que `stateRegistration` é a IE da matriz e que ela tem precedência sobre `inscricaoEstadual` na emissão
- [x] 3.2 `API.md` — documentar as duas IEs, a precedência aplicada por `montarEmitente` e o novo 400 de divergência
- [x] 3.3 Registrar em `API.md` que `stateRegistration` agora é read-write, para o frontend poder remover o mascaramento do mapper

## 4. Testes

- [x] 4.1 `companies.service.spec.ts`: `findOne` devolve a IE da matriz em `stateRegistration`
- [x] 4.2 `findOne` devolve `null` para empresa sem matriz
- [x] 4.3 `update` devolve o valor gravado na resposta
- [x] 4.4 `update` recusa IE divergente com 400
- [x] 4.5 `update` só com `stateRegistration` continua gravando na matriz (não regredir)
- [x] 4.6 Teste cobrindo a precedência em `fiscal-snapshot.builder.spec.ts`: estabelecimento com IE ganha da empresa; sem IE, cai no fallback
- [x] 4.7 `npm test` verde (565 testes, 33 suítes) e `npm run build` limpo
- [ ] 4.8 `npm run test:e2e` continua falhando por defeito pré-existente (boilerplate `GET /` vs. prefixo `/api/v1`) — mesma pendência anotada na change `validar-formato-csc`

## 5. Handoff

- [x] 5.1 Avisar a change irmã do frontend (`retornar-ie-estabelecimento`) que o contrato está publicado
- [x] 5.2 Conferir que nenhum documento fiscal existente é afetado — o snapshot é congelado e esta change não o reconstrói (ver `design.md`)
