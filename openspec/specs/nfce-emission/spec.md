# NFC-e Emission

## Purpose

Emitir NFC-e (modelo 65) a partir de uma venda concluída de forma assíncrona,
sem bloquear a venda, reservando numeração atômica e transmitindo via motor fiscal.

## Requirements

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
