# nfe-import Specification

## Purpose
TBD - created by archiving change importar-nota-de-entrada-por-xml. Update Purpose after archive.
## Requirements
### Requirement: Importar a NF-e de entrada a partir do XML
O sistema SHALL aceitar o XML de uma NF-e de entrada e dele extrair emitente,
itens, valores, impostos e duplicatas, sem exigir redigitação.

O XML é a fonte da verdade do que o fornecedor faturou. Reconstituí-lo à mão é o
que hoje faz a entrada de mercadoria ser lançada como movimentação solta, sem
custo e sem documento.

#### Scenario: XML válido de NF-e
- **WHEN** o usuário envia o XML de uma NF-e autorizada emitida contra o CNPJ da empresa
- **THEN** o sistema registra a importação com emitente, itens e duplicatas lidos do arquivo

#### Scenario: Arquivo que não é NF-e
- **WHEN** o arquivo enviado não é um XML de NF-e (modelo 55) autorizado
- **THEN** a importação é recusada em português, dizendo o que o arquivo é

#### Scenario: Nota emitida contra outro CNPJ
- **WHEN** o destinatário do XML não é nenhum estabelecimento da empresa ativa
- **THEN** a importação é recusada, nomeando o CNPJ do destinatário da nota

### Requirement: Cada XML entra uma vez só
O sistema SHALL recusar a importação de uma chave de acesso já importada pela
mesma empresa, informando qual compra a consumiu.

Importar duas vezes dobraria o estoque e o contas a pagar da mesma mercadoria —
e o erro só apareceria no inventário, meses depois.

#### Scenario: XML repetido
- **WHEN** o usuário envia um XML cuja chave de acesso já foi importada
- **THEN** a importação é recusada com o número da compra que já existe

#### Scenario: Mesma chave em outra empresa
- **WHEN** outra empresa da plataforma importa a mesma chave
- **THEN** a importação é aceita — a unicidade é por empresa

### Requirement: Fornecedor reconhecido ou criado pelo emitente
O sistema SHALL localizar o fornecedor pelo CNPJ do emitente e, quando não
existir, SHALL criá-lo com nome, nome fantasia, endereço e inscrição estadual do
XML.

#### Scenario: Fornecedor já cadastrado
- **WHEN** existe parceiro ativo com o CNPJ do emitente
- **THEN** a compra é vinculada a ele, sem duplicá-lo

#### Scenario: Fornecedor novo
- **WHEN** nenhum parceiro tem o CNPJ do emitente
- **THEN** um parceiro fornecedor é criado com os dados da nota

### Requirement: Casamento de item com o catálogo, memorizado por fornecedor
O sistema SHALL casar cada item do XML com um produto do catálogo tentando, nesta
ordem, o **GTIN** e o **código que aquele fornecedor usou** numa importação
anterior; e SHALL guardar a escolha do usuário para os itens que sobrarem.

Descrição não serve de chave: o fornecedor escreve "REFRIG LATA 350" e o catálogo
diz "Refrigerante Lata 350ml". Memorizar por fornecedor é o que faz a segunda
nota do mesmo fornecedor não perguntar nada.

#### Scenario: Item com GTIN conhecido
- **WHEN** o item traz um GTIN que corresponde ao código de barras de um produto
- **THEN** o item já vem casado, sem perguntar

#### Scenario: Item já casado antes pelo mesmo fornecedor
- **WHEN** o código do item é o mesmo de uma importação anterior daquele fornecedor
- **THEN** o item já vem casado com o produto escolhido naquela vez

#### Scenario: Item novo
- **WHEN** o item não casa por GTIN nem por código do fornecedor
- **THEN** ele fica pendente de escolha, e a importação diz quantos itens faltam resolver

#### Scenario: Escolha memorizada
- **WHEN** o usuário aponta a que produto um item corresponde
- **THEN** a correspondência entre o código daquele fornecedor e o produto é guardada para as próximas notas

#### Scenario: Unidade divergente
- **WHEN** a unidade comercial do XML difere da unidade do produto casado
- **THEN** o item é casado, mas a divergência é apontada antes de confirmar

### Requirement: A importação vira compra em rascunho, nunca estoque
A confirmação da importação SHALL criar uma **Compra em RASCUNHO** com os itens
casados, e SHALL NOT movimentar estoque nem gerar títulos.

O estoque continua sendo movimentado só pela confirmação da compra, por uma
pessoa que olhou. Um XML com item duplicado, unidade diferente ou devolução
embutida corromperia o saldo sem ninguém ver.

#### Scenario: Importação confirmada
- **WHEN** todos os itens estão casados e o usuário confirma a importação
- **THEN** nasce uma compra em RASCUNHO vinculada à importação, e o estoque não é tocado

#### Scenario: Item pendente
- **WHEN** algum item ainda não foi casado
- **THEN** a confirmação é recusada, nomeando os itens que faltam

#### Scenario: Condição de pagamento vinda das duplicatas
- **WHEN** o XML traz duplicatas
- **THEN** a compra nasce A_PRAZO com as parcelas e vencimentos da nota; sem duplicatas, nasce A_VISTA

### Requirement: O XML importado fica guardado
O sistema SHALL guardar o XML de cada importação, associado à compra que o
originou, e SHALL NOT expor rota de download dele.

Quem importa por upload já tem o arquivo — devolvê-lo seria funcionalidade sem
uso. O guardado serve a duas coisas que ainda não existem na tela: a busca na
SEFAZ, onde o XML só existe dentro do sistema, e o reprocessamento de uma nota
quando o parser melhorar.

#### Scenario: XML guardado
- **WHEN** uma importação é registrada e o storage está disponível
- **THEN** o arquivo é guardado como foi recebido, sem reescrita

#### Scenario: Storage indisponível
- **WHEN** o storage falha ao guardar
- **THEN** a importação segue mesmo assim — a nota já foi lida, e perder a conferência por falha de infraestrutura seria pior

### Requirement: Importação recusada deixa rastro
O sistema SHALL registrar a importação mesmo quando ela não vira compra, com o
motivo e o resultado do casamento de cada item.

Sumir com o que falhou obriga a reimportar para descobrir o que faltava.

#### Scenario: Importação com itens pendentes
- **WHEN** a importação é interrompida com itens sem casar
- **THEN** ela permanece consultável, com a situação de cada item preservada

