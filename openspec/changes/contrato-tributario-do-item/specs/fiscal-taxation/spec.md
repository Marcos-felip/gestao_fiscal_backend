## ADDED Requirements

### Requirement: Quadro tributário por item do documento fiscal
O snapshot do documento fiscal SHALL registrar, por item, a situação tributária,
a base de cálculo, a alíquota e os valores de ICMS, IPI, PIS e COFINS, e SHALL
encaminhá-los ao motor fiscal.

O quadro SHALL ser composto na criação do documento, a partir do cadastro, e
SHALL ficar congelado no snapshot como o restante dos dados da nota.

#### Scenario: Item com situação sem valores
- **WHEN** um item de produto com CSOSN 102 é incluído numa venda
- **THEN** o snapshot registra a situação tributária do ICMS sem valores, e as situações de PIS e COFINS vindas do cadastro do produto

#### Scenario: Situação tributária de PIS e COFINS vem do produto
- **WHEN** um produto tem CST de PIS e de COFINS cadastrados
- **THEN** esses códigos entram no snapshot e são enviados ao motor, em vez de um valor fixo

#### Scenario: Documento antigo permanece legível
- **WHEN** um documento gravado antes desta mudança é consultado ou reprocessado
- **THEN** o sistema lê o snapshot na versão anterior sem erro, e a emissão continua possível

#### Scenario: Documento novo nasce na versão atual
- **WHEN** um documento fiscal é criado após esta mudança
- **THEN** o snapshot é gravado na versão 2, com o quadro tributário presente

### Requirement: Totais fiscais compostos a partir dos itens
O snapshot SHALL registrar os totais de base de cálculo e de imposto da nota,
calculados como soma dos itens, e SHALL recusar a emissão quando os totais não
fecharem com os itens dentro da tolerância de centavos.

#### Scenario: Totais somados
- **WHEN** um documento com três itens é criado
- **THEN** os totais de base e de imposto no snapshot equivalem à soma dos valores dos itens

#### Scenario: Divergência entre itens e totais
- **WHEN** os totais informados divergem da soma dos itens além da tolerância
- **THEN** a emissão é bloqueada com mensagem em português apontando a divergência, antes de consumir numeração

### Requirement: Validação local do quadro tributário
O sistema SHALL conferir, antes de enviar ao motor, se o quadro tributário de
cada item tem os campos que a situação tributária declarada exige, recusando a
emissão com mensagem em português quando faltar.

#### Scenario: Situação que exige valores chega sem eles
- **WHEN** um item declara situação tributária que exige base e alíquota, mas não as tem
- **THEN** a emissão é recusada localmente, com mensagem indicando o campo faltante, sem chamar o motor e sem consumir numeração

#### Scenario: Mensagem em português antes da SEFAZ
- **WHEN** o quadro tributário está incompleto
- **THEN** o usuário recebe erro de configuração em português, e não uma rejeição da SEFAZ depois de a nota ter consumido número

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
