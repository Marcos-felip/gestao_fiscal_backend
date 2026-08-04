# Módulo Fiscal — NFC-e

Documentação do módulo fiscal: arquitetura NestJS ↔ motor .NET, contrato de comunicação,
política de certificados, ambientes e storage.

> Referência de origem do contrato: `openspec/changes/add-fiscal-mvp-nfce/ENGINE_ALIGNMENT.md`.

---

## 1. Arquitetura

A emissão é dividida em dois processos: o **NestJS** cuida das regras de negócio,
da numeração, da persistência e da fila; o **`fiscal_service`** (.NET 8 / DFe.NET)
cuida do que é específico de documento fiscal — montar o XML, assinar com o
certificado A1, transmitir à SEFAZ e gerar DANFE e QR Code.

```
Venda concluída
      │  EventEmitter: sale.confirmed
      ▼
OnSaleConfirmedListener ──▶ valida pré-condições, reserva série/número,
      │                     cria FiscalDocument (PENDENTE) e enfileira
      ▼
BullMQ (fila fiscal-emission, Redis)
      ▼
FiscalEmissionProcessor ──▶ monta EmitirNfceRequest a partir do snapshot
      │                     + decripta o certificado (só aqui)
      ▼
DfeNetFiscalEngine ──HTTP──▶ fiscal_service (.NET) ──▶ SEFAZ
      ▼
Grava chave/protocolo, sobe XML e DANFE no storage S3,
atualiza FiscalDocument e Sale.fiscalStatus
```

O NestJS **nunca monta nem assina XML**. Ele envia dados estruturados; o motor é
stateless e não guarda certificado nem estado entre chamadas.

### Onde fica cada coisa

| Caminho | Responsabilidade |
|---------|------------------|
| `src/fiscal/fiscal-engine/` | Porta `IFiscalEngine` + implementação HTTP `DfeNetFiscalEngine` |
| `src/fiscal/emission/` | Snapshot da venda, builder do payload, regras/mapeamentos, pré-condições, chaves do storage |
| `src/fiscal/certificates/` | Upload, parse do .pfx, cofre AES-256-GCM e carga das credenciais |
| `src/fiscal/listeners/` | `OnSaleConfirmedListener` — emissão automática |
| `src/fiscal/jobs/` | `FiscalEmissionProcessor` — consumidor da fila |
| `src/fiscal/fiscal-operations.service.ts` | Cancelamento, consulta, retry, status SEFAZ, saúde do motor |
| `src/queue/` | Configuração do BullMQ e nome da fila (`fiscal-emission`) |
| `src/storage/` | Cliente S3 (Supabase Storage) para XML e DANFE |

---

## 2. Contrato do motor fiscal (`fiscal_service`)

- **Host:** HTTP na porta **8080**, **sem** prefixo de versão (não existe `/api/v1`).
- **Autenticação:** header **`X-Api-Key`** em toda chamada (o motor lê de `FISCAL_API_KEY`
  e **não sobe** sem ela). `/health` e `/swagger` são isentos.
- **Certificado:** viaja **no corpo** de toda requisição, como `certificadoBase64` (.pfx em
  base64) + `certificadoSenha`. Não é header, não é arquivo, não fica no motor.
- **Todos os verbos são POST**, inclusive consulta e status do serviço — porque precisam
  do certificado no corpo.
- **Rejeição de negócio da SEFAZ chega como HTTP 400**, com corpo útil. Só
  `status-servico` responde sempre 200.

### Rotas

| Método | Rota | Uso |
|--------|------|-----|
| POST | `/api/nfce/emit` | Emitir: recebe dados estruturados, monta, assina e transmite |
| POST | `/api/nfce/consulta` | Consultar a situação pela chave de acesso |
| POST | `/api/nfce/cancel` | Cancelar por chave + protocolo + justificativa |
| POST | `/api/sefaz/status-servico` | Testar comunicação com a SEFAZ da UF |
| GET | `/health` | Sonda de saúde (isenta de autenticação) |

### `POST /api/nfce/emit` — requisição

Campos do topo: `emitente{}`, `destinatario?{}`, `itens[]`, `pagamentos[]`, `valorTotal`,
`certificadoBase64`, `certificadoSenha`, `codigoCsc`, `idCsc`, `serie` (1–999),
`numero` (1–999999999), `ambiente`.

