# nfe-emission Specification

## Purpose
Emissão de NF-e modelo 55 — a nota entre empresas, com destinatário identificado.
O item e o quadro tributário são os mesmos da NFC-e; o que muda é o destinatário
obrigatório, a série própria e os grupos que só o modelo 55 tem.

**Recorte vigente:** venda **interna** (mesma UF), saída, finalidade normal,
destinatário pessoa jurídica. Venda interestadual está fora, e com ela CFOP 6xxx,
DIFAL e ST interestadual.

## Requirements
### Requirement: Emissão de NF-e modelo 55
O sistema SHALL emitir NF-e modelo 55 a partir de uma operação comercial,
exigindo destinatário identificado e completo, natureza da operação, tipo de
operação e finalidade da nota.

A emissão SHALL exigir a permissão `fiscal.nfe.emit`, separada de `fiscal.emit`:
quem opera o caixa emite NFC-e e não necessariamente NF-e.

#### Scenario: Emissão com destinatário completo
- **WHEN** uma NF-e é solicitada para um parceiro com CNPJ, endereço completo e indicador de IE
- **THEN** o documento é criado, a numeração de NF-e é reservada e a emissão é enfileirada

#### Scenario: Destinatário incompleto
- **WHEN** o parceiro escolhido não tem endereço completo ou indicador de IE
- **THEN** a emissão é recusada com mensagem em português nomeando os campos faltantes, e **nenhuma numeração é consumida**

#### Scenario: Sem destinatário
- **WHEN** uma NF-e é solicitada sem parceiro
- **THEN** a emissão é recusada — diferente da NFC-e, o destinatário é obrigatório

#### Scenario: Destinatário pessoa física
- **WHEN** o parceiro é pessoa física
- **THEN** a emissão é recusada nomeando o motivo — pessoa física continua na NFC-e

### Requirement: O tipo de pessoa do cliente escolhe o modelo
A emissão automática ao confirmar a venda SHALL emitir NFC-e apenas quando o
cliente **não** for pessoa jurídica, deixando a venda para pessoa jurídica em
`NAO_EMITIDO` até a emissão explícita da NF-e.

`fiscal_documents.sale_id` é único: se a NFC-e automática criasse o documento, a
NF-e daquela venda ficaria impossível de emitir — o endpoint existiria e seria
inalcançável pelo fluxo normal.

#### Scenario: Venda para pessoa jurídica
- **WHEN** uma venda para cliente pessoa jurídica é confirmada
- **THEN** nenhum documento é emitido automaticamente, e a venda fica disponível para emissão de NF-e

#### Scenario: Venda para consumidor
- **WHEN** uma venda sem cliente ou para pessoa física é confirmada
- **THEN** a NFC-e é emitida automaticamente, como antes

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

#### Scenario: Falha depois da reserva
- **WHEN** a criação do documento falha depois de a numeração ter sido reservada
- **THEN** o número **não** é reaproveitado, e o buraco resultante é regularizável por inutilização

### Requirement: Grupos exclusivos do modelo 55 no snapshot
O snapshot da NF-e SHALL registrar destinatário completo, natureza da operação,
tipo de operação, finalidade, transporte, volumes e cobrança quando informados.

#### Scenario: Nota com transporte e cobrança
- **WHEN** uma NF-e é emitida com transportadora e parcelamento
- **THEN** o snapshot registra os dois grupos e eles são enviados ao motor

#### Scenario: Nota sem transporte
- **WHEN** uma NF-e é emitida sem dados de transporte
- **THEN** o documento é emitido normalmente, sem o grupo — grupo ausente já significa "sem frete"

### Requirement: Indicador de IE do destinatário
O cadastro de parceiro SHALL manter o indicador de inscrição estadual
(contribuinte, isento ou não contribuinte), exigido na NF-e, e o código IBGE do
município do destinatário.

O indicador **não** se deduz do tipo de pessoa: prestadora de serviço é pessoa
jurídica e não é contribuinte de ICMS. A inscrição estadual só viaja quando o
indicador é "contribuinte".

#### Scenario: Parceiro contribuinte
- **WHEN** um parceiro é cadastrado como contribuinte de ICMS com inscrição estadual
- **THEN** o indicador é gravado e a IE é enviada na emissão da NF-e

#### Scenario: Parceiro sem indicador em nota existente
- **WHEN** uma NF-e é solicitada para parceiro cadastrado antes deste campo existir
- **THEN** a emissão é recusada pedindo o preenchimento, sem consumir numeração

#### Scenario: Contribuinte sem inscrição estadual
- **WHEN** o parceiro é marcado como contribuinte mas não tem IE
- **THEN** a emissão é recusada — a SEFAZ confere a IE contra o CNPJ **mesmo em homologação**

### Requirement: DANFE do modelo 55 no formato que o motor declara
O download do DANFE SHALL derivar extensão e tipo de conteúdo do formato
declarado pelo motor, e não assumir PDF.

O DANFE da NF-e é HTML: o layout retrato depende de `System.Drawing.Common`,
Windows-only no .NET 8, e o motor roda em contêiner Linux. Servir HTML com
extensão `.pdf` entrega um arquivo que nenhum leitor abre.

#### Scenario: DANFE de NF-e
- **WHEN** o usuário baixa o DANFE de uma NF-e
- **THEN** recebe um arquivo HTML, declarado como tal

#### Scenario: DANFE de NFC-e
- **WHEN** o usuário baixa o DANFE de uma NFC-e
- **THEN** recebe um PDF, como antes

### Requirement: Cancelamento e consulta do modelo 55
O sistema SHALL cancelar e consultar NF-e pelo mesmo fluxo já usado na NFC-e.

O cancelamento passa por `fiscal.cancel`, comum aos dois modelos. A permissão
`fiscal.nfe.cancel` existe no catálogo mas está **reservada** — separar o
cancelamento por modelo só se justifica se algum papel puder cancelar um e não o
outro, o que não é o caso hoje.

#### Scenario: Cancelamento dentro do prazo
- **WHEN** o cancelamento de uma NF-e autorizada é solicitado com justificativa válida
- **THEN** o evento é transmitido e o status do documento reflete o resultado

#### Scenario: Prazo esgotado
- **WHEN** o prazo legal de cancelamento já passou
- **THEN** a recusa vem da SEFAZ, com o motivo em português — o prazo não é duplicado localmente
