> **Recorte: NF-e apenas dentro do estado** (12/08/2026). Ver o cabeçalho do
> `proposal.md`. Toda tarefa sobre CFOP 6xxx, DIFAL, partilha ou ST
> interestadual está **fora** — e a dependência da etapa 2 caiu junto.
>
> **Podada em 12/08/2026** contra o que as etapas 0 e 1 produziram e contra os
> dois recortes: operação interna e destinatário pessoa jurídica.

## 1. Pré-requisitos

- [x] 1.1 Etapa 1 aplicada (`contrato-tributario-do-item`). **A etapa 2 saiu do caminho** — adiada, e o recorte interno removeu a dependência
- [x] 1.2 Change irmã do `fiscal_service` no ar, com `POST /api/nfe/emit` publicado — feita em 13/08/2026, contrato em `fiscal_service/docs/CONTRATO_NFE.md`
- [x] 1.3 Revisar esta proposta contra o que as etapas anteriores produziram — feito nesta poda

## 1b. Destinatário e escolha do modelo

- [x] 1b.1 `indIEDest` com os três valores: `1` contribuinte, `2` isento de IE, `9` não contribuinte
- [x] 1b.2 Validação do destinatário por indicador — contribuinte exige IE; isento e não contribuinte, não. CNPJ é sempre obrigatório
- [x] 1b.3 ~~Critério de escolha entre NFC-e e NF-e para pessoa física~~ — **resolvido pelo recorte:** PF emite NFC-e, PJ emite NF-e. Não há sobreposição a arbitrar
- [x] 1b.4 Recusar NF-e sem destinatário identificado ou com destinatário pessoa física, com mensagem dizendo o que falta

## 1c. Estoque por estabelecimento

> **Limitação anterior a esta change, que ela expõe.** `stock_movements` não tem
> `establishment_id` e `products.current_stock` é um saldo só por empresa. A NF-e
> é emitida por estabelecimento, com CNPJ e endereço próprios — declarar saída de
> um local cujo estoque não é rastreado separadamente é incoerência que aparece na
> primeira conferência. Detalhes em `BANCO_DE_DADOS.md`.

- [x] 1c.1 **Decidido em 13/08/2026: a NF-e sai com estoque por empresa.** Cada empresa da base tem exatamente uma MATRIZ e nenhuma filial — com um único estabelecimento a limitação não é observável. Ela passa a existir na primeira filial, e é isso que reabre 1c.2 a 1c.5
- [ ] 1c.2 `establishment_id` em `stock_movements`, com índice
- [ ] 1c.3 `current_stock` deixa de ser campo do produto e vira saldo por estabelecimento
- [ ] 1c.4 Migration rateando o saldo atual — **exige alguém dizer onde a mercadoria está**; não há como inferir
- [ ] 1c.5 Baixa de venda e entrada de compra passam a carimbar o estabelecimento

## 2. Migrations

- [x] 2.1 `serie_nfe` e `proximo_numero_nfe` em `fiscal_settings`
- [x] 2.2 `ind_ie_dest` em `partners`
- [x] 2.2b **Achado ao implementar:** `partners` não tinha código IBGE do município, e a NF-e exige `cMun` no destinatário — a NFC-e nunca levou endereço de destinatário. Adicionado `ibge_code`
- [x] 2.3 Permissões `fiscal.nfe.emit` e `fiscal.nfe.cancel` com os **três passos**: catálogo, template e backfill em `company_role_permissions`

## 3. Cadastro

- [x] 3.1 Indicador de IE no DTO e no service de parceiros, com validação
- [x] 3.2 Regra de completude do destinatário para NF-e: endereço completo, documento e indicador de IE
- [x] 3.3 Mensagem de pendência nomeando cada campo faltante

## 4. Configuração fiscal

- [x] 4.1 Série e numeração de NF-e no DTO e no service, com os mesmos limites da NFC-e
- [x] 4.2 Reserva atômica de numeração por modelo
- [ ] 4.3 Checklist de produção estendido para o modelo 55 — **não feito.** O checklist atual confere certificado, CSC e consulta pública, todos da NFC-e. O que a NF-e acrescenta é série própria e nada mais; fica para quando a liberação de produção da NF-e for exercitada de verdade

## 5. Emissão

