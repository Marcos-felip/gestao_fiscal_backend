## ADDED Requirements

### Requirement: Carta de correção de documento autorizado
O sistema SHALL permitir emitir carta de correção para documento autorizado,
guardando texto, sequência, protocolo e XML de cada correção, e SHALL exigir a
permissão `fiscal.cce`.

#### Scenario: Correção aceita
- **WHEN** uma carta de correção é emitida para uma nota autorizada, com texto válido
- **THEN** o evento é transmitido, e o texto, a sequência, o protocolo e o XML ficam guardados no histórico do documento

#### Scenario: Documento não autorizado
- **WHEN** uma correção é solicitada para documento rejeitado, em erro ou cancelado
- **THEN** a requisição é recusada com mensagem explicando que só nota autorizada admite correção

#### Scenario: Texto fora do tamanho permitido
- **WHEN** o texto tem menos de 15 ou mais de 1000 caracteres
- **THEN** a requisição é recusada em português, antes de chamar o motor

#### Scenario: Limite de correções atingido
- **WHEN** a nota já tem 20 cartas de correção
- **THEN** a requisição é recusada citando o limite legal

#### Scenario: Sequência automática
- **WHEN** uma nova correção é emitida para uma nota que já tem duas
- **THEN** o sistema atribui a sequência 3, sem exigir que o usuário a informe

### Requirement: Correção não substitui cancelamento
O sistema SHALL deixar explícito que a carta de correção não altera valores,
datas, emitente nem destinatário, e SHALL orientar o cancelamento quando o
usuário tentar corrigir esses campos.

#### Scenario: Tentativa de corrigir valor
- **WHEN** o usuário descreve uma correção de valor
- **THEN** a requisição é recusada com orientação de cancelar e reemitir

### Requirement: Inutilização de faixa de numeração
O sistema SHALL permitir inutilizar uma faixa de numeração de uma série,
guardando justificativa, protocolo e XML, e SHALL exigir a permissão
`fiscal.inutilizar`.

#### Scenario: Inutilizar faixa não usada
- **WHEN** uma faixa de numeração que não gerou documento é inutilizada com justificativa válida
- **THEN** o evento é transmitido e o registro fica guardado com o protocolo

#### Scenario: Faixa com documento autorizado
- **WHEN** a faixa informada contém número já usado por documento autorizado
- **THEN** a requisição é recusada nomeando o documento em conflito

#### Scenario: Faixa invertida
- **WHEN** o número inicial é maior que o final
- **THEN** a requisição é recusada com mensagem em português

#### Scenario: Documento em erro definitivo
- **WHEN** um documento fica em erro definitivo e sua numeração é inutilizada
- **THEN** o documento passa ao status `INUTILIZADO`

### Requirement: Eventos entram na exportação para o contador
A exportação em lote SHALL incluir os XMLs de carta de correção junto do
documento correspondente.

#### Scenario: Nota corrigida no período
- **WHEN** o período exportado contém uma nota com carta de correção
- **THEN** o ZIP traz o XML da nota e o da correção, e o manifesto registra os dois

### Requirement: Permissões separadas por ato
Corrigir documento e inutilizar numeração SHALL exigir permissões distintas entre
si e distintas do cancelamento.

#### Scenario: Permissão insuficiente
- **WHEN** um usuário com `fiscal.cancel` tenta inutilizar uma faixa sem ter `fiscal.inutilizar`
- **THEN** a requisição é recusada com `403`
