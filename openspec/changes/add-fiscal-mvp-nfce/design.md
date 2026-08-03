## Context

Emissão fiscal brasileira exige: certificado ICP-Brasil (A1), assinatura XML-DSig,
comunicação SOAP com a SEFAZ da UF, validação de XSD, geração de DANFE e regras de
numeração/contingência. Não há biblioteca Node madura para isso; a escolha do
projeto é **emissão nativa com DFe.NET (.NET)**. O backend do ERP é NestJS. Logo, a
solução é poliglota: NestJS orquestra, um microserviço .NET é o motor fiscal.

## Goals / Non-Goals

**Goals:**
- Emitir/consultar/cancelar **NFC-e (65)** em homologação e produção.
- Domínio fiscal agnóstico ao motor (porta `IFiscalEngine`).
- Snapshot imutável, idempotência e auditoria desde o MVP.
- Certificado A1 nunca em texto no banco/log.

**Non-Goals (fora deste change):**
- NF-e (55), NFS-e, DF-e, manifestação, devoluções, CC-e, complementar.
- Contingência avançada, motor tributário genérico, CT-e/MDF-e, SPED.

## Decisions

- **Divisão de responsabilidades**: NestJS = config, `FiscalDocument`, numeração,
  snapshot, status, fila, storage, endpoints. Microserviço **.NET** = montar XML,
  assinar, transmitir SEFAZ, tratar retorno, gerar DANFE/QR, cancelar, consultar.
- **Porta `IFiscalEngine`** (implementação `DfeNetFiscalEngine` chamando o serviço
  .NET por HTTP REST autenticado). Troca de motor não afeta o domínio.
- **Motor stateless**: o certificado (pfx base64 + senha) e o ambiente vão **por
  requisição**; o .NET não persiste nada.
- **Emissão assíncrona**: a venda não espera a SEFAZ. `POST /fiscal/nfce` cria o
  documento (PENDENTE), reserva numeração e enfileira (BullMQ); um job chama o
  motor e atualiza o status.
- **Numeração atômica** por série+estabelecimento (transação + advisory lock),
  para nunca repetir/pular número indevidamente.
- **Idempotência** por `idempotencyKey` (venda+estabelecimento) evita nota
  duplicada em retry/concorrência.
- **Snapshot** em JSONB no documento na hora da emissão (emitente, destinatário,
  itens, impostos, pagamentos, totais). Notas antigas não dependem dos cadastros.
- **Storage**: XML/DANFE em object storage (S3/MinIO) com refs no banco; aceitável
  começar com `text`/`bytea` no banco.
- **Certificado**: criptografado em cofre/KMS no Nest; decriptado só na borda da
  chamada ao motor.

## Risks / Trade-offs

- **Stack poliglota** (.NET + Node): mais complexidade de deploy/observabilidade.
  Mitigação: contrato estreito e versionado, health check, testes de contrato.
- **Certificado trafega Nest→.NET**: exige canal interno seguro (mTLS/segredo,
  rede privada). Nunca logar o pfx/senha.
- **SEFAZ lenta/indisponível**: emissão assíncrona + status `PROCESSANDO`/`ERRO`
  + retry idempotente; contingência fica para change futuro.
- **Homologação × produção**: risco de emitir em produção por engano. Mitigação:
  flag explícita + checklist de ativação + validações de ambiente.