- [x] 5.1 Builder de snapshot da NF-e, separado do da NFC-e — o quadro tributário por item já vem pronto da etapa 1 e **não** é remontado aqui
- [x] 5.2 Destinatário completo, natureza da operação, `tpNF` e `finNFe`
- [x] 5.3 Transporte, volumes e cobrança quando informados
- [x] 5.4 ~~`isCfopValido` passa a considerar o modelo e as UFs~~ — **fora do recorte.** Operação interna usa `5xxx`, que a validação atual já aceita. Volta se houver venda interestadual
- [x] 5.5 Porta do motor estendida com as operações do modelo 55
- [x] 5.6 Processador de fila reaproveitado, com o modelo carimbado no documento
- [x] 5.7 **Achado ao implementar:** o DANFE da NF-e é HTML e o da NFC-e é PDF. `danfeFormato()` escolhe extensão e MIME a partir do `danfeContentType` — gravar HTML como `.pdf` entregaria um arquivo que nenhum leitor abre

## 6. Testes

- [x] 6.1 Emissão com destinatário completo cria documento e reserva numeração
- [x] 6.2 Destinatário incompleto recusado **sem consumir numeração** — a recusa acontece em `buildNfeSnapshot`, antes do `increment`
- [x] 6.3 Numerações de NF-e e NFC-e independentes
- [x] 6.4 ~~CFOP interestadual aceito em NF-e e recusado em NFC-e~~ — fora do recorte
- [x] 6.5 ~~CFOP incoerente com as UFs recusado~~ — fora do recorte
- [x] 6.6 Permissões separadas respeitadas
- [x] 6.6b NF-e para destinatário pessoa física recusada, nomeando o motivo
- [x] 6.6c `indIEDest` isento e não contribuinte aceitos sem IE; contribuinte sem IE recusado
- [x] 6.7 **Regressão:** emissão de NFC-e inalterada — 674 testes verdes, os 653 anteriores intactos
- [x] 6.8 `npm test` verde

## 7. Documentação

- [x] 7.1 `API.md`: rotas, permissões e o que difere da NFC-e
- [x] 7.2 `FISCAL.md`: fluxo do modelo 55
- [x] 7.3 `BANCO_DE_DADOS.md`: campos novos
- [ ] 7.4 Avisar a change irmã do frontend

## 8. Achados desta implementação

- [x] 8.1 **Validado em 13/08/2026:** NF-e de homologação autorizada — chave `31260851720322000146550010000000031458732971`, protocolo `131260152620587`. O XML saiu com `mod` 55, `tpImp` 1 (retrato), `idDest` 1, `dest` completo com `indIEDest` 9, sem `infNFeSupl` e com o quadro tributário do item intacto

## 9. Achados da emissão real

> Nenhum destes apareceu em teste unitário. Todos exigiram subir os três
> serviços e emitir de verdade.

- [x] 9.1 **Defeito de fundo:** confirmar a venda sempre criava NFC-e, e `fiscal_documents.sale_id` é único — a NF-e daquela venda ficava impossível de emitir. O endpoint existia e era inalcançável pelo fluxo normal. O listener passou a **não** emitir NFC-e quando o cliente é pessoa jurídica, deixando a venda em `NAO_EMITIDO`
- [x] 9.2 **Defeito de boot:** `EmitNfeDto` referenciava classes aninhadas declaradas depois dela. Compila sem erro e derruba o processo com `Cannot access 'NfeTransporteDto' before initialization` — `emitDecoratorMetadata` resolve `design:type` na definição da classe. Ordem invertida no arquivo, com o porquê comentado
- [x] 9.3 **DANFE servido com o tipo errado:** o download declarava `application/pdf` e devolvia HTML. `getDanfe` passou a derivar tipo e extensão da chave do storage
- [x] 9.4 **Rejeição 234 com IE inventada:** a SEFAZ confere a inscrição estadual contra o CNPJ **mesmo em homologação**. Destinatário contribuinte exige um par CNPJ/IE que exista de verdade; a validação foi feita com destinatário não contribuinte, que é caso legítimo (colégio não recolhe ICMS)
- [ ] 9.5 **Rejeição 391 com PIX:** a NFC-e automática de uma venda paga em PIX foi recusada com "Não informados os dados do cartão de crédito/débito nas Formas de Pagamento". O motor mapeia PIX para `tPag` 17, que exige o grupo `card` com `tpIntegra`. **Vale para NFC-e e NF-e** e não é da etapa 3 — merece correção própria
- [ ] 9.6 **Numeração queimada em falha de criação:** a reserva incrementa antes do `create`, então um erro ali consome o número. Aconteceu na tentativa que bateu no 409. É o comportamento seguro (nunca reusar), mas merece um evento de auditoria dizendo que o número foi perdido
