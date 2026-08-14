# fiscal-events Specification

## Purpose
Os eventos que a nota aceita **depois** de emitida e que não são a emissão nem o
cancelamento: a carta de correção, que conserta um detalhe sem desfazer a nota, e
a inutilização, que fala de numeração que **nunca virou nota**.

## Requirements
### Requirement: Carta de correção de documento autorizado
O sistema SHALL permitir emitir carta de correção (evento 110110) para documento
autorizado, guardando texto, sequência, protocolo e XML de cada correção, e SHALL
exigir a permissão `fiscal.cce`.

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

#### Scenario: Recusa da SEFAZ registrada
- **WHEN** a SEFAZ recusa o evento
- **THEN** a tentativa fica registrada como evento do documento antes de a requisição falhar

### Requirement: A condição de uso acompanha a correção
O sistema SHALL guardar, junto de cada carta, o texto legal de condição de uso
vigente devolvido pela SEFAZ, e SHALL exibi-lo ao usuário antes da confirmação.

O texto muda com o tempo, e o que vale é o que estava vigente quando a correção
foi feita — uma constante no código guardaria a redação de ontem.

#### Scenario: Condição de uso guardada
- **WHEN** uma correção é homologada
- **THEN** a condição de uso devolvida pela SEFAZ é gravada com a carta, e não uma cópia local

### Requirement: A interface diz o que a correção não corrige
A interface SHALL informar, **antes** do campo de texto, que a carta de correção
não altera valores, datas, emitente nem destinatário, e SHALL orientar o
cancelamento e a reemissão nesses casos.

O sistema **não** infere, do texto livre, que o usuário está corrigindo um valor:
não há como fazê-lo com segurança. A garantia é a orientação prévia, e a recusa
final é da SEFAZ.

#### Scenario: Orientação visível
- **WHEN** o usuário abre a carta de correção
- **THEN** vê, antes de escrever, a lista do que não pode ser corrigido e o caminho alternativo

### Requirement: XML da correção disponível por sequência
O sistema SHALL disponibilizar o download do XML de cada carta de correção,
identificada pela sequência.

Uma nota aceita até 20 correções, todas na mesma chave de acesso: a sequência
precisa fazer parte do endereço e do nome do arquivo.

#### Scenario: Download de uma correção
- **WHEN** o usuário baixa o XML da segunda correção de uma nota
- **THEN** recebe o XML daquele evento, nomeado pela chave de acesso com a sequência

#### Scenario: Sequência inexistente
- **WHEN** o usuário pede uma sequência que a nota não tem
- **THEN** o sistema responde `404` dizendo qual sequência não existe

### Requirement: Inutilização de faixa de numeração
O sistema SHALL permitir inutilizar uma faixa de numeração de uma série,
guardando justificativa, protocolo e XML, e SHALL exigir a permissão
`fiscal.inutilizar`.

#### Scenario: Inutilizar faixa não usada
- **WHEN** uma faixa de numeração que não gerou documento é inutilizada com justificativa válida
- **THEN** o evento é transmitido e o registro fica guardado com o protocolo

#### Scenario: Faixa com documento emitido
- **WHEN** a faixa informada contém número já usado por documento autorizado ou cancelado
- **THEN** a requisição é recusada nomeando o número e a chave de acesso em conflito

#### Scenario: Faixa invertida
- **WHEN** o número inicial é maior que o final
- **THEN** a requisição é recusada com mensagem em português, antes de qualquer consulta

#### Scenario: Documento em erro definitivo
- **WHEN** um documento em `ERRO` ou `REJEITADO` tem sua numeração inutilizada
- **THEN** o documento passa ao status `INUTILIZADO`, com registro no histórico

### Requirement: Faixas pendentes sugeridas
O sistema SHALL calcular, a partir do que já existe, os números reservados que
nunca viraram documento, agrupados em faixas contíguas por modelo e série.

Sugerir é melhor do que deixar digitar: a faixa errada inutiliza numeração válida,
e isso não se desfaz. Não há rastreamento à parte — os candidatos são todos os
números de 1 até o próximo, sem documento e sem inutilização anterior.

#### Scenario: Número perdido em falha de emissão
- **WHEN** um número foi reservado e a criação do documento falhou
- **THEN** ele aparece entre as faixas pendentes daquele modelo e série

#### Scenario: Faixa já inutilizada
- **WHEN** uma faixa já foi inutilizada
- **THEN** ela deixa de ser sugerida

### Requirement: Faixa já inutilizada na SEFAZ é reconciliada
Quando a SEFAZ recusar a inutilização informando que **já existe** pedido para a
mesma faixa, o sistema SHALL gravar o registro com o protocolo informado nessa
recusa, em vez de tratar como erro.

É o que sobra quando o pedido é homologado e a resposta não volta a tempo: o ato
existe lá e não existe aqui. Sem a reconciliação a faixa fica no limbo — sugerida
para sempre, recusada para sempre.

#### Scenario: Resposta perdida por timeout
- **WHEN** a SEFAZ recusa por duplicidade e informa o protocolo do pedido anterior
- **THEN** a inutilização é registrada com aquele protocolo e sai das faixas pendentes

#### Scenario: Recusa de outro motivo
- **WHEN** a recusa é por qualquer outro motivo
- **THEN** a requisição falha com a mensagem da SEFAZ, sem gravar nada

### Requirement: Eventos entram na exportação para o contador
A exportação em lote SHALL incluir os XMLs de carta de correção junto do
documento correspondente, e o manifesto SHALL registrar quantas correções cada
nota tem.

#### Scenario: Nota corrigida no período
- **WHEN** o período exportado contém uma nota com carta de correção
- **THEN** o ZIP traz o XML da nota e o de cada correção, numerado pela sequência

#### Scenario: XML da correção não recuperado
- **WHEN** o XML de uma correção não volta do armazenamento
- **THEN** o manifesto registra a correção como arquivo ausente e a exportação continua

### Requirement: Permissões separadas por ato
Corrigir documento e inutilizar numeração SHALL exigir permissões distintas entre
si e distintas do cancelamento.

#### Scenario: Permissão insuficiente
- **WHEN** um usuário com `fiscal.cancel` tenta inutilizar uma faixa sem ter `fiscal.inutilizar`
- **THEN** a requisição é recusada com `403`
