## 1. Pré-requisito

- [ ] 1.1 Confirmar que a change irmã do `fiscal_service` está no ar, com o fallback de contrato antigo ativo
- [ ] 1.2 Espelhar o contrato do item em `FISCAL.md`

## 2. Contrato e tipos

- [ ] 2.1 `fiscal-engine.interface.ts`: `NfceItem` ganha o bloco `imposto` com ICMS, IPI, PIS e COFINS
- [ ] 2.2 Tipos de situação tributária para as duas famílias (CST e CSOSN), sem a lista curta atual
- [ ] 2.3 PIS e COFINS nas duas formas: percentual e por quantidade
- [ ] 2.4 Totais da nota no contrato: `vBC`, `vICMS`, `vST`, `vPIS`, `vCOFINS`, `vProd`

## 3. Regras locais

- [ ] 3.1 `fiscal-rules.ts`: tabela declarando quais campos cada situação tributária exige
- [ ] 3.2 Validação do quadro por item, com mensagem em PT-BR nomeando o campo faltante
- [ ] 3.3 `isProductFiscalComplete` e `listarPendenciasFiscais` passam a considerar CST de PIS e COFINS
- [ ] 3.4 Manter o comentário de intenção do arquivo: a regra é espelho da do motor, para falhar cedo e em português

## 4. Snapshot

- [ ] 4.1 `FiscalSnapshot` para `versao: 2`
- [ ] 4.2 `montarItens` compõe o quadro tributário de cada item a partir do produto
- [ ] 4.3 Totais fiscais somados dos itens, com `somar` e a tolerância já existentes
- [ ] 4.4 `conferirSomatorios` estendido para os totais de imposto
- [ ] 4.5 `lerSnapshot` aceita versões 1 e 2; nenhum documento novo nasce em versão 1

## 5. Migration

- [ ] 5.1 Backfill de `cst_pis` e `cst_cofins` nos produtos com valor nulo, reproduzindo o comportamento atual (ver `design.md`)
- [ ] 5.2 Recalcular `fiscal_complete` dos produtos afetados na mesma migration
- [ ] 5.3 Comentário na migration explicando que o valor preserva comportamento e **não** é a classificação correta por produto
- [ ] 5.4 Conferir em banco que nenhum produto ficou fiscalmente incompleto por causa da migration

## 6. Testes

- [ ] 6.1 `fiscal-rules.spec.ts`: campos exigidos por situação tributária, e as mensagens
- [ ] 6.2 `fiscal-snapshot.builder.spec.ts`: item com CSOSN 102 gera quadro sem valores de ICMS e com PIS/COFINS do produto
- [ ] 6.3 Totais fiscais somando os itens; divergência bloqueia a emissão
- [ ] 6.4 `emit-request.builder.spec.ts`: snapshot versão 1 continua legível; versão 2 encaminha o bloco
- [ ] 6.5 **Regressão:** documento equivalente ao da nota 7 continua produzindo o mesmo payload de emissão
- [ ] 6.6 Produto sem CST de PIS/COFINS entra no relatório de pendências
- [ ] 6.7 `npm test` e `npm run build` verdes

## 7. Documentação e handoff

- [ ] 7.1 `API.md`: campos fiscais do produto e o que passou a ser exigido
- [ ] 7.2 `FISCAL.md`: contrato do item, versão do snapshot e a política de leitura da versão 1
- [ ] 7.3 Registrar em lugar visível a pendência para o contador: **revisar CST de PIS/COFINS por produto**, em especial bebidas (monofásicos)
- [ ] 7.4 Avisar a change irmã do frontend que o contrato está publicado
- [ ] 7.5 Sinalizar ao motor que o fallback de contrato antigo pode ser removido
