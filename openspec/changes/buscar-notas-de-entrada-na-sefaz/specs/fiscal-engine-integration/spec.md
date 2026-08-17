## ADDED Requirements

### Requirement: Distribuição de documentos no motor
O motor SHALL expor a consulta de documentos destinados ao CNPJ da empresa, por
NSU e por chave de acesso, e SHALL devolver o conteúdo como a SEFAZ o entregou.

Distribuição envolve SEFAZ, certificado e assinatura — é exatamente o que motiva
o motor existir, e por isso não fica no NestJS como o parser do XML já recebido.

#### Scenario: Consulta por NSU
- **WHEN** o backend consulta a partir de um NSU
- **THEN** o motor devolve os documentos seguintes, cada um com seu NSU, tipo e conteúdo

#### Scenario: Consulta por chave
- **WHEN** o backend consulta uma chave de acesso específica
- **THEN** o motor devolve o documento correspondente, se houver

#### Scenario: Consumo indevido
- **WHEN** a SEFAZ recusa por frequência excessiva
- **THEN** o motor devolve a recusa com o código e o motivo, sem tratá-la como falha de rede

### Requirement: Eventos de manifestação no motor
O motor SHALL enviar os eventos de manifestação do destinatário (210200, 210210,
210220 e 210240) e SHALL devolver o protocolo e o XML do evento registrado.

#### Scenario: Evento aceito
- **WHEN** a SEFAZ registra o evento
- **THEN** o motor devolve o protocolo e o XML, como já faz com o cancelamento e a CC-e

#### Scenario: Evento recusado
- **WHEN** a SEFAZ recusa o evento
- **THEN** o motor devolve o código e o motivo, sem inventar sucesso
