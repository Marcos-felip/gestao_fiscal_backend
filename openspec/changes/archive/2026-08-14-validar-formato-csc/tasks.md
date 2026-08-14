## 1. Regra de formato

- [x] 1.1 Em `src/fiscal/emission/fiscal-rules.ts`, criar `isCscValido(csc?: string | null): boolean` — 16 a 64 caracteres alfanuméricos, aplicado sobre o valor já com `trim()`
- [x] 1.2 Em `fiscal-rules.ts`, criar `isIdCscValido(id?: string | null): boolean` — 1 a 6 dígitos
- [x] 1.3 Documentar no JSDoc por que o mínimo é 16 e não 32 (UFs emitem tamanhos diferentes; MG usa 32 hex)
- [x] 1.4 Testes unitários das duas funções em `fiscal-rules.spec.ts`, incluindo o caso real que causou a rejeição 464 (CSC de 6 dígitos)

## 2. Validação no cadastro

- [x] 2.1 `create-fiscal-settings.dto.ts`: `@Length(16, 64)` + `@Matches(/^[A-Za-z0-9]+$/)` em `codigoCsc`, com `message` em PT-BR
- [x] 2.2 `create-fiscal-settings.dto.ts`: `@Matches(/^\d{1,6}$/)` em `idCsc`, com `message` em PT-BR
- [x] 2.3 Mesmas regras em `update-fiscal-settings.dto.ts`
- [x] 2.4 Mensagens citando o portal da SEFAZ da UF (credenciamento NFC-e) como origem do valor
- [x] 2.5 Atualizar as descrições `@ApiPropertyOptional` (Swagger em PT-BR) com o formato esperado
- [x] 2.6 Confirmar que o CSC continua fora de log e fora do `FiscalSettingsEvent` de auditoria

## 3. Pré-condição de emissão

- [x] 3.1 `fiscal-preconditions.ts:24` — separar "CSC ausente" de "CSC malformado", com motivos distintos
- [x] 3.2 `fiscal-preconditions.ts:113` — o item do relatório de pendências reflete a mesma distinção
- [x] 3.3 `emit-request.builder.ts:45` — usar `isCscValido`/`isIdCscValido` em vez de só checar vazio, mantendo `BadRequestException` (o processador já trata como falha permanente, sem retry)
- [x] 3.4 Garantir que o bloqueio ocorre **antes** de consumir numeração e que o documento vai para ERRO com o motivo correto no `FiscalStatusHistory`

## 4. Testes

- [x] 4.1 `emit-request.builder.spec.ts`: CSC curto, CSC com símbolo, idCSC não numérico, idCSC com 7 dígitos
- [x] 4.2 `fiscal-preconditions.spec.ts`: pendência de "malformado" separada da de "ausente"
- [x] 4.3 ~~Teste e2e do `PATCH /fiscal/settings/:id`~~ → substituído por `fiscal-settings-csc.dto.spec.ts`, que roda `class-validator` diretamente (o mesmo que o `ValidationPipe` global faz) e confere a mensagem exata do 400. Um e2e de verdade exigiria harness de auth/tenant/permissão que não existe no repositório — fora do escopo desta change.
- [x] 4.4 `npm test` verde (538 testes, 32 suítes) e `npm run build` limpo
- [x] 4.5 **Resolvido em 14/08/2026:** o boilerplate testava um `AppController` que já não existe. Trocado por fumaça da aplicação — prefixo global, rotas fechadas sem token e 404 fora do prefixo. `npm run test:e2e` verde

## 5. Contrato e documentação

- [x] 5.1 Atualizar `API.md` com o formato de `codigoCsc` e `idCsc` e os erros 400 correspondentes
- [x] 5.2 Registrar em `FISCAL.md` a relação CSC → hash do QR Code → rejeição 464, para o próximo diagnóstico não recomeçar do zero
- [x] 5.3 Avisar a change irmã do frontend (`validar-formato-csc`) de que o contrato está publicado
