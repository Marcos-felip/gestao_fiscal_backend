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

A Inscrição Estadual do emitente SHALL ter o estabelecimento como fonte da
verdade; `Company.inscricaoEstadual` SHALL servir apenas como fallback quando o
estabelecimento não tiver IE própria, na mesma precedência que a emissão já aplica.

O campo `stateRegistration`, aceito na atualização da empresa, SHALL ser devolvido
nas leituras da empresa, derivado da IE da matriz. O sistema SHALL NOT expor campo
aceito na escrita que não possa ser lido de volta pelo mesmo nome.

#### Scenario: Empresa sem CRT ou IBGE
- **WHEN** uma emissão é solicitada e a empresa está sem CRT ou sem código IBGE
- **THEN** a emissão é recusada com erro de configuração incompleta e nenhum documento é criado

#### Scenario: Validação de CNPJ/IE
- **WHEN** os dados fiscais da empresa são gravados
- **THEN** CNPJ e formato de IE são validados localmente e valores inválidos são rejeitados

#### Scenario: Round-trip da IE da matriz
- **WHEN** o usuário grava a empresa informando `stateRegistration` e em seguida consulta a empresa
- **THEN** a consulta devolve `stateRegistration` com o valor gravado, sem exigir que o cliente leia a lista de estabelecimentos

#### Scenario: IE devolvida na resposta da própria atualização
- **WHEN** o usuário atualiza a empresa informando `stateRegistration`
- **THEN** a resposta da atualização já contém o valor gravado, permitindo confirmar a escrita sem uma segunda requisição

#### Scenario: Empresa sem matriz configurada
- **WHEN** a empresa ainda não tem estabelecimento matriz e é consultada
- **THEN** `stateRegistration` é devolvido como nulo, sem erro

#### Scenario: IE da empresa e IE da matriz divergentes na mesma requisição
- **WHEN** a atualização informa `inscricaoEstadual` e `stateRegistration` com valores diferentes
- **THEN** a requisição é recusada com erro em português explicando que a IE do emitente é a do estabelecimento, e nenhum dos dois valores é gravado

#### Scenario: Precedência preservada na emissão
- **WHEN** um documento fiscal é montado para um estabelecimento com IE própria
- **THEN** o emitente do snapshot carrega a IE do estabelecimento, e a IE da empresa é usada apenas quando a do estabelecimento estiver ausente

### Requirement: Configuração fiscal do estabelecimento emissor
O sistema SHALL manter, por estabelecimento, o ambiente (homologação/produção), a
série e a próxima numeração da NFC-e, o CSC e o idCSC, e o certificado A1
(armazenado criptografado). O certificado SHALL nunca ser persistido ou registrado
em texto claro.

O CSC (`codigoCsc`) SHALL ter de 16 a 64 caracteres alfanuméricos e o idCSC
(`idCsc`) SHALL ter de 1 a 6 dígitos. O sistema SHALL recusar valores fora desse
formato no cadastro e SHALL bloquear a emissão antes de consumir numeração quando
a configuração em uso estiver fora do formato.

O CSC SHALL nunca ser devolvido em log, mensagem de erro ou evento de auditoria.

#### Scenario: Gravar configuração do estabelecimento
- **WHEN** o usuário grava a configuração fiscal de um estabelecimento
- **THEN** o ambiente, a série, a próxima numeração, o CSC/idCSC são persistidos, e a resposta reflete os dados salvos

#### Scenario: CSC curto demais
- **WHEN** o usuário grava a configuração fiscal com um CSC de menos de 16 caracteres
- **THEN** a gravação é recusada com erro em português indicando o formato esperado e onde obter o CSC no portal da SEFAZ, e nada é persistido

#### Scenario: idCSC fora do formato
- **WHEN** o usuário grava a configuração fiscal com um idCSC não numérico ou com mais de 6 dígitos
- **THEN** a gravação é recusada com erro em português indicando que o idCSC é o token numérico de até 6 posições, e nada é persistido

#### Scenario: Emissão com CSC malformado já cadastrado
- **WHEN** uma emissão é solicitada e o estabelecimento tem um CSC fora do formato gravado antes desta validação
- **THEN** a emissão é bloqueada na etapa de preparação, o documento fica em ERRO com o motivo "CSC do estabelecimento está fora do formato esperado", e **nenhuma numeração de NFC-e é consumida**

#### Scenario: Pendência de configuração distingue ausente de malformado
- **WHEN** o relatório de pré-condições fiscais é consultado para um estabelecimento com CSC preenchido porém inválido
- **THEN** a pendência informa que o CSC está malformado, e não que está ausente

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