| Bloco | Campos e restrições |
|-------|---------------------|
| `emitente` | `cnpj` (válido), `razaoSocial` (≤60), `nomeFantasia?`, `inscricaoEstadual` (≤14), `crt` (`"1"`/`"2"`/`"3"`, **string**), `logradouro`, `numero`, `complemento?`, `bairro`, `codigoMunicipio` (IBGE, 7 dígitos), `municipio`, `uf` (2), `cep` (8 dígitos), `telefone?`, `email?` |
| `destinatario?` | Bloco **opcional** — omitir por completo para consumidor não identificado. `cpfCnpj?`, `nome?` e endereço (o motor só monta o endereço quando `logradouro` e `uf` vêm juntos). Em homologação o nome é substituído pelo texto legal |
| `itens[]` | `numeroItem`, `codigoProduto` (≤60), `descricao` (≤120), `ncm` (8 dígitos), `cest?` (7), `cfop` (4 dígitos, **começa com 5**), `unidadeComercial` (≤6), `quantidade` (>0), `valorUnitario` (>0), `gtin?` (vazio = "SEM GTIN"; senão 8/12/13/14 com DV válido), `origem` (0–8), `csosn` |
| `pagamentos[]` | `tipo` (**string textual**) e `valor` (>0) |

**Não há base de cálculo nem alíquota no item:** o motor deriva o ICMS de `origem` +
`csosn`, e PIS/COFINS ficam com CST 07.

**Consistência exigida:** Σ itens = `valorTotal` = Σ pagamentos, com tolerância de 0,01.

**Troco:** o contrato do motor não tem grupo de troco (`vTroco`) — `pagamentos[]` só
aceita `tipo` e `valor`. O valor recebido e o troco são calculados a partir dos
`SalePayment` (`amountReceived`/`changeGiven`) e congelados no snapshot, em
`recebimento: { valorRecebido, troco }`, para auditoria e reimpressão. **Não são
enviados na emissão.** Levar `vTroco` ao XML depende de o `fiscal_service` passar a
aceitar o campo.

### `POST /api/nfce/emit` — resposta

```jsonc
{
  "sucesso": true,
  "chaveAcesso": "...",           // 44 dígitos
  "protocolo": "...",             // 15 dígitos
  "xmlAutorizadoBase64": "...",   // nfeProc completo, base64 UTF-8
  "danfeBase64": "...",           // PDF em base64
  "qrCode": "https://...",        // string de URL, não imagem
  "rejeicao": { "codigo": "...", "mensagem": "...", "retornoTecnico": "..." }
}
```

HTTP 200 quando `sucesso`; **400 em rejeição, erro de validação ou certificado inválido**;
401 em falha de autenticação; 500 em erro interno.

### Demais respostas

| Rota | Requisição | Resposta |
|------|-----------|----------|
| `consulta` | `chaveAcesso`, cert, `ambiente` | `{ sucesso, status?, protocolo?, xmlConsultaBase64?, mensagemErro? }` |
| `cancel` | `chaveAcesso`, `protocoloAutorizacao` (15 dígitos), `justificativa` (15–255), cert, `ambiente` | `{ sucesso, protocolo?, xmlCancelamentoBase64?, motivoRejeicao? }` — UF e CNPJ são derivados da chave |
| `status-servico` | `ambiente`, `uf`, cert | `{ disponivel, mensagem?, tempoMedioResposta? }` (sempre 200) |

### Enums aceitos (strings no JSON)

| Campo | Valores |
|-------|---------|
| `ambiente` | `homologacao`, `producao` (ou `"1"`, `"2"`) |
| `crt` | `"1"`, `"2"`, `"3"` (ou `simples_nacional`, `simples_nacional_excesso`, `regime_normal`) |
| `pagamentos[].tipo` | `dinheiro`, `cheque`, `cartao_credito`, `cartao_debito`, `credito_loja`, `vale_alimentacao`, `vale_refeicao`, `vale_presente`, `vale_combustivel`, `boleto`, `pix`, `sem_pagamento`, `outro` — **enviar a string**, o motor resolve o `tPag` numérico |
| `origem` | inteiro de 0 a 8 |
| `csosn` (Simples, CRT 1/2) | **102, 103, 300, 400, 500** |
| CST de ICMS (Normal, CRT 3) | **40, 41, 50** |

Qualquer CSOSN/CST fora desses conjuntos é rejeitado na validação do motor. As mesmas
regras são aplicadas antes no Nest (`src/fiscal/emission/fiscal-rules.ts`) para falhar
cedo, com mensagem amigável, sem gastar uma numeração.

### Envelope de erro genérico

```jsonc
{ "codigo": "VALIDACAO", "mensagem": "...", "erros": [{ "campo": "...", "mensagem": "..." }], "timestamp": "..." }
```

`codigo ∈ VALIDACAO | CERT_INVALIDO | ARG_INVALIDO | AUTH_FALHA | CONFIG_INVALIDA | ERRO_INTERNO`.

---

## 3. Como o NestJS trata as respostas

