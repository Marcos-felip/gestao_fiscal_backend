> **Leia `design.md` antes.** As três decisões que mais economizam retrabalho:
> o XML é lido no NestJS (não no motor), a importação é entidade própria, e o
> casamento nunca usa descrição.

## 1. Banco

- [ ] 1.1 `nfe_imports`: chave de acesso, storage key do XML, situação, emitente
  lido, estabelecimento e compra gerada. `@@unique([company_id, chave_acesso])`
- [ ] 1.2 `nfe_import_items`: uma linha por `det` do XML, com o lido (cProd, cEAN,
  xProd, NCM, CFOP, uCom, qCom, vUnCom) e o casamento (produto, como casou)
- [ ] 1.3 `partner_product_codes`: o de-para memorizado, `@@unique([partner_id, codigo])`
- [ ] 1.4 `purchases.nfe_import_id`, para a compra saber de onde veio
- [ ] 1.5 Permissão `purchases.import` com os **3 passos**: catálogo, template e
  **backfill em `company_role_permissions`** — sem o terceiro, 403 para todos menos OWNER

## 2. Parser

- [ ] 2.1 Ler `infNFe`: emitente, destinatário, chave de acesso, itens, duplicatas
- [ ] 2.2 Recusar o que não for NF-e modelo 55 autorizada, dizendo o que o arquivo é
- [ ] 2.3 Tolerar namespace com e sem prefixo, e campos opcionais ausentes
- [ ] 2.4 `SEM GTIN` e GTIN inválido não são chave de casamento
- [ ] 2.5 Nunca confiar em soma do XML sem conferir: `Σ (qCom × vUnCom)` contra `vNF`

## 3. Casamento

- [ ] 3.1 Emitente → fornecedor pelo CNPJ; criar quando não existir
- [ ] 3.2 Destinatário → estabelecimento pelo CNPJ; recusar quando não casar
- [ ] 3.3 Item → produto por GTIN, depois por `partner_product_codes`
- [ ] 3.4 Divergência de unidade apontada, **sem conversão**
- [ ] 3.5 Escolha do usuário grava o de-para para as próximas notas

## 4. Compra

- [ ] 4.1 Confirmar importação cria a compra em **RASCUNHO** — estoque intocado
- [ ] 4.2 Recusar confirmação com item pendente, nomeando quais
- [ ] 4.3 Duplicatas → A_PRAZO com parcelas e vencimentos; sem elas, A_VISTA
- [ ] 4.4 Chave repetida recusada com o número da compra que já existe

## 5. API

- [ ] 5.1 `POST /purchases/import/nfe` — upload do XML, devolve a importação com o casamento
- [ ] 5.2 `GET /purchases/import` e `GET /purchases/import/:id`
- [ ] 5.3 `PATCH /purchases/import/:id/itens/:itemId` — apontar o produto de um item
- [ ] 5.4 `POST /purchases/import/:id/confirmar` — gera a compra
- [ ] 5.5 `GET /purchases/import/:id/xml` — o arquivo como veio
- [ ] 5.6 Todos com `@RequirePermission('purchases.import')`, filtrando `{ companyId, deletedAt: null }`

## 6. Testes

- [ ] 6.1 XML real de fornecedor, ponta a ponta até a compra em rascunho
- [ ] 6.2 Chave repetida recusada
- [ ] 6.3 Nota de outro destinatário recusada
- [ ] 6.4 Casamento por GTIN, por código memorizado, e item que sobra
- [ ] 6.5 Mesmo `cProd` de fornecedores diferentes não se confunde
- [ ] 6.6 Duplicatas viram parcelas; nota sem duplicata vira A_VISTA
- [ ] 6.7 Confirmação **não** cria StockMovement nem FinancialEntry
- [ ] 6.8 `npm test` verde

## 7. Documentação

- [ ] 7.1 `API.md`: as rotas e o formato da importação
- [ ] 7.2 `REGRAS_DE_NEGOCIO.md`: importação → rascunho → confirmação → estoque
- [ ] 7.3 `BANCO_DE_DADOS.md`: as três tabelas novas
- [ ] 7.4 Avisar a change irmã do frontend

## 8. Fora do escopo

- [ ] 8.1 **Busca automática na SEFAZ** — change `buscar-notas-de-entrada-na-sefaz`
- [ ] 8.2 **Fator de conversão de unidade por fornecedor** — candidato à próxima
- [ ] 8.3 **Vencimentos irregulares** — `Purchase` guarda intervalo, não lista de datas
