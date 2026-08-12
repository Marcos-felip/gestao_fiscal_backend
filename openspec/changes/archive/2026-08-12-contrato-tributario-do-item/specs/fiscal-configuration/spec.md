## MODIFIED Requirements

### Requirement: Dados fiscais dos produtos
O sistema SHALL manter os dados fiscais de cada produto (NCM, CEST, origem, CFOP,
CSOSN/CST, situação tributária de PIS e COFINS, alíquotas, unidade comercial,
GTIN) e SHALL expor um indicador `fiscalComplete`. A emissão SHALL ser bloqueada
quando algum item da venda estiver fiscalmente incompleto.

A situação tributária de PIS e de COFINS SHALL fazer parte da checagem de
completude — sem elas o item não tem como compor o quadro tributário.

#### Scenario: Produto sem NCM
- **WHEN** uma venda contém um item cujo produto está sem NCM
- **THEN** a emissão é recusada por item fiscalmente incompleto

#### Scenario: Produto sem situação tributária de PIS ou COFINS
- **WHEN** um produto não tem CST de PIS ou de COFINS cadastrado
- **THEN** o produto é marcado como fiscalmente incompleto e aparece no relatório de pendências, com texto indicando o que preencher

#### Scenario: Produtos existentes continuam emitindo
- **WHEN** a mudança é aplicada sobre uma base com produtos sem CST de PIS e COFINS
- **THEN** esses produtos recebem valores que reproduzem o comportamento anterior, e nenhuma emissão em curso é interrompida
