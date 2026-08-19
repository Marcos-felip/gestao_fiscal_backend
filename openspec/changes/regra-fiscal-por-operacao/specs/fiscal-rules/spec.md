## ADDED Requirements

### Requirement: Resolução do quadro tributário por operação
O sistema SHALL resolver o CFOP, a situação tributária e as alíquotas de cada
item a partir do contexto da operação — produto, emitente, destinatário e tipo de
operação — e SHALL expor essa resolução atrás de uma porta substituível.

#### Scenario: Venda interna a consumidor final
- **WHEN** um item é resolvido para venda dentro da UF do emitente, a consumidor final
- **THEN** o quadro devolvido traz CFOP de operação interna e a situação tributária correspondente

#### Scenario: Venda interestadual
- **WHEN** o destinatário está em UF diferente da do emitente
- **THEN** o quadro devolvido traz CFOP de operação interestadual

#### Scenario: Troca da implementação
- **WHEN** a implementação da regra fiscal é substituída por outra
- **THEN** nenhum código de domínio ou de emissão precisa mudar

### Requirement: Regra mais específica vence, e empate falha
A resolução SHALL aplicar a regra mais específica que casar com o contexto,
contando a especificidade pelo número de critérios preenchidos. Empate entre
regras igualmente específicas SHALL falhar a emissão.

#### Scenario: Regra específica ganha da genérica
- **WHEN** existe uma regra por NCM e outra por NCM + UF de destino, e as duas casam
- **THEN** a resolução aplica a que casa NCM + UF de destino

#### Scenario: Empate entre regras
- **WHEN** duas regras igualmente específicas casam o mesmo contexto
- **THEN** a emissão é bloqueada com mensagem em português nomeando as duas regras em conflito, antes de consumir numeração

### Requirement: Sem regra cadastrada, o cadastro do produto vale
Quando nenhuma regra casar o contexto, a resolução SHALL devolver o CFOP e a
situação tributária cadastrados no produto.

#### Scenario: Base sem regras
- **WHEN** uma empresa não tem nenhuma regra fiscal cadastrada
- **THEN** a emissão continua funcionando com os dados do produto, com o mesmo resultado de antes desta capacidade existir

#### Scenario: Produto sem dados e sem regra
- **WHEN** nenhuma regra casa e o produto está fiscalmente incompleto
- **THEN** a emissão é recusada por item fiscalmente incompleto, como já acontece

### Requirement: A regra aplicada fica registrada no documento
O quadro tributário gravado no snapshot SHALL registrar qual regra o resolveu, ou
indicar que veio do cadastro do produto.

#### Scenario: Rastrear a origem do imposto
- **WHEN** um documento fiscal é consultado
- **THEN** é possível saber, por item, qual regra fiscal determinou o quadro tributário

#### Scenario: Quadro vindo do produto
- **WHEN** nenhuma regra casou e o quadro veio do cadastro
- **THEN** o snapshot registra essa origem explicitamente

### Requirement: Cadastro de regras fiscais
O sistema SHALL permitir cadastrar, listar, editar e remover regras fiscais por
empresa, protegidas por permissão própria, com isolamento por `companyId` e soft
delete.

#### Scenario: Isolamento entre empresas
- **WHEN** um usuário lista as regras fiscais
- **THEN** vê apenas as da empresa ativa

#### Scenario: Permissão exigida
- **WHEN** um usuário sem a permissão de edição tenta alterar uma regra
- **THEN** a requisição é recusada com `403`

### Requirement: Simulação do quadro tributário
O sistema SHALL permitir simular a resolução para um produto e uma operação
hipotética, devolvendo o quadro que sairia e a regra que o determinou, sem criar
documento nem consumir numeração.

#### Scenario: Conferir antes de emitir
- **WHEN** o usuário simula a venda de um produto para outra UF
- **THEN** recebe o CFOP, a situação tributária, as alíquotas e a regra aplicada, sem que nada seja emitido

#### Scenario: Simulação de contexto sem regra
- **WHEN** a simulação usa um contexto que nenhuma regra cobre
- **THEN** o resultado mostra o quadro vindo do produto e indica que nenhuma regra casou
