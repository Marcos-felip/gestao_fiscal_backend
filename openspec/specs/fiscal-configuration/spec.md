# Fiscal Configuration

## Purpose

Manter os dados fiscais necessários para emitir NFC-e: configuração da empresa
emitente, configuração fiscal por estabelecimento (ambiente, numeração, CSC e
referência do certificado A1), dados fiscais dos produtos e o mapeamento das
formas de pagamento para os códigos fiscais.
## Requirements
### Requirement: Configuração fiscal da empresa
O sistema SHALL manter os dados fiscais da empresa (CNPJ, IE, IM, CRT, contribuinte
de ICMS, endereço fiscal com código IBGE, telefone/e-mail fiscal) e SHALL expor um
indicador `fiscalConfigComplete`. A emissão SHALL ser bloqueada enquanto a
configuração da empresa estiver incompleta.

#### Scenario: Empresa sem CRT ou IBGE
- **WHEN** uma emissão é solicitada e a empresa está sem CRT ou sem código IBGE
- **THEN** a emissão é recusada com erro de configuração incompleta e nenhum documento é criado

### Requirement: Configuração fiscal do estabelecimento emissor
O sistema SHALL manter, por estabelecimento, o ambiente (homologação/produção), a
série e a próxima numeração da NFC-e, o CSC e o idCSC, e o certificado A1
(armazenado criptografado). O certificado SHALL nunca ser persistido ou registrado
em texto claro.

#### Scenario: Gravar configuração do estabelecimento
- **WHEN** o usuário grava a configuração fiscal de um estabelecimento
- **THEN** o ambiente, a série, a próxima numeração, o CSC/idCSC são persistidos, e a resposta reflete os dados salvos

#### Scenario: Upload de certificado A1
- **WHEN** o usuário envia um certificado A1 válido com a senha
- **THEN** o certificado é armazenado criptografado, e a validade e o titular são extraídos e exibidos

#### Scenario: Certificado vencido
- **WHEN** uma emissão é solicitada com o certificado do estabelecimento vencido
- **THEN** a emissão é bloqueada e o usuário é avisado do vencimento

#### Scenario: Teste de comunicação com a SEFAZ
- **WHEN** o usuário aciona o teste de comunicação
- **THEN** o sistema consulta o status do serviço da SEFAZ via motor fiscal e retorna disponível/indisponível

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

### Requirement: Mapeamento fiscal das formas de pagamento
O sistema SHALL mapear cada forma de pagamento da venda para o código fiscal
correspondente e SHALL suportar pagamento dividido a partir dos pagamentos da venda.

#### Scenario: Pagamento dividido
- **WHEN** uma venda é paga parte em PIX e parte em dinheiro
- **THEN** cada forma recebe o código fiscal correto no documento emitido

