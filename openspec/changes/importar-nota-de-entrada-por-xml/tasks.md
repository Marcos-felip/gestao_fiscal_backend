> **Leia `design.md` antes.** As três decisões que mais economizam retrabalho:
> o XML é lido no NestJS (não no motor), a importação é entidade própria, e o
> casamento nunca usa descrição.

## 1. Banco

- [x] 1.1 `nfe_imports`: chave de acesso, storage key do XML, situação, emitente
  lido, estabelecimento e compra gerada. `@@unique([company_id, chave_acesso])`
- [x] 1.2 `nfe_import_items`: uma linha por `det` do XML, com o lido (cProd, cEAN,
  xProd, NCM, CFOP, uCom, qCom, vUnCom) e o casamento (produto, como casou)
- [x] 1.3 `partner_product_codes`: o de-para memorizado, `@@unique([partner_id, codigo])`
- [x] 1.4 `purchases.nfe_import_id`, para a compra saber de onde veio
- [x] 1.5 Permissão `purchases.import` com os **3 passos**: catálogo, template e
  **backfill em `company_role_permissions`** — sem o terceiro, 403 para todos menos OWNER

## 2. Parser

- [x] 2.1 Ler `infNFe`: emitente, destinatário, chave de acesso, itens, duplicatas
- [x] 2.2 Recusar o que não for NF-e modelo 55 autorizada, dizendo o que o arquivo é
- [x] 2.3 Tolerar namespace com e sem prefixo, e campos opcionais ausentes
- [x] 2.4 `SEM GTIN` e GTIN inválido não são chave de casamento
- [x] 2.5 Nunca confiar em soma do XML sem conferir: `Σ (qCom × vUnCom)` contra `vNF`

## 3. Casamento

- [x] 3.1 Emitente → fornecedor pelo CNPJ; criar quando não existir
- [x] 3.2 Destinatário → estabelecimento pelo CNPJ; recusar quando não casar
- [x] 3.3 Item → produto por GTIN, depois por `partner_product_codes`
- [x] 3.4 Divergência de unidade apontada, **sem conversão**
- [x] 3.5 Escolha do usuário grava o de-para para as próximas notas

## 4. Compra

- [x] 4.1 Confirmar importação cria a compra em **RASCUNHO** — estoque intocado
- [x] 4.2 Recusar confirmação com item pendente, nomeando quais
- [x] 4.3 Duplicatas → A_PRAZO com parcelas e vencimentos; sem elas, A_VISTA
- [x] 4.4 Chave repetida recusada com o número da compra que já existe

## 5. API

- [x] 5.1 `POST /purchases/import/nfe` — upload do XML, devolve a importação com o casamento
- [x] 5.2 `GET /purchases/import` e `GET /purchases/import/:id`
- [x] 5.3 `PATCH /purchases/import/:id/items/:itemId` — apontar o produto de um item
- [x] 5.4 `POST /purchases/import/:id/confirm` — gera a compra
- [x] 5.5 ~~Rota de download do XML~~ — **removida a pedido em 17/08/2026:** quem
  importa por upload já tem o arquivo. O XML continua guardado, para a busca na
  SEFAZ e para reprocessar
- [x] 5.6 Todos com `@RequirePermission('purchases.import')`, filtrando `{ companyId, deletedAt: null }`

## 6. Testes

- [ ] 6.1 XML real de fornecedor, ponta a ponta até a compra em rascunho — os
  testes usam XML sintético no formato 4.00; falta rodar com um arquivo de
  fornecedor de verdade
- [x] 6.2 Chave repetida recusada
- [x] 6.3 Nota de outro destinatário recusada
- [x] 6.4 Casamento por GTIN, por código memorizado, e item que sobra
- [x] 6.5 Mesmo `cProd` de fornecedores diferentes não se confunde
- [x] 6.6 Duplicatas viram parcelas; nota sem duplicata vira A_VISTA
- [x] 6.7 Confirmação **não** cria StockMovement nem FinancialEntry
- [x] 6.8 `npm test` verde

## 7. Documentação

- [x] 7.1 `API.md`: as rotas e o formato da importação
- [x] 7.2 `REGRAS_DE_NEGOCIO.md`: importação → rascunho → confirmação → estoque
- [x] 7.3 `BANCO_DE_DADOS.md`: as três tabelas novas
- [ ] 7.4 Avisar a change irmã do frontend

## 8. Fora do escopo

- [ ] 8.1 **Busca automática na SEFAZ** — change `buscar-notas-de-entrada-na-sefaz`
- [ ] 8.2 **Fator de conversão de unidade por fornecedor** — candidato à próxima
- [ ] 8.3 **Vencimentos irregulares** — `Purchase` guarda intervalo, não lista de datas
