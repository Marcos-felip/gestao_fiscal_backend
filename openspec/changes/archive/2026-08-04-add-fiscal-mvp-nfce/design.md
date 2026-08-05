## Context

Emissão fiscal brasileira exige: certificado ICP-Brasil (A1), assinatura XML-DSig,
comunicação SOAP com a SEFAZ da UF, validação de XSD, geração de DANFE e regras de
numeração/contingência. Não há biblioteca Node madura para isso; a escolha do
projeto é **emissão nativa com DFe.NET (.NET)**. O backend do ERP é NestJS. Logo, a
solução é poliglota: NestJS orquestra, um microserviço .NET é o motor fiscal.

**Repositório do motor fiscal:** `/home/marcos/Projetos/fiscal_service/`
- .NET 8 + DFe.NET + MediatR + QuestPDF + FluentValidation
- DDD + Clean Architecture em 4 layers (Api, Application, Domain, Infrastructure)
- Stateless, sem banco de dados, sem EF Core
- Autenticação via API Key (`X-Api-Key` header)

## Goals / Non-Goals

**Goals:**
- Emitir/consultar/cancelar **NFC-e (65)** em homologação e produção.
- Domínio fiscal agnóstico ao motor (porta `IFiscalEngine`).
- Snapshot imutável, idempotência e auditoria desde o MVP.
- Certificado A1 nunca em texto no banco/log.
- Emissão automática disparada pela confirmação da venda (event-driven).

**Non-Goals (fora deste change):**
- NF-e (55), NFS-e, DF-e, manifestação, devoluções, CC-e, complementar.
- Contingência avançada, motor tributário genérico, CT-e/MDF-e, SPED.

## Decisions

- **Divisão de responsabilidades**: NestJS = config, `FiscalDocument`, numeração,
  snapshot, status, fila, storage, endpoints. Microserviço **.NET** = montar XML,
  assinar, transmitir SEFAZ, tratar retorno, gerar DANFE/QR, cancelar, consultar.
- **Porta `IFiscalEngine`** (implementação `DfeNetFiscalEngine` chamando o serviço
  .NET por HTTP REST com API Key). Troca de motor não afeta o domínio.
- **Motor stateless**: o certificado (pfx base64 + senha) e o ambiente vão **por
  requisição**; o .NET não persiste nada.
- **Emissão automática via EventEmitter**: quando a venda transita para `CONCLUIDA`,
  o `SalesService` emite o evento `sale.confirmed` via `@nestjs/event-emitter`.
  O `FiscalService` escuta o evento, valida pré-condições, reserva numeração e
  enfileira o processamento (BullMQ). A venda não espera a SEFAZ.
- **BullMQ + Redis**: fila assíncrona para emissão. Redis adicionado ao
  `docker-compose.yml`. Job processa: monta snapshot, chama motor, atualiza status.
- **Numeração atômica** por série+estabelecimento (transação + advisory lock),
  para nunca repetir/pular número indevidamente.
- **Idempotência** por `idempotencyKey` (venda+estabelecimento) evita nota
  duplicada em retry/concorrência.
- **Snapshot** em JSONB no documento na hora da emissão (emitente, destinatário,
  itens, impostos, pagamentos, totais). Notas antigas não dependem dos cadastros.
- **Storage**: XML/DANFE em **Supabase Storage (S3-compatible)** usando
  `@aws-sdk/client-s3`. Organização: `fiscal/{companyId}/{ano}/{mes}/{chave-acesso}.xml`.
  Refs no banco.
- **Certificado**: criptografado em cofre/KMS no Nest; decriptado só na borda da
  chamada ao motor.
- **Desacoplamento Sales↔Fiscal**: `@nestjs/event-emitter` para comunicação.
  `SalesModule` não importa `FiscalModule`. O listener `OnSaleConfirmed` fica
  no `FiscalModule`.

## Phases

O MVP é dividido em 3 fases para entregas incrementais:

- **Fase A** (~40 tasks): Fundação, configuração empresa/estabelecimento, dados
  fiscais dos produtos, pagamentos, FiscalDocument, IFiscalEngine, emissão em
  homologação, hook automático, BullMQ + Redis + Supabase S3.
- **Fase B** (~15 tasks): Consulta SEFAZ, cancelamento, tratamento de rejeições,
  retry idempotente, central de rejeições.
- **Fase C** (~22 tasks): Separação homologação/produção, checklist de ativação,
  auditoria completa, documentação (API.md, REGRAS_DE_NEGOCIO.md, FISCAL.md).

## Risks / Trade-offs

- **Stack poliglota** (.NET + Node): mais complexidade de deploy/observabilidade.
  Mitigação: contrato estreito e versionado, health check, testes de contrato.
- **Certificado trafega Nest→.NET**: API Key no canal interno (rede privada).
  Nunca logar o pfx/senha.
- **SEFAZ lenta/indisponível**: emissão assíncrona + status `PROCESSANDO`/`ERRO`
  + retry idempotente; contingência fica para change futuro.
- **Homologação × produção**: risco de emitir em produção por engano. Mitigação:
  flag explícita + checklist de ativação + validações de ambiente.
- **EventEmitter vs acoplamento direto**: EventEmitter desacopla Sales de Fiscal,
  mas adiciona complexidade de debug. Mitigação: logs estruturados, eventos
  tipados com payloads validados.
