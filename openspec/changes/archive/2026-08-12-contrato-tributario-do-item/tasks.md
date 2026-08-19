## 1. Pré-requisito

- [x] 1.1 Confirmar que a change irmã do `fiscal_service` está no ar, com o fallback de contrato antigo ativo
  - **Confirmada no ar, mas SEM o fallback.** O motor implementou o fallback (tasks 4.1/4.2) e o removeu na mesma change (4.3), com a justificativa de que "o backend passou a publicar o bloco na mesma janela" — o que não era verdade: o backend estava em 0/31. Resultado: entre `b43c1d4` no motor e esta change, **nenhuma NFC-e emitia** — todo item voltava `Itens[0].Imposto: Quadro tributario do item ('imposto') e obrigatorio`. Como não há nada em produção, o custo foi zero; a janela de incompatibilidade fechou aqui.
- [x] 1.2 Espelhar o contrato do item em `FISCAL.md`

## 2. Contrato e tipos

- [x] 2.1 `fiscal-engine.interface.ts`: `NfceItem` ganha o bloco `imposto` com ICMS, IPI, PIS e COFINS
  - `origem` e `csosn` **saíram** do item: o motor os removeu do contrato.
- [x] 2.2 Tipos de situação tributária para as duas famílias (CST e CSOSN), sem a lista curta atual
  - `CSOSN_SUPORTADOS` foi de 5 para 10 códigos; `CST_ICMS_SUPORTADOS` de 3 para 11.
- [x] 2.3 PIS e COFINS nas duas formas: percentual e por quantidade
- [x] 2.4 Totais da nota no contrato: `vBC`, `vICMS`, `vST`, `vPIS`, `vCOFINS`, `vProd`
  - **No snapshot, não no payload do motor.** `EmitirNfceRequest` do motor só tem `ValorTotal`; ele compõe o grupo `<total>` do XML a partir dos itens. Mandar campo que o contrato não declara seria ruído. Ficam gravados para auditoria, para a conferência local e para a NF-e da etapa 3.

## 3. Regras locais

- [x] 3.1 `fiscal-rules.ts`: tabela declarando quais campos cada situação tributária exige
  - `CAMPOS_POR_CSOSN`, `CAMPOS_POR_CST_ICMS` e `formaDaContribuicao`, espelhando `SituacaoIcms` do motor.
- [x] 3.2 Validação do quadro por item, com mensagem em PT-BR nomeando o campo faltante
- [x] 3.3 `isProductFiscalComplete` e `listarPendenciasFiscais` passam a considerar CST de PIS e COFINS
  - Inclui a alíquota quando o CST é tributado por percentual.
- [x] 3.4 Manter o comentário de intenção do arquivo: a regra é espelho da do motor, para falhar cedo e em português

## 4. Snapshot

- [x] 4.1 `FiscalSnapshot` para `versao: 2`
- [x] 4.2 `montarItens` compõe o quadro tributário de cada item a partir do produto
  - Compõe o que é aritmética sobre o cadastro; recusa nomeando o campo quando a situação exige ST, MVA, redução de base ou crédito do Simples — isso é etapa 2, e inventar valor aqui gravaria palpite em snapshot congelado.
- [x] 4.3 Totais fiscais somados dos itens, com `somar` e a tolerância já existentes
- [x] 4.4 `conferirSomatorios` estendido para os totais de imposto
- [x] 4.5 `lerSnapshot` aceita versões 1 e 2; nenhum documento novo nasce em versão 1
  - **Desvio do `design.md`, decidido com o usuário.** O design previa que a versão 1 continuasse emitindo "através do fallback do motor" — que não existe mais. Versão 1 passou a ser **legível mas não emitível**: consulta e tela de detalhe funcionam, retry devolve `400` mandando emitir documento novo. Recompor o quadro no reprocessamento faria o snapshot deixar de retratar a venda. Havia 6 documentos v1 reprocessáveis, todos de teste.

## 5. Migration — **descartada**

A change previa um backfill gravando `07` em `cst_pis` e `cst_cofins`. Ele chegou
a ser escrito e aplicado, e foi **removido**.

