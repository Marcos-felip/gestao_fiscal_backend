## ADDED Requirements

### Requirement: Emissão de NF-e modelo 55
O sistema SHALL emitir NF-e modelo 55 a partir de uma operação comercial,
exigindo destinatário identificado e completo, natureza da operação, tipo de
operação e finalidade da nota.

A emissão SHALL exigir a permissão `fiscal.nfe.emit`.

#### Scenario: Emissão com destinatário completo
- **WHEN** uma NF-e é solicitada para um parceiro com CNPJ, endereço completo e indicador de IE
- **THEN** o documento é criado, a numeração de NF-e é reservada e a emissão é enfileirada

#### Scenario: Destinatário incompleto
- **WHEN** o parceiro escolhido não tem endereço completo ou indicador de IE
- **THEN** a emissão é recusada com mensagem em português nomeando os campos faltantes, e **nenhuma numeração é consumida**

#### Scenario: Sem destinatário
- **WHEN** uma NF-e é solicitada sem parceiro
- **THEN** a emissão é recusada — diferente da NFC-e, o destinatário é obrigatório

### Requirement: Série e numeração próprias do modelo 55
A configuração fiscal SHALL manter série e próxima numeração de NF-e
independentes das de NFC-e, e a reserva SHALL ser atômica na criação do
documento.

#### Scenario: Numerações independentes
- **WHEN** uma NF-e e uma NFC-e são emitidas pelo mesmo estabelecimento
- **THEN** cada uma consome a sua própria sequência, sem interferir na outra

#### Scenario: Emissões simultâneas
- **WHEN** duas NF-e são criadas ao mesmo tempo no mesmo estabelecimento
- **THEN** cada uma recebe um número distinto, sem duplicidade

### Requirement: CFOP conforme o modelo e as UFs
A validação de CFOP SHALL depender do modelo do documento: operações internas
para NFC-e; internas e interestaduais para NF-e, coerentes com as UFs do
emitente e do destinatário.

#### Scenario: NF-e interestadual
- **WHEN** uma NF-e é emitida para destinatário em outra UF, com CFOP interestadual
- **THEN** a emissão prossegue

#### Scenario: CFOP incoerente com o destino
- **WHEN** o CFOP indica operação interna mas o destinatário está em outra UF
- **THEN** a emissão é recusada apontando a incoerência

#### Scenario: NFC-e não aceita interestadual
- **WHEN** uma NFC-e é emitida com CFOP interestadual
- **THEN** a emissão é recusada, como já acontece hoje

### Requirement: Grupos exclusivos do modelo 55 no snapshot
O snapshot da NF-e SHALL registrar destinatário completo, natureza da operação,
tipo de operação, finalidade, transporte, volumes e cobrança quando informados.

#### Scenario: Nota com transporte e cobrança
- **WHEN** uma NF-e é emitida com transportadora e parcelamento
- **THEN** o snapshot registra os dois grupos e eles são enviados ao motor

#### Scenario: Nota sem transporte
- **WHEN** uma NF-e é emitida sem dados de transporte
- **THEN** o documento é emitido normalmente, sem o grupo

### Requirement: Indicador de IE do destinatário
O cadastro de parceiro SHALL manter o indicador de inscrição estadual
(contribuinte, isento ou não contribuinte), exigido na NF-e.

#### Scenario: Parceiro contribuinte
- **WHEN** um parceiro é cadastrado como contribuinte de ICMS com inscrição estadual
- **THEN** o indicador é gravado e usado na emissão da NF-e

#### Scenario: Parceiro sem indicador em nota existente
- **WHEN** uma NF-e é solicitada para parceiro cadastrado antes deste campo existir
- **THEN** a emissão é recusada pedindo o preenchimento, sem consumir numeração

### Requirement: Cancelamento e consulta do modelo 55
O sistema SHALL cancelar e consultar NF-e pelo mesmo fluxo já usado na NFC-e,
com permissão própria `fiscal.nfe.cancel`.

#### Scenario: Cancelamento dentro do prazo
- **WHEN** o cancelamento de uma NF-e autorizada é solicitado com justificativa válida
- **THEN** o evento é transmitido e o status do documento reflete o resultado

#### Scenario: Permissão separada
- **WHEN** um usuário com `fiscal.cancel` mas sem `fiscal.nfe.cancel` tenta cancelar uma NF-e
- **THEN** a requisição é recusada com `403`
