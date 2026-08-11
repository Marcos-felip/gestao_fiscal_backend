## ADDED Requirements

### Requirement: Devolução como NF-e de finalidade 4
O sistema SHALL emitir devolução como NF-e com finalidade de devolução,
referenciando a chave da nota original, e SHALL exigir a permissão
`fiscal.devolucao`.

#### Scenario: Devolução total
- **WHEN** o usuário devolve todos os itens de uma nota autorizada
- **THEN** é criada uma NF-e de devolução referenciando a original, com todos os itens

#### Scenario: Devolução parcial
- **WHEN** o usuário devolve parte dos itens ou parte das quantidades
- **THEN** a NF-e de devolução contém apenas o que foi devolvido, nas quantidades informadas

#### Scenario: Original não autorizada
- **WHEN** a devolução é solicitada sobre documento que não está autorizado
- **THEN** a requisição é recusada explicando que só nota autorizada admite devolução

### Requirement: Impostos espelhados da nota original
A devolução SHALL reproduzir o quadro tributário da nota original, item a item,
na proporção devolvida, e SHALL NOT recalcular imposto pela regra vigente hoje.

#### Scenario: Espelho proporcional
- **WHEN** metade da quantidade de um item é devolvida
- **THEN** a devolução carrega a mesma situação tributária e alíquota da original, com base e valores proporcionais à quantidade devolvida

#### Scenario: Regra fiscal mudou desde a emissão
- **WHEN** a alíquota cadastrada mudou depois de a nota original ser emitida
- **THEN** a devolução continua usando o que foi tributado na original, não o valor atual

#### Scenario: Original sem quadro tributário
- **WHEN** a nota original foi emitida antes de o quadro tributário existir no snapshot
- **THEN** a devolução é recusada com mensagem explicando que a nota original não tem os dados fiscais necessários

### Requirement: Saldo devolvível controlado por item
O sistema SHALL impedir que a soma das devoluções de um item ultrapasse a
quantidade da nota original.

#### Scenario: Segunda devolução dentro do saldo
- **WHEN** um item de quantidade 10 já teve 4 devolvidos e o usuário devolve mais 3
- **THEN** a devolução é aceita e o saldo devolvível passa a 3

#### Scenario: Devolução acima do saldo
- **WHEN** o usuário tenta devolver 5 de um item cujo saldo devolvível é 3
- **THEN** a requisição é recusada informando o saldo disponível

### Requirement: Contrapartida em estoque e financeiro
A devolução SHALL gerar movimentação de entrada no estoque e SHALL ajustar o
título a receber correspondente, tudo na mesma transação da emissão.

#### Scenario: Estoque retorna
- **WHEN** uma devolução é confirmada
- **THEN** os itens devolvidos geram movimentação de entrada vinculada ao documento de devolução, e o saldo é atualizado

#### Scenario: Financeiro ajustado
- **WHEN** a venda original gerou título a receber
- **THEN** o título é abatido na proporção devolvida, ou cancelado quando a devolução for total

#### Scenario: Falha na emissão não move estoque
- **WHEN** a emissão da devolução falha
- **THEN** nem o estoque nem o financeiro são alterados

### Requirement: Rastreabilidade entre devolução e original
O sistema SHALL registrar o vínculo entre o documento de devolução e o original,
navegável nos dois sentidos.

#### Scenario: A partir da original
- **WHEN** o usuário abre uma nota que teve devoluções
- **THEN** vê a lista das devoluções e o saldo devolvível por item

#### Scenario: A partir da devolução
- **WHEN** o usuário abre um documento de devolução
- **THEN** vê qual nota ele referencia
