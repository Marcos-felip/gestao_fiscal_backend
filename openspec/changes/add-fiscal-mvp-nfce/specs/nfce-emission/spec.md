## ADDED Requirements

### Requirement: Emissão assíncrona de NFC-e
O sistema SHALL emitir NFC-e a partir de uma venda concluída de forma assíncrona:
validar pré-condições, reservar numeração sequencial atômica por série+
estabelecimento, enfileirar o processamento e transmitir via motor fiscal sem
bloquear a venda.

#### Scenario: Emissão autorizada
- **WHEN** uma venda válida é enviada para emissão e a SEFAZ autoriza
- **THEN** o documento fica AUTORIZADO com chave, protocolo, XML autorizado, QR Code e DANFE armazenados, e a venda reflete o status fiscal

#### Scenario: Numeração nunca duplicada
- **WHEN** múltiplas emissões concorrem no mesmo estabelecimento e série
- **THEN** cada documento recebe um número sequencial único, sem repetição

### Requirement: Consulta de situação
O sistema SHALL consultar a situação de uma NFC-e na SEFAZ pela chave de acesso e
atualizar o status local conforme o retorno.

#### Scenario: Reconciliação após timeout
- **WHEN** uma emissão sofre timeout mas a nota foi autorizada na SEFAZ
- **THEN** a consulta identifica a autorização e o documento é atualizado para AUTORIZADO

### Requirement: Cancelamento de NFC-e
O sistema SHALL permitir cancelar uma NFC-e autorizada mediante justificativa de no
mínimo 15 caracteres, enviando o evento de cancelamento e armazenando protocolo e
XML de cancelamento. O sistema SHALL impedir cancelamento duplicado.

#### Scenario: Cancelamento com justificativa válida
- **WHEN** o usuário cancela uma nota autorizada com justificativa de 15+ caracteres
- **THEN** o evento é enviado, o documento vira CANCELADO e o XML/protocolo de cancelamento são guardados

#### Scenario: Justificativa curta
- **WHEN** o usuário tenta cancelar com justificativa menor que 15 caracteres
- **THEN** o cancelamento é recusado antes de enviar o evento

### Requirement: Tratamento de rejeições e retry
O sistema SHALL persistir código e mensagem de rejeição, permitir nova tentativa
sem duplicar a nota e disponibilizar uma central de rejeições.

#### Scenario: Retry após corrigir o cadastro
- **WHEN** uma nota é rejeitada, o cadastro é corrigido e o usuário aciona retry
- **THEN** a mesma numeração/documento é reprocessado, sem criar duplicidade

### Requirement: Separação de ambientes
O sistema SHALL separar as configurações de homologação e produção e SHALL impedir
emissão acidental em produção por meio de flag/checklist explícito de ativação.

#### Scenario: Ativação de produção sem checklist
- **WHEN** uma emissão em produção é solicitada sem o checklist de ativação concluído
- **THEN** a emissão é bloqueada