O motivo do backfill era continuidade: sem ele, no dia do deploy nenhum produto
estaria fiscalmente completo e nenhuma nota sairia. **Esse risco não existe** — a
plataforma não lançou, não há instalação em produção, e os 41 produtos do banco
são dados de teste. Numa instalação nova não há produto para backfillar, então a
migration seria um no-op em todo lugar menos neste banco de desenvolvimento.

O que ela custaria: plantar `07` — "operação isenta da contribuição" — como
classificação de todo produto, inclusive bebida monofásica, e deixar essa dívida
escondida atrás de um valor plausível que ninguém revisita.

Sem ela, produto sem CST de PIS/COFINS fica **fiscalmente incompleto e não
emite** — que é o comportamento certo: o código tem que ser uma decisão do
contador, não um preenchimento automático.

- [x] 5.1 ~~Backfill de `cst_pis` e `cst_cofins`~~ — descartado
- [x] 5.2 ~~Recalcular `fiscal_complete` na mesma migration~~ — descartado
- [x] 5.3 ~~Comentário na migration~~ — descartado
- [x] 5.4 ~~Conferir em banco~~ — descartado
  - O banco de desenvolvimento ficou com `07` nos 41 produtos, gravado enquanto a migration existiu. É dado de teste e pode ser trocado à vontade; nenhuma migration o recria.

## 6. Testes

- [x] 6.1 `fiscal-rules.spec.ts`: campos exigidos por situação tributária, e as mensagens
- [x] 6.2 `fiscal-snapshot.builder.spec.ts`: item com CSOSN 102 gera quadro sem valores de ICMS e com PIS/COFINS do produto
- [x] 6.3 Totais fiscais somando os itens; divergência bloqueia a emissão
- [x] 6.4 `emit-request.builder.spec.ts`: snapshot versão 1 continua legível; versão 2 encaminha o bloco
  - Ajustado ao desvio da 4.5: versão 1 é lida e **recusada na emissão**, com a mensagem própria.
- [x] 6.5 **Regressão:** documento equivalente ao da nota 7 continua produzindo o mesmo payload de emissão
  - O item de CSOSN 102 com CST 07 gera quadro sem valores — igual ao que o motor montava com a regra fixa.
- [x] 6.6 Produto sem CST de PIS/COFINS entra no relatório de pendências
- [x] 6.7 `npm test` e `npm run build` verdes — 651 testes, 34 suítes

## 7. Documentação e handoff

- [x] 7.1 `API.md`: campos fiscais do produto e o que passou a ser exigido
- [x] 7.2 `FISCAL.md`: contrato do item, versão do snapshot e a política de leitura da versão 1
- [x] 7.3 Registrar em lugar visível a pendência para o contador: **revisar CST de PIS/COFINS por produto**, em especial bebidas (monofásicos)
- [x] 7.4 Avisar a change irmã do frontend que o contrato está publicado
  - Mais que avisar: a change irmã foi aplicada na sequência. `cstPis`/`cstCofins` viraram `Select` obrigatório no formulário de produto.
- [x] 7.5 Sinalizar ao motor que o fallback de contrato antigo pode ser removido
  - Sem efeito: o motor já o removeu antes desta change existir (ver 1.1).

## 8. Achados desta implementação

- [x] 8.1 **Bug corrigido:** `products.service.update` calculava `fiscalComplete` sem `cstPis`, `cstCofins` nem as alíquotas. Passava despercebido porque nenhum deles entrava na regra; com a regra nova, todo produto atualizado viraria incompleto.
- [x] 8.2 **Validado em 13/08/2026:** NFC-e de homologação autorizada com o contrato novo — chave `31260851720322000146650010000000011185782928`, protocolo `131260000762680`. O XML autorizado traz `ICMSSN102`, `PISNT` e `COFINSNT` por item, montados a partir do quadro tributário do produto. A primeira tentativa foi rejeitada porque o motor rodava em contêiner Docker com a imagem anterior ao contrato: `dotnet build` no host não atualiza o motor — é `docker compose build fiscal-service && docker compose up -d`.
