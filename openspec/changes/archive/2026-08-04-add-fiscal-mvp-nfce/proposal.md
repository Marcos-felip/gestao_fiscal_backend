## Why

O ERP já vende, recebe pagamentos e controla caixa, mas ainda não emite documento
fiscal. Para operar de verdade num PDV de varejo é preciso emitir **NFC-e (modelo
65)**. Este change entrega o MVP fiscal: configurar a empresa/estabelecimento,
guardar o certificado A1, preparar os dados fiscais dos produtos e **emitir,
consultar e cancelar NFC-e** em homologação e produção — com XML autorizado,
DANFE e QR Code.

A emissão é **nativa**: o NestJS orquestra o domínio fiscal e um microserviço
**.NET (DFe.NET)** é o motor que monta/assina o XML, fala com a SEFAZ e gera o
DANFE. A comunicação passa por uma porta `IFiscalEngine`, então o motor é
substituível sem tocar no domínio.

Escopo deliberadamente fatiado: **só NFC-e**. NF-e, NFS-e, DF-e, devoluções e
afins ficam para changes futuros, para o projeto não travar.

## What Changes

- Configuração fiscal da **empresa** (CRT, IE/IM, IBGE, contribuinte de ICMS,
  indicador de configuração completa) e do **estabelecimento emissor**
  (ambiente, série/numeração NFC-e, CSC/idCSC, certificado A1, teste SEFAZ).
- **Dados fiscais dos produtos** (NCM, CEST, CFOP, CST/CSOSN, alíquotas,
  unidade, GTIN) + indicador de produto fiscalmente completo + relatório de
  pendências.
- Mapeamento das **formas de pagamento** para os códigos fiscais (tPag) e troco.
- **Documento fiscal** unificado (`FiscalDocument`) com ciclo de status,
  histórico, **snapshot imutável** e armazenamento de XML/DANFE.
- **Emissao automatica de NFC-e** (assincrona via EventEmitter + BullMQ),
  consulta, **cancelamento**, tratamento de rejeicoes, retry idempotente e auditoria.
- **Microservico .NET (fiscal_service)** com contrato REST para emitir/cancelar/
  consultar e gerar DANFE, integrado via `IFiscalEngine`. Auth por API Key.
  Armazenamento de XML/DANFE no Supabase Storage (S3).
- **Emissão automática de NFC-e** disparada por evento `sale.confirmed`
  (EventEmitter), processada via fila BullMQ. A venda não espera a SEFAZ.
- **Microserviço .NET (fiscal_service)** em repositório separado
  (`/home/marcos/Projetos/fiscal_service`) com DDD + Clean Architecture,
  MediatR, FluentValidation, DFe.NET e QuestPDF. Stateless, sem banco.
  Integrado via `IFiscalEngine` com API Key (`X-Api-Key`).

## Capabilities

### New Capabilities
- `fiscal-configuration`: dados fiscais da empresa/estabelecimento, certificado A1, CSC, série/numeração, dados fiscais dos produtos, mapa de pagamentos e gating de configuração completa.
- `fiscal-document`: entidade de documento fiscal, ciclo de status, snapshot imutável, idempotência, armazenamento de XML/DANFE e auditoria.
- `nfce-emission`: emitir, consultar e cancelar NFC-e, gerar DANFE/QR/XML, tratar rejeições e retry.
- `fiscal-engine-integration`: contrato NestJS↔microserviço .NET (DFe.NET) via porta `IFiscalEngine`.

### Modified Capabilities
<!-- Nenhuma capability de spec existente muda de comportamento. -->

## Impact

- **Prisma/Postgres**: novas tabelas `FiscalSettings`, `FiscalDocument`,
  `FiscalStatusHistory`, `FiscalDocumentEvent`; campos fiscais em `Product`
  (ou `ProductFiscal`) e em `Company`/`Establishment`.
- **Novo servico** .NET (`fiscal_service`) em repo separado — deploy e ops separados.
  DDD + Clean Architecture, MediatR, DFe.NET, QuestPDF. Stateless, sem banco.
- **EventEmitter** (`@nestjs/event-emitter`) para desacoplar Sales de Fiscal.
  Emissao automatica na transicao para `CONCLUIDA`.
- **Fila** (BullMQ + Redis) para emissao assincrona. Redis adicionado ao docker-compose.
- **Storage** de XML/DANFE via **Supabase Storage (S3-compatible)** usando `@aws-sdk/client-s3`.
- **Seguranca**: cofre/KMS para o certificado A1; API Key (`X-Api-Key`) entre Nest e .NET.
- **Permissoes** novas: `fiscal.settings.read/edit`, `fiscal.emit`, `fiscal.cancel`, `fiscal.read`.
- Vendas ganham vinculo com o documento fiscal e status fiscal atualizado automaticamente.
- **Implementacao em 3 fases**: A (config + emissao homologacao), B (cancelamento + consulta + rejeicoes), C (producao + auditoria + docs).
