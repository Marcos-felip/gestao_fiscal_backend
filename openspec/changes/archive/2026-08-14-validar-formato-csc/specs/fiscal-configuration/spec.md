## MODIFIED Requirements

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
