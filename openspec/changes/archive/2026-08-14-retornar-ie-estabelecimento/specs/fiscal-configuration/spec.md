## MODIFIED Requirements

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
