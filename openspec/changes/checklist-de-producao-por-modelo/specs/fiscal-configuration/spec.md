## ADDED Requirements

### Requirement: Modelos emitidos pelo estabelecimento
A configuração fiscal SHALL registrar quais modelos de documento o
estabelecimento emite, e SHALL exigir ao menos um.

O dado não é inferido do histórico: estabelecimento novo não tem histórico, e
quem sabe se vai emitir NF-e é quem opera.

#### Scenario: Estabelecimento só de balcão
- **WHEN** o estabelecimento é configurado para emitir apenas NFC-e
- **THEN** o checklist não cobra nada que seja exclusivo do modelo 55

#### Scenario: Estabelecimento só de atacado
- **WHEN** o estabelecimento é configurado para emitir apenas NF-e
- **THEN** CSC e consulta pública deixam de bloquear a liberação

#### Scenario: Nenhum modelo escolhido
- **WHEN** a configuração é salva sem nenhum modelo
- **THEN** é recusada em português — um estabelecimento sem modelo não emite nada

## MODIFIED Requirements

### Requirement: Checklist de liberação de produção
O sistema SHALL apurar um checklist de pré-condições antes de liberar a emissão
em produção, e SHALL recusar a liberação enquanto houver item **bloqueante**
pendente.

Cada item SHALL declarar a quais modelos se aplica, e a apuração SHALL considerar
apenas os modelos que o estabelecimento emite. O checklist é o último portão
antes de a nota valer dinheiro: cobrar o que não se aplica trava quem está
pronto, e deixar de cobrar o que se aplica libera quem não está.

#### Scenario: Item exclusivo da NFC-e
- **WHEN** o estabelecimento não emite NFC-e
- **THEN** CSC, ID do CSC e consulta pública não entram na apuração nem bloqueiam

#### Scenario: Numeração conferida por modelo
- **WHEN** o estabelecimento emite NF-e e NFC-e
- **THEN** o checklist traz série e próximo número de **cada** modelo, como itens distintos

#### Scenario: Série da NF-e inválida
- **WHEN** a série de NF-e está fora de 1 a 999 e o estabelecimento emite NF-e
- **THEN** o item correspondente fica pendente e bloqueia a liberação

#### Scenario: Certificado vale para todos
- **WHEN** qualquer modelo é emitido
- **THEN** os itens de certificado continuam se aplicando, porque a assinatura é a mesma

### Requirement: Produtos com pendência fiscal no checklist
O checklist SHALL informar quantos produtos ativos ainda não têm o quadro
tributário completo, como item **não bloqueante**.

O sistema não pode preencher CSOSN, CST ou NCM por ninguém — é decisão do
contador. Mas pode dizer quantos faltam antes da liberação, em vez de a rejeição
aparecer na primeira venda do balcão.

#### Scenario: Cadastro incompleto
- **WHEN** existem produtos ativos sem o quadro tributário completo
- **THEN** o checklist informa a quantidade e não bloqueia a liberação

#### Scenario: Cadastro completo
- **WHEN** todos os produtos ativos estão completos
- **THEN** o item aparece resolvido
