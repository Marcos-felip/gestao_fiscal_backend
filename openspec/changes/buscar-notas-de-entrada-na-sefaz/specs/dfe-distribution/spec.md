## ADDED Requirements

### Requirement: Descobrir notas emitidas contra o CNPJ da empresa
O sistema SHALL consultar a SEFAZ pelas NF-e emitidas contra o CNPJ de cada
estabelecimento e SHALL registrar cada documento devolvido.

Nota que ninguém enviou não é importada. A distribuição é como o sistema descobre
a compra no dia do faturamento, e não no dia em que a mercadoria chega.

#### Scenario: Notas novas
- **WHEN** a consulta devolve documentos ainda não conhecidos
- **THEN** cada um é registrado com emitente, valor, data e chave de acesso

#### Scenario: Nada novo
- **WHEN** a SEFAZ responde que não há documento novo
- **THEN** a consulta encerra sem erro e sem registrar nada

### Requirement: A consulta continua de onde parou
O sistema SHALL guardar o último NSU consultado por estabelecimento e ambiente, e
SHALL retomar dele na consulta seguinte.

A distribuição é um fluxo sequencial numerado, não uma busca por período.
Recomeçar do zero relê tudo e esbarra no limite de frequência da SEFAZ; pular
NSU perde nota para sempre.

#### Scenario: Retomada
- **WHEN** uma nova consulta é feita
- **THEN** ela parte do último NSU registrado para aquele estabelecimento e ambiente

#### Scenario: Interrupção no meio
- **WHEN** a consulta falha depois de processar parte dos documentos
- **THEN** o NSU avança só até o último documento efetivamente registrado

#### Scenario: Limite de frequência
- **WHEN** a SEFAZ recusa por consumo indevido
- **THEN** o sistema registra a recusa e não reconsulta antes do intervalo permitido

### Requirement: Manifestação do destinatário
O sistema SHALL permitir manifestar ciência (210210), confirmação (210200),
desconhecimento (210220) e operação não realizada (210240), e SHALL registrar o
protocolo de cada evento.

#### Scenario: Ciência da operação
- **WHEN** o usuário manifesta ciência de uma nota
- **THEN** o evento é enviado e o documento passa a permitir o download do XML completo

#### Scenario: Desconhecimento
- **WHEN** o usuário desconhece a operação
- **THEN** o evento é enviado e o documento é marcado como desconhecido, sem virar compra

#### Scenario: Evento recusado
- **WHEN** a SEFAZ recusa o evento
- **THEN** o motivo é exibido em português e a situação anterior é preservada

### Requirement: Nenhum evento é enviado sem alguém mandar
O sistema SHALL NOT manifestar automaticamente qualquer evento.

Confirmar por automatismo uma nota fria emitida contra o CNPJ da empresa é pior
do que não manifestar: transforma em aceite o que seria contestável.

#### Scenario: Nota descoberta
- **WHEN** uma nota nova é registrada pela distribuição
- **THEN** ela fica pendente de decisão, sem evento enviado

### Requirement: Resumo não é nota
O sistema SHALL distinguir o documento de que só se tem o resumo daquele de que
já se tem o XML completo, e SHALL NOT permitir gerar compra a partir do resumo.

O resumo traz emitente, valor e chave — não traz itens. Compra feita de resumo
seria compra sem mercadoria.

#### Scenario: Documento só com resumo
- **WHEN** a distribuição devolveu apenas o resumo
- **THEN** o documento é listado, mas a importação só é oferecida depois da ciência

#### Scenario: XML completo obtido
- **WHEN** o XML completo é baixado após a manifestação
- **THEN** o documento passa a permitir a importação

### Requirement: Emitente desconhecido é destacado
O sistema SHALL destacar documentos cujo emitente nunca foi fornecedor da empresa.

É o formato que a nota fria tem: CNPJ que a empresa nunca comprou, emitindo
contra ela.

#### Scenario: Primeiro documento de um emitente
- **WHEN** o emitente não tem nenhuma compra anterior na empresa
- **THEN** o documento é destacado na lista de pendências
