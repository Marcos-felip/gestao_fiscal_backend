# Fiscal Document

## Purpose

Representar de forma imutável e auditável cada documento fiscal (NFC-e) emitido a
partir de uma venda, controlando seu ciclo de status, histórico de transições,
snapshot congelado e idempotência de emissão.

## Requirements

### Requirement: Documento fiscal
O sistema SHALL representar cada nota como um `FiscalDocument` com modelo, série,
número, chave de acesso, ambiente, status, protocolo, datas, valores, XMLs
(enviado/autorizado/cancelamento), DANFE, QR Code e vínculo com venda, empresa e
estabelecimento. O documento fiscal SHALL ser append-only (sem exclusão física).

#### Scenario: Criação do documento na solicitação de emissão
- **WHEN** uma emissão de NFC-e é solicitada para uma venda
- **THEN** um `FiscalDocument` é criado com status PENDENTE, número reservado e ambiente do estabelecimento

#### Scenario: Tentativa de exclusão física
- **WHEN** há uma tentativa de excluir fisicamente um documento fiscal
- **THEN** a operação é recusada e o documento é preservado

### Requirement: Ciclo de status e histórico
O sistema SHALL controlar o ciclo de status do documento (NAO_EMITIDO, PENDENTE,
PROCESSANDO, AUTORIZADO, REJEITADO, ERRO, CONTINGENCIA, CANCELAMENTO_PENDENTE,
CANCELADO, INUTILIZADO) e SHALL registrar cada transição em histórico com usuário,
motivo e data.

#### Scenario: Transição de status registrada
- **WHEN** o status do documento muda de PROCESSANDO para AUTORIZADO
- **THEN** uma entrada de histórico é gravada com origem, destino, usuário e timestamp

### Requirement: Snapshot fiscal imutável
Na emissão, o sistema SHALL congelar em snapshot o emitente, o destinatário, o
endereço, os itens, os impostos, os pagamentos e os totais. Alterações posteriores
em cadastros SHALL NOT modificar documentos já emitidos.

#### Scenario: Cadastro alterado após emissão
- **WHEN** um produto tem NCM alterado depois de uma NFC-e autorizada
- **THEN** o snapshot da nota existente permanece com os dados originais

### Requirement: Idempotência de emissão
O sistema SHALL usar uma `idempotencyKey` por venda+estabelecimento para evitar
emissão duplicada em retry ou concorrência.

#### Scenario: Duas solicitações simultâneas para a mesma venda
- **WHEN** duas solicitações de emissão chegam para a mesma venda
- **THEN** apenas um documento fiscal é criado e a segunda retorna o documento existente
