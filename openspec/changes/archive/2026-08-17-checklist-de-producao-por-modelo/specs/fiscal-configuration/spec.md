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

### Requirement: Item do checklist identificado por código
Cada item do checklist SHALL trazer um código estável, independente do texto
exibido.

A interface precisa agir sobre itens específicos — levar à lista de produtos
pendentes, por exemplo. Reconhecê-los pelo texto amarraria a tela a uma frase em
português que existe para ser reescrita.

#### Scenario: Item de produtos pendentes
- **WHEN** o checklist inclui o item de produtos com quadro tributário incompleto
- **THEN** ele vem com o código `produtos_fiscais`, e o texto pode mudar sem quebrar a tela

#### Scenario: Código repetido entre modelos
- **WHEN** o estabelecimento emite os dois modelos
- **THEN** série e próximo número aparecem com o mesmo código em cada modelo, distinguidos pelo campo `modelo`

### Requirement: Auditoria da liberação registra os modelos
O evento de liberação de produção SHALL registrar **quais modelos** foram
liberados, e o de revogação, quais deixaram de valer.

Gravar `true`/`false` dizia que alguém liberou, não o que foi liberado. Como os
modelos emitidos mudam depois do evento, a trilha não permitia reconstituir o
estado daquele instante.

#### Scenario: Liberação
- **WHEN** a produção é liberada
- **THEN** o evento registra os modelos em português, apurados como no checklist

#### Scenario: Configuração sem modelos declarados
- **WHEN** a configuração não declara nenhum modelo
- **THEN** o evento registra os dois, pela mesma regra do checklist
