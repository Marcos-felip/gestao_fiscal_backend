## ADDED Requirements

### Requirement: Configuração fiscal da empresa
O sistema SHALL manter os dados fiscais da empresa (CNPJ, IE, IM, CRT, contribuinte
de ICMS, endereço fiscal com código IBGE, telefone/e-mail fiscal) e SHALL expor um
indicador `fiscalConfigComplete`. A emissão SHALL ser bloqueada enquanto a
configuração da empresa estiver incompleta.

#### Scenario: Empresa sem CRT ou IBGE
- **WHEN** uma emissão é solicitada e a empresa está sem CRT ou sem código IBGE
- **THEN** a emissão é recusada com erro de configuração incompleta e nenhum documento é criado

#### Scenario: Validação de CNPJ/IE
- **WHEN** os dados fiscais da empresa são gravados
- **THEN** CNPJ e formato de IE são validados localmente e valores inválidos são rejeitados

### Requirement: Configuração fiscal do estabelecimento emissor
O sistema SHALL manter, por estabelecimento, o ambiente (homologação/produção), a
série e a próxima numeração da NFC-e, o CSC e o idCSC, e o certificado A1
(armazenado criptografado). O certificado SHALL nunca ser persistido ou registrado
em texto claro.

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
CSOSN/CST, alíquotas, unidade comercial, GTIN) e SHALL expor um indicador
`fiscalComplete`. A emissão SHALL ser bloqueada quando algum item da venda estiver
fiscalmente incompleto.

#### Scenario: Produto sem NCM
- **WHEN** uma venda contém um item cujo produto está sem NCM
- **THEN** a emissão é recusada e o produto aparece no relatório de pendências fiscais

### Requirement: Mapeamento fiscal das formas de pagamento
O sistema SHALL mapear cada forma de pagamento da venda para o código fiscal `tPag`
correspondente, SHALL suportar pagamento dividido e SHALL calcular o troco.

#### Scenario: Pagamento dividido com troco em dinheiro
- **WHEN** uma venda é paga parte em PIX e parte em dinheiro com valor recebido acima do total
- **THEN** cada forma recebe o tPag correto e o troco é calculado a partir do valor recebido