`DfeNetFiscalEngine` separa **recusa de negócio** de **falha de transporte** — a distinção
define se vale a pena reprocessar:

| Situação | Tratamento |
|----------|-----------|
| HTTP 200 com `sucesso: true` | Resultado autorizado |
| HTTP 400, ou 200 com `sucesso: false` | **Rejeição** → `sucesso: false` + `rejeicao{codigo, mensagem, retornoTecnico}`. Documento vai a `REJEITADO`. Reprocessar não adianta |
| HTTP 401/403 | `FiscalEngineTransportError` (`AUTH`) — verificar `FISCAL_ENGINE_API_KEY` |
| Demais HTTP ≠ 200/400 | `FiscalEngineTransportError` (`SERVER`) |
| Rede indisponível / timeout | `FiscalEngineTransportError` (`NETWORK` / `TIMEOUT`) |
| Corpo fora do formato esperado | `FiscalEngineTransportError` (`INVALID_RESPONSE`) |

Falhas de transporte sobem para a fila reprocessar (3 tentativas, backoff exponencial de
5s). Rejeições, não. Todo verbo tem timeout (`FISCAL_ENGINE_TIMEOUT`, 30s por padrão).

O certificado e a senha **nunca** entram em log.

---

## 4. Certificado digital A1

- Entra por **upload multipart** (`.pfx`/`.p12` + senha), limite de **512 KB**.
- É validado na hora — a leitura do arquivo só funciona com a senha correta — e dele são
  extraídos **titular, subject e validade**.
- Fica **cifrado em AES-256-GCM** no banco, em envelope versionado
  (`v1:<iv>:<tag>:<conteúdo>`, tudo em base64), com a chave de
  `FISCAL_CERT_ENCRYPTION_KEY` (32 bytes em base64 ou hexadecimal).
- Volta a texto claro **só na borda** da chamada ao motor (`loadCredentials`), dentro do
  processor ou da operação fiscal. Nunca aparece em log nem em resposta de API.
- **Substituição** fica registrada em auditoria, com o certificado anterior, o novo titular
  e quem trocou.
- **Certificado vencido bloqueia a emissão** antes de chegar ao motor.

Gerar a chave do cofre:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Sem `FISCAL_CERT_ENCRYPTION_KEY` configurada, o upload é recusado com mensagem explícita —
o certificado nunca é gravado em texto claro como alternativa.

---

## 5. Ambientes, série e numeração

- O ambiente é **por estabelecimento**, em `FiscalSettings.ambiente`
  (`HOMOLOGACAO` / `PRODUCAO`), e viaja em toda chamada ao motor.
- Cada estabelecimento tem **série** e **próximo número** próprios. A numeração é
  reservada de forma atômica na criação do `FiscalDocument`, antes de enfileirar — o
  retry reaproveita a mesma série e número, nunca gera um novo.
- **CSC e idCSC** (código de segurança do contribuinte, usado no QR Code) também são por
  estabelecimento e mudam entre homologação e produção.
- Em homologação a SEFAZ exige a razão social do destinatário substituída pelo texto legal
  — quem faz isso é o motor.

---

## 6. Storage de XML e DANFE

Arquivos vão para um bucket S3 privado (Supabase Storage), organizados por empresa e
competência:

```
fiscal/{companyId}/{ano}/{mes}/{chaveAcesso}.xml
fiscal/{companyId}/{ano}/{mes}/{chaveAcesso}.pdf
fiscal/{companyId}/{ano}/{mes}/{chaveAcesso}-cancelamento.xml
```

O banco guarda **a chave do storage**, não uma URL — o bucket é privado e o download passa
pela API, com permissão verificada. Documentos antigos (ou emitidos com o storage não
configurado) guardam o XML direto na coluna; o código distingue os dois casos pelo prefixo
`fiscal/`.

---

## 7. Endpoints do NestJS

Base: `/api/v1/fiscal`. Todos exigem JWT + empresa ativa; a coluna indica a permissão
adicional. O contrato HTTP para o frontend não muda quando o motor muda.

