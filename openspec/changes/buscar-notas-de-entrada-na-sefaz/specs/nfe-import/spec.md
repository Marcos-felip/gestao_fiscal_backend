> Delta sobre a capacidade criada por `importar-nota-de-entrada-por-xml`.
> Requisitos **acrescentados**: nada do que a irmã definiu muda de comportamento.

## ADDED Requirements

### Requirement: XML vindo da SEFAZ importa como o enviado à mão
A importação SHALL aceitar XML obtido pela distribuição de documentos, seguindo o
mesmo caminho do XML enviado por upload.

A origem do arquivo não muda nada do que vem depois: mesma leitura, mesmo
casamento por GTIN e código do fornecedor, mesma compra em RASCUNHO. Dois
caminhos de importação divergiriam e um deles envelheceria.

#### Scenario: Importação de nota descoberta na SEFAZ
- **WHEN** o usuário importa uma nota cujo XML veio da distribuição
- **THEN** o casamento e a compra em rascunho acontecem como no upload

#### Scenario: Origem registrada
- **WHEN** uma importação é consultada
- **THEN** ela informa se o XML veio de upload ou da SEFAZ

### Requirement: A mesma chave não entra duas vezes por caminhos diferentes
A importação SHALL recusar o XML cuja chave de acesso já foi importada, mesmo que
a primeira tenha vindo pelo outro caminho.

O caso é esperado, não excepcional: o fornecedor manda o XML por e-mail **e** a
SEFAZ o entrega pela distribuição.

#### Scenario: Upload de nota já baixada da SEFAZ
- **WHEN** o usuário envia por upload o XML de uma nota já importada pela distribuição
- **THEN** a importação é recusada com o número da compra que já existe
