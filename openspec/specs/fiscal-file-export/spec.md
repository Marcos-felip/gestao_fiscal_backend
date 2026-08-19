# fiscal-file-export Specification

## Purpose
TBD - created by archiving change exportar-xmls-em-lote. Update Purpose after archive.
## Requirements
### Requirement: Exportação em lote dos XMLs de um período
O sistema SHALL exportar, num único arquivo ZIP, os XMLs dos documentos fiscais
de um período informado. A exportação SHALL exigir data de início e fim e SHALL
aceitar filtros de estabelecimento, modelo e ambiente.

A exportação SHALL incluir apenas documentos `AUTORIZADO` e `CANCELADO` — são os
únicos que existem para o fisco e entram na escrituração.

#### Scenario: Exportar o mês fechado
- **WHEN** o usuário exporta o período de 01/08 a 31/08 de um estabelecimento
- **THEN** o sistema devolve um ZIP com os XMLs de todos os documentos autorizados e cancelados do período

#### Scenario: Documento rejeitado fora da exportação
- **WHEN** o período contém documentos `REJEITADO`, `ERRO` ou `PENDENTE`
- **THEN** esses documentos não entram no ZIP nem no manifesto

#### Scenario: Período sem documentos
- **WHEN** o período informado não tem nenhum documento autorizado ou cancelado
- **THEN** o sistema devolve um ZIP contendo apenas o manifesto vazio, com `200`, e não um erro

### Requirement: Documento cancelado leva o XML do evento
Para cada documento `CANCELADO`, a exportação SHALL incluir tanto o XML
autorizado quanto o XML do evento de cancelamento.

#### Scenario: Nota cancelada no período
- **WHEN** o período contém uma nota cancelada
- **THEN** o ZIP traz dois arquivos para ela: o XML autorizado e o XML do cancelamento

#### Scenario: Cancelamento sem XML guardado
- **WHEN** uma nota está cancelada mas o XML do evento não foi persistido
- **THEN** o XML autorizado é incluído, o manifesto registra o cancelamento como arquivo ausente, e a exportação continua

### Requirement: Nomes de arquivo pela chave de acesso
Os arquivos dentro do ZIP SHALL ser nomeados pela chave de acesso do documento,
com sufixo indicando o tipo (`-nfe`, `-cancelamento`).

#### Scenario: Nomeação
- **WHEN** um documento de chave `31260851720322000146650010000000071009048390` é exportado
- **THEN** o arquivo dentro do ZIP se chama `31260851720322000146650010000000071009048390-nfe.xml`

### Requirement: Manifesto de conferência
O ZIP SHALL conter um arquivo `_relacao.csv` com uma linha por documento
exportado, contendo chave de acesso, número, série, modelo, data de autorização,
status e valor total, além de indicar quando o XML não pôde ser recuperado.

#### Scenario: Conferir a exportação
- **WHEN** o contador abre o ZIP
- **THEN** encontra `_relacao.csv` listando todos os documentos do período, permitindo conferir a quantidade contra o sistema

#### Scenario: XML indisponível no armazenamento
- **WHEN** um documento autorizado tem a referência do XML mas o arquivo não é recuperável do storage
- **THEN** o documento aparece no manifesto marcado como arquivo ausente, os demais são exportados normalmente, e a requisição não falha

### Requirement: Ambientes não se misturam
A exportação SHALL separar homologação de produção e SHALL NOT incluir documentos
dos dois ambientes no mesmo arquivo.

#### Scenario: Filtro de ambiente
- **WHEN** o usuário exporta sem informar o ambiente
- **THEN** o sistema exporta apenas os documentos de produção, e o nome do arquivo indica o ambiente

#### Scenario: Exportação explícita de homologação
- **WHEN** o usuário exporta informando ambiente de homologação
- **THEN** o ZIP traz apenas documentos de homologação e o nome do arquivo os identifica como teste

### Requirement: Limite de volume por exportação
A exportação SHALL recusar períodos maiores que 92 dias e lotes acima de 5.000
documentos, com erro em português explicando como dividir o pedido.

#### Scenario: Período longo demais
- **WHEN** o usuário pede um período de 12 meses
- **THEN** a requisição é recusada com `400` e a mensagem indica o limite de 92 dias

#### Scenario: Volume acima do teto
- **WHEN** o período está dentro do limite mas contém mais de 5.000 documentos
- **THEN** a requisição é recusada com `400` orientando a fatiar por estabelecimento ou por intervalo menor

### Requirement: Exportação restrita ao tenant e à permissão
A exportação SHALL exigir a permissão `fiscal.read` e SHALL incluir apenas
documentos da empresa ativa.

#### Scenario: Isolamento entre empresas
- **WHEN** um usuário exporta o período
- **THEN** somente documentos da empresa ativa entram no ZIP, independentemente de qualquer filtro informado