| Método | Rota | Permissão |
|--------|------|-----------|
| POST | `/settings` | `fiscal.settings.edit` |
| GET | `/settings` | `fiscal.settings.read` |
| GET | `/settings/:establishmentId` | `fiscal.settings.read` |
| PATCH | `/settings/:establishmentId` | `fiscal.settings.edit` |
| POST | `/settings/:establishmentId/certificate` | `fiscal.settings.edit` |
| GET | `/settings/:establishmentId/certificate` | `fiscal.settings.read` |
| GET | `/settings/:establishmentId/certificate/history` | `fiscal.settings.read` |
| POST | `/settings/:establishmentId/sefaz-status` | `fiscal.settings.read` |
| GET | `/engine/health` | `fiscal.settings.read` |
| GET | `/documents` | `fiscal.read` |
| GET | `/documents/:id` | `fiscal.read` |
| GET | `/documents/sale/:saleId` | `fiscal.read` |
| GET | `/documents/:id/history` | `fiscal.read` |
| GET | `/documents/:id/events` | `fiscal.read` |
| GET | `/documents/:id/danfe` | `fiscal.read` |
| GET | `/documents/:id/xml/:tipo` | `fiscal.read` |
| POST | `/documents/nfce` | `fiscal.emit` |
| POST | `/documents/:id/retry` | `fiscal.emit` |
| POST | `/documents/:id/consulta` | `fiscal.read` |
| POST | `/documents/:id/cancel` | `fiscal.cancel` |

`GET /fiscal/engine/health` sonda o `/health` do motor: não usa certificado, não fala com
a SEFAZ e **não lança** quando o motor está fora — devolve
`{ disponivel: false, mensagem, latenciaMs }`. É o ponto de integração com monitoramento.
Para testar a comunicação com a **SEFAZ** (que exige certificado), use
`POST /fiscal/settings/:establishmentId/sefaz-status`.

---

## 8. Variáveis de ambiente

| Variável | Padrão | Papel |
|----------|--------|-------|
| `FISCAL_ENGINE_URL` | `http://localhost:8080` | Base do motor .NET |
| `FISCAL_ENGINE_API_KEY` | — | Valor do header `X-Api-Key`; **é o mesmo `FISCAL_API_KEY` do motor** |
| `FISCAL_ENGINE_TIMEOUT` | `30000` | Timeout (ms) dos verbos fiscais |
| `FISCAL_ENGINE_HEALTH_TIMEOUT` | `5000` | Timeout (ms) da sonda `/health` |
| `FISCAL_CERT_ENCRYPTION_KEY` | — | Chave do cofre do certificado (32 bytes, base64 ou hex) |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / — | BullMQ |
| `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` / `S3_BUCKET` | — / — / — / `us-east-1` / `fiscal-documents` | Storage de XML e DANFE |
| `FISCAL_SERVICE_PATH` | `../fiscal_service` | Só no compose: repositório do motor a construir |
| `FISCAL_SERVICE_ENV` | `Development` | Só no compose: ambiente do ASP.NET (`Development` expõe o Swagger) |
| `FISCAL_ENGINE_HOST_PORT` | `8080` | Só no compose: porta publicada do motor |

Sem `FISCAL_ENGINE_API_KEY` o Nest sobe, mas registra um aviso no boot — o motor
responderá 401 a todas as chamadas.

---

## 9. Subir o motor localmente

O `fiscal_service` está num repositório separado e é **opcional** no compose: fica atrás
do profile `fiscal`, para que `docker compose up -d` continue subindo só Postgres, Redis e
pgAdmin.

```bash
# Postgres + Redis + pgAdmin (padrão)
docker compose up -d

# Adiciona o motor fiscal (exige o repositório clonado em FISCAL_SERVICE_PATH)
docker compose --profile fiscal up -d
```

Antes de subir com o profile, defina no `.env`:

```env
FISCAL_ENGINE_API_KEY=uma-chave-forte
FISCAL_SERVICE_PATH=../fiscal_service
```

A mesma chave é usada dos dois lados: o Nest a envia em `X-Api-Key`, o motor a lê de
`FISCAL_API_KEY`. Com o motor rodando, confira a integração em
`GET /api/v1/fiscal/engine/health`.

---

## 10. Modelo de dados

| Tabela | Conteúdo |
|--------|----------|
| `fiscal_settings` | 1:1 com estabelecimento: ambiente, série, próximo número, CSC/idCSC, refs cifradas do certificado, validade e subject |
| `fiscal_documents` | Documento fiscal: modelo, série, número, chave, status, ambiente, protocolo, rejeição, datas, valores, XMLs, DANFE, QR Code, `idempotencyKey`, `attempts`, engine e **snapshot** |
| `fiscal_status_history` | Toda transição de status, com motivo, usuário e data |
| `fiscal_document_events` | Eventos do documento (no MVP, o cancelamento) |
| `fiscal_certificate_events` | Auditoria de envio e substituição de certificado |

O **snapshot** (JSONB) congela emitente, destinatário, itens, impostos, pagamentos e
totais no momento da emissão: alterar produto ou cliente depois não muda o que foi
enviado à SEFAZ. Documento fiscal é append-only — não há exclusão física.

---

## Documentações relacionadas

- [API.md](./API.md) — contratos de API
- [REGRAS_DE_NEGOCIO.md](./REGRAS_DE_NEGOCIO.md) — regras de negócio
- [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md) — modelagem do banco
