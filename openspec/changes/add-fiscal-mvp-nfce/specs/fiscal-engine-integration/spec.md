## ADDED Requirements

### Requirement: Porta do motor fiscal
O domínio fiscal do NestJS SHALL depender de uma porta `IFiscalEngine` (emitir,
consultar, cancelar NFC-e e consultar status do serviço), com implementação
concreta `DfeNetFiscalEngine` que chama o microserviço .NET. Trocar o motor SHALL
NOT exigir mudança no domínio.

#### Scenario: Domínio agnóstico ao motor
- **WHEN** a implementação do motor é substituída por outra que respeite `IFiscalEngine`
- **THEN** os casos de uso de emissão/consulta/cancelamento continuam funcionando sem alteração

### Requirement: Microserviço .NET stateless com DFe.NET
O microserviço .NET SHALL montar, assinar e transmitir o XML da NFC-e, gerar DANFE
e QR Code, e cancelar/consultar — recebendo o certificado (pfx base64 + senha) e o
ambiente por requisição, sem persistir estado.

#### Scenario: Emissão pelo motor
- **WHEN** o Nest chama `POST /nfce/emit` com o payload da nota, o certificado e o ambiente
- **THEN** o motor retorna situação, chave, protocolo, XML autorizado, DANFE, QR Code ou o motivo da rejeição

#### Scenario: Certificado protegido no canal
- **WHEN** uma chamada ao motor transporta o certificado
- **THEN** o canal é autenticado (segredo/mTLS) e o certificado/senha nunca são registrados em log
