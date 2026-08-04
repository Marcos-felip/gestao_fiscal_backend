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
série e a próxima numeração da NFC-e, o CSC e o idCSC, e as referências do
certificado A1 (validade e titular). O certificado SHALL nunca ser persistido ou
registrado em texto claro.

#### Scenario: Gravar configuração do estabelecimento
- **WHEN** o usuário grava a configuração fiscal de um estabelecimento
- **THEN** o ambiente, a série, a próxima numeração, o CSC/idCSC e as referências do certificado são persistidos, e a resposta reflete os dados salvos

#### Scenario: Certificado nunca em texto claro
- **WHEN** o certificado A1 é armazenado
- **THEN** apenas referências criptografadas e os metadados (validade, titular) são guardados, nunca o pfx/senha em texto claro

### Requirement: Dados fiscais dos produtos
O sistema SHALL manter os dados fiscais de cada produto (NCM, CEST, origem, CFOP,
CSOSN/CST, alíquotas, unidade comercial, GTIN) e SHALL expor um indicador
`fiscalComplete`. A emissão SHALL ser bloqueada quando algum item da venda estiver
fiscalmente incompleto.

#### Scenario: Produto sem NCM
- **WHEN** uma venda contém um item cujo produto está sem NCM
- **THEN** a emissão é recusada por item fiscalmente incompleto

### Requirement: Mapeamento fiscal das formas de pagamento
O sistema SHALL mapear cada forma de pagamento da venda para o código fiscal
correspondente e SHALL suportar pagamento dividido a partir dos pagamentos da venda.

#### Scenario: Pagamento dividido
- **WHEN** uma venda é paga parte em PIX e parte em dinheiro
- **THEN** cada forma recebe o código fiscal correto no documento emitido
