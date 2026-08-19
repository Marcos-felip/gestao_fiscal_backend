# Fiscal Configuration

## Purpose

Manter os dados fiscais necessários para emitir: configuração da empresa
emitente, configuração fiscal por estabelecimento (ambiente, numeração, CSC e
referência do certificado A1, modelos emitidos e liberação de produção), dados
fiscais dos produtos e o mapeamento das formas de pagamento para os códigos
fiscais.
## Requirements
### Requirement: Configuração fiscal da empresa
O sistema SHALL manter os dados fiscais da empresa (CNPJ, IE, IM, CRT, contribuinte
de ICMS, endereço fiscal com código IBGE, telefone/e-mail fiscal) e SHALL expor um
indicador `fiscalConfigComplete`. A emissão SHALL ser bloqueada enquanto a
configuração da empresa estiver incompleta.

A Inscrição Estadual do emitente SHALL ter o estabelecimento como fonte da
verdade; `Company.inscricaoEstadual` SHALL servir apenas como fallback quando o
estabelecimento não tiver IE própria, na mesma precedência que a emissão já aplica.

O campo `stateRegistration`, aceito na atualização da empresa, SHALL ser devolvido
nas leituras da empresa, derivado da IE da matriz. O sistema SHALL NOT expor campo
aceito na escrita que não possa ser lido de volta pelo mesmo nome.

#### Scenario: Empresa sem CRT ou IBGE
- **WHEN** uma emissão é solicitada e a empresa está sem CRT ou sem código IBGE
- **THEN** a emissão é recusada com erro de configuração incompleta e nenhum documento é criado

#### Scenario: Validação de CNPJ/IE
- **WHEN** os dados fiscais da empresa são gravados
- **THEN** CNPJ e formato de IE são validados localmente e valores inválidos são rejeitados

#### Scenario: Round-trip da IE da matriz
- **WHEN** o usuário grava a empresa informando `stateRegistration` e em seguida consulta a empresa
- **THEN** a consulta devolve `stateRegistration` com o valor gravado, sem exigir que o cliente leia a lista de estabelecimentos

#### Scenario: IE devolvida na resposta da própria atualização
- **WHEN** o usuário atualiza a empresa informando `stateRegistration`
- **THEN** a resposta da atualização já contém o valor gravado, permitindo confirmar a escrita sem uma segunda requisição

#### Scenario: Empresa sem matriz configurada
- **WHEN** a empresa ainda não tem estabelecimento matriz e é consultada
- **THEN** `stateRegistration` é devolvido como nulo, sem erro

#### Scenario: IE da empresa e IE da matriz divergentes na mesma requisição
- **WHEN** a atualização informa `inscricaoEstadual` e `stateRegistration` com valores diferentes
- **THEN** a requisição é recusada com erro em português explicando que a IE do emitente é a do estabelecimento, e nenhum dos dois valores é gravado

#### Scenario: Precedência preservada na emissão
- **WHEN** um documento fiscal é montado para um estabelecimento com IE própria
- **THEN** o emitente do snapshot carrega a IE do estabelecimento, e a IE da empresa é usada apenas quando a do estabelecimento estiver ausente

### Requirement: Configuração fiscal do estabelecimento emissor
O sistema SHALL manter, por estabelecimento, o ambiente (homologação/produção), a
série e a próxima numeração da NFC-e, o CSC e o idCSC, e o certificado A1
(armazenado criptografado). O certificado SHALL nunca ser persistido ou registrado
em texto claro.

O CSC (`codigoCsc`) SHALL ter de 16 a 64 caracteres alfanuméricos e o idCSC
(`idCsc`) SHALL ter de 1 a 6 dígitos. O sistema SHALL recusar valores fora desse
formato no cadastro e SHALL bloquear a emissão antes de consumir numeração quando
a configuração em uso estiver fora do formato.

O CSC SHALL nunca ser devolvido em log, mensagem de erro ou evento de auditoria.

#### Scenario: Gravar configuração do estabelecimento
- **WHEN** o usuário grava a configuração fiscal de um estabelecimento
- **THEN** o ambiente, a série, a próxima numeração, o CSC/idCSC são persistidos, e a resposta reflete os dados salvos

#### Scenario: CSC curto demais
- **WHEN** o usuário grava a configuração fiscal com um CSC de menos de 16 caracteres
- **THEN** a gravação é recusada com erro em português indicando o formato esperado e onde obter o CSC no portal da SEFAZ, e nada é persistido

#### Scenario: idCSC fora do formato
- **WHEN** o usuário grava a configuração fiscal com um idCSC não numérico ou com mais de 6 dígitos
- **THEN** a gravação é recusada com erro em português indicando que o idCSC é o token numérico de até 6 posições, e nada é persistido

#### Scenario: Emissão com CSC malformado já cadastrado
- **WHEN** uma emissão é solicitada e o estabelecimento tem um CSC fora do formato gravado antes desta validação
- **THEN** a emissão é bloqueada na etapa de preparação, o documento fica em ERRO com o motivo "CSC do estabelecimento está fora do formato esperado", e **nenhuma numeração de NFC-e é consumida**

#### Scenario: Pendência de configuração distingue ausente de malformado
- **WHEN** o relatório de pré-condições fiscais é consultado para um estabelecimento com CSC preenchido porém inválido
- **THEN** a pendência informa que o CSC está malformado, e não que está ausente

#### Scenario: Upload de certificado A1
- **WHEN** o usuário envia um certificado A1 válido com a senha
- **THEN** o certificado é armazenado criptografado, e a validade e o titular são extraídos e exibidos

#### Scenario: Certificado vencido
- **WHEN** uma emissão é solicitada com o certificado do estabelecimento vencido
- **THEN** a emissão é bloqueada e o usuário é avisado do vencimento

#### Scenario: Teste de comunicação com a SEFAZ
- **WHEN** o usuário aciona o teste de comunicação
- **THEN** o sistema consulta o status do serviço da SEFAZ via motor fiscal e retorna disponível/indisponível

### Requirement: Dados fiscais dos produtos
O sistema SHALL manter os dados fiscais de cada produto (NCM, CEST, origem, CFOP,
CSOSN/CST, situação tributária de PIS e COFINS, alíquotas, unidade comercial,
GTIN) e SHALL expor um indicador `fiscalComplete`. A emissão SHALL ser bloqueada
quando algum item da venda estiver fiscalmente incompleto.

A situação tributária de PIS e de COFINS SHALL fazer parte da checagem de
completude — sem elas o item não tem como compor o quadro tributário.

#### Scenario: Produto sem NCM
- **WHEN** uma venda contém um item cujo produto está sem NCM
- **THEN** a emissão é recusada por item fiscalmente incompleto

#### Scenario: Produto sem situação tributária de PIS ou COFINS
- **WHEN** um produto não tem CST de PIS ou de COFINS cadastrado
- **THEN** o produto é marcado como fiscalmente incompleto e aparece no relatório de pendências, com texto indicando o que preencher

#### Scenario: Produtos existentes continuam emitindo
- **WHEN** a mudança é aplicada sobre uma base com produtos sem CST de PIS e COFINS
- **THEN** esses produtos recebem valores que reproduzem o comportamento anterior, e nenhuma emissão em curso é interrompida

### Requirement: Mapeamento fiscal das formas de pagamento
O sistema SHALL mapear cada forma de pagamento da venda para o código fiscal
correspondente e SHALL suportar pagamento dividido a partir dos pagamentos da venda.

#### Scenario: Pagamento dividido
- **WHEN** uma venda é paga parte em PIX e parte em dinheiro
- **THEN** cada forma recebe o código fiscal correto no documento emitido


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
