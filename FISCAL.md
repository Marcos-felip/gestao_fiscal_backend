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
| POST | `/api/eventos/carta-correcao` | CC-e (evento 110110) por chave + sequência + texto |
| POST | `/api/eventos/inutilizar` | Inutilizar faixa de numeração (não é evento de documento) |
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
| `carta-correcao` | `chaveAcesso`, `correcao` (15–1000), `sequenciaEvento` (1–20), `cpfCnpj`, cert, `ambiente` | `{ sucesso, protocolo?, xmlEventoBase64?, condicaoDeUso, motivoRejeicao? }` — a condição de uso volta **nos dois casos** |
| `inutilizar` | `cnpj`, `ano`, `modelo` (55/65), `serie`, `numeroInicial`, `numeroFinal`, `justificativa` (15–255), `uf`, cert, `ambiente` | `{ sucesso, protocolo?, xmlInutilizacaoBase64?, motivoRejeicao? }` — **a UF vai no corpo**: não há chave de acesso de onde deduzi-la |
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

**Homologação e produção são configurações separadas.** `FiscalSettings` tem uma linha
por `(estabelecimento, ambiente)`: série, numeração, CSC/idCSC e certificado de cada
ambiente são independentes — a numeração de teste nunca contamina a real. A linha com
`ativo = true` é a **configuração em uso**; no máximo uma por estabelecimento.

- A numeração é reservada de forma atômica na criação do `FiscalDocument`, antes de
  enfileirar — o retry reaproveita a mesma série e número, nunca gera um novo.
- O documento carimba o `ambiente` na criação. O processor busca o CSC e o certificado
  **daquele** ambiente, não do que estiver ativo agora.
- Em homologação a SEFAZ exige a razão social do destinatário substituída pelo texto legal
  — quem faz isso é o motor.

### CSC — por que o formato é validado

O CSC não assina a nota: ele entra no **hash do QR Code**. O motor monta os parâmetros
`chave|versão|tpAmb|cIdToken`, concatena o CSC, aplica SHA-1 e publica o resultado no QR.
A SEFAZ refaz a mesma conta com o CSC que tem cadastrado e compara.

Consequência: **um CSC errado não falha em lugar nenhum do caminho.** Ele passa no cadastro,
passa na pré-condição, monta um XML válido, é assinado, transmitido — e só volta como
**rejeição 464, "QR-Code com hash inválido"**, com a numeração da nota já consumida. A
mensagem da SEFAZ não menciona o CSC, o que faz o diagnóstico começar pelo lugar errado.

Foi exatamente o que aconteceu em 10/08/2026: um CSC de 6 dígitos gravado no cadastro. A
prova só fechou recalculando o SHA-1 de `chave|2|2|1` + o CSC do banco à mão e reproduzindo
o hash rejeitado.

Por isso o formato é conferido em três pontos, todos alimentados por `isCscValido` e
`isIdCscValido` em `fiscal-rules.ts`:

| Onde | O que faz |
|---|---|
| DTOs de `FiscalSettings` | recusa no cadastro, com `400` e mensagem em PT-BR |
| `fiscal-preconditions.ts` | vira pendência de configuração, distinguindo ausente de malformado |
| `emit-request.builder.ts` | bloqueia **antes** de o job consumir numeração |

`codigoCsc`: 16 a 64 caracteres alfanuméricos. O mínimo é 16, e não 32, porque o tamanho
varia por UF — MG emite 32 hexadecimais, outras 36. `idCsc`: 1 a 6 dígitos, que é o
`cIdToken` preenchido com zeros à esquerda.

O CSC é segredo: não vai para log, mensagem de erro nem auditoria.

### O que cada modelo exige para produção

O checklist é apurado a partir de `fiscal_settings.modelos_emitidos`, e só cobra
o que se aplica:

| Exigência | NFC-e | NF-e |
|---|:---:|:---:|
| Certificado A1 válido | ✅ | ✅ |
| CSC e ID do CSC de produção | ✅ | — |
| Consulta pública validada | ✅ (aviso) | — |
| Série e próximo número | ✅ | ✅ (própria) |

Sem esse campo o checklist não distinguia "não configurou CSC" de "não emite
NFC-e": bloqueava quem vende só para empresa, e ao mesmo tempo liberava produção
sem ninguém ter olhado a numeração do modelo 55.

### Ativação da produção

Emitir em produção exige **liberação explícita**, para que nenhuma nota real saia por
engano com dados de teste:

1. Crie a configuração de produção: `POST /fiscal/settings` com `ambiente: "PRODUCAO"`.
2. Envie o certificado e o CSC de produção — o upload aceita `?ambiente=PRODUCAO`, então
   dá para preparar a produção sem sair da homologação.
3. Confira `GET /fiscal/settings/:establishmentId/producao/checklist`: certificado
   enviado, certificado vigente, CSC e idCSC preenchidos, série entre 1 e 999 e próximo
   número entre 1 e 999999999.
4. `POST /fiscal/settings/:establishmentId/producao/liberar` — recusa enquanto faltar
   qualquer item.
5. `POST /fiscal/settings/:establishmentId/ambientes/PRODUCAO/ativar` para passar a emitir
   em produção.

`POST .../producao/revogar` desfaz a liberação e devolve o estabelecimento à homologação.
Enquanto `producaoLiberada` for falso, a emissão em produção é barrada nas pré-condições,
antes de reservar numeração.

Trocas de **série**, de **CSC**, de **ambiente** e a liberação/revogação da produção ficam
registradas em `fiscal_settings_events` e saem em
`GET /fiscal/settings/:establishmentId/history`. O valor do CSC nunca é gravado na
auditoria — só o idCSC, que o identifica.

A liberação registra **quais modelos** foram liberados (`valorNovo: "NFC-e, NF-e"`), e a
revogação, quais deixaram de valer (`valorAnterior`). Gravar `true`/`false` não bastava: os
modelos emitidos mudam depois do evento, e a trilha não permitia reconstituir o que estava
liberado naquele instante.

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

A resolução dos dois formatos está num lugar só (`lerXmlArmazenado`, em `fiscal.service.ts`),
usada tanto pelo download individual quanto pela exportação em lote. Ela devolve `null`
quando o arquivo não é recuperável, e quem chama decide o que isso significa: `404` no
download de um documento, linha marcada como ausente no manifesto da exportação.

### Quadro tributário do item — quem decide é o backend

Até a etapa 1 do roteiro, o motor **decidia** imposto: recebia só `origem` e
`csosn` e completava o resto com regra fixa em C# — toda nota saía com PIS e
COFINS em CST 07. Isso acabou. O item agora carrega o quadro tributário completo
e o motor apenas **traduz** para os grupos do XML.

Cada item do payload leva `imposto` com `icms`, `pis`, `cofins` e, quando houver,
`ipi`. Os campos `origem` e `csosn` **saíram** do item: a origem e a situação
tributária moram dentro de `imposto.icms`. O contrato campo a campo, com a tabela
de qual situação exige o quê, está em `fiscal_service/docs/CONTRATO_TRIBUTARIO.md`.

A tabela é espelhada em `src/fiscal/emission/fiscal-rules.ts`
(`CAMPOS_POR_CSOSN`, `CAMPOS_POR_CST_ICMS`, `formaDaContribuicao`). Duplicação
deliberada: no motor porque ele monta o XML, aqui porque é onde o erro ainda pode
virar mensagem em português antes de queimar um número de nota.

**O que esta etapa preenche e o que ela recusa.** O quadro é composto do que o
cadastro do produto já sabe — base é o valor do item, alíquota é a cadastrada,
valor é o produto dos dois. O que exige matriz tributária de verdade — ST, MVA,
redução de base, crédito do Simples — **não é adivinhado**: o item é recusado
nomeando o campo que falta. Quem resolve é a etapa 2
([ROADMAP_FISCAL.md](./ROADMAP_FISCAL.md)).

### Versão do snapshot

| Versão | Item | Emite? |
|---|---|---|
| 1 | sem quadro tributário | **não** |
| 2 | com quadro tributário e totais fiscais | sim |

Documento em versão 1 continua sendo **lido** — consulta e tela de detalhe
funcionam normalmente. O que ele não faz mais é emitir: os itens não têm imposto
e o motor deixou de aceitar item sem ele. O retry devolve `400` mandando emitir
documento novo.

Recompor o quadro no reprocessamento, a partir do cadastro de hoje, foi
descartado: o snapshot deixaria de retratar a venda, que é exatamente o que ele
existe para impedir.

### ⚠️ O CST de PIS/COFINS é decisão do contador — não há valor padrão

Produto sem `cst_pis` e `cst_cofins` fica **fiscalmente incompleto e não emite**.
Isso é deliberado, e a alternativa foi considerada e descartada.

Chegou a existir um backfill gravando `07` ("operação isenta da contribuição"),
que é o que o motor cravava antes desta etapa. Ele foi removido: preencher
automaticamente resolveria a emissão e criaria um problema pior — bebida fria é
**monofásica** e tem CST próprio de revenda, e `07` escondido no cadastro viraria
escrituração errada que ninguém revisita, porque nada mais reclama.

Sem valor padrão, o produto reclama até alguém decidir. É a única forma de a
decisão chegar a quem sabe tomá-la.

**Ao cadastrar produto novo:** o CST de PIS e de COFINS precisa vir do contador.
Quando o CST é tributado por percentual (`01`, `02`), a alíquota também é
exigida; situação não tributada (`04` a `09`) não comporta alíquota.

### O XML é o entregável — a plataforma não gera SPED

A escrituração é do contador. A plataforma **não** gera EFD ICMS/IPI, EFD Contribuições nem
Sintegra: ela entrega os XMLs, e o software do contador monta a obrigação a partir dos
grupos `<ICMS>`, `<IPI>`, `<PIS>` e `<COFINS>` de cada item.

Isso tem duas consequências que valem para todo o módulo fiscal:

1. **O que estiver errado no XML vira escrituração errada.** O contador não vê o banco de
   dados, vê o arquivo — e não tem como perceber que um CST saiu incoerente com a natureza
   do produto. A SEFAZ também não pega: ela valida estrutura, não coerência.
2. **O que não entrou no snapshot na emissão não entra nunca mais.**
   `FiscalDocument.snapshot` é gravado na criação e nunca reconstruído. Nota emitida sem
   base de cálculo e alíquota não vira escrituração correta depois — não é bug com conserto,
   é dado que não foi capturado.

A entrega desse pacote é o `GET /fiscal/documents/xml/export` (ver [API.md](./API.md)). O
plano das etapas seguintes está no [ROADMAP_FISCAL.md](./ROADMAP_FISCAL.md).

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
| GET | `/settings/:establishmentId/ambientes` | `fiscal.settings.read` |
| POST | `/settings/:establishmentId/ambientes/:ambiente/ativar` | `fiscal.settings.edit` |
| GET | `/settings/:establishmentId/producao/checklist` | `fiscal.settings.read` |
| POST | `/settings/:establishmentId/producao/liberar` | `fiscal.settings.edit` |
| POST | `/settings/:establishmentId/producao/revogar` | `fiscal.settings.edit` |
| GET | `/settings/:establishmentId/history` | `fiscal.settings.read` |
| GET | `/engine/health` | `fiscal.settings.read` |
| GET | `/documents` | `fiscal.read` |
| GET | `/documents/:id` | `fiscal.read` |
| GET | `/documents/sale/:saleId` | `fiscal.read` |
| GET | `/documents/:id/history` | `fiscal.read` |
| GET | `/documents/:id/events` | `fiscal.read` |
| GET | `/documents/:id/danfe` | `fiscal.read` |
| GET | `/documents/:id/xml/:tipo` | `fiscal.read` |
| GET | `/documents/xml/export` | `fiscal.read` |
| GET | `/documents/:id/cartas-correcao` | `fiscal.read` |
| GET | `/documents/:id/cartas-correcao/:sequencia/xml` | `fiscal.read` |
| GET | `/inutilizacoes/pendentes/:establishmentId` | `fiscal.inutilizar` |
| POST | `/documents/nfce` | `fiscal.emit` |
| POST | `/documents/nfe` | `fiscal.nfe.emit` |
| POST | `/documents/:id/retry` | `fiscal.emit` |
| POST | `/documents/:id/consulta` | `fiscal.read` |
| POST | `/documents/:id/cancel` | `fiscal.cancel` |
| POST | `/documents/:id/carta-correcao` | `fiscal.cce` |
| POST | `/inutilizacoes` | `fiscal.inutilizar` |

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

### NF-e modelo 55

Rota, DTO e snapshot próprios; item e quadro tributário são **os mesmos** da
NFC-e. O contrato completo do motor está em `fiscal_service/docs/CONTRATO_NFE.md`.

| | NFC-e | NF-e |
|---|---|---|
| Rota do backend | `POST /fiscal/documents/nfce` | `POST /fiscal/documents/nfe` |
| Permissão | `fiscal.emit` | `fiscal.nfe.emit` |
| Rota do motor | `/api/nfce/emit` | `/api/nfe/emit` |
| Destinatário | opcional | obrigatório, com endereço, IBGE e `indIEDest` |
| CSC | obrigatório | **recusado** pelo motor |
| QR Code | sim | não existe |
| Série e numeração | `serieNfce` / `proximoNumeroNfce` | `serieNfe` / `proximoNumeroNfe` |
| DANFE | PDF | **HTML** |
| Snapshot | `modelo` ausente ou `NFCE` | `modelo: 'NFE'` + `destinatarioNfe` + `nfe` |

**Recorte vigente (13/08/2026):** venda interna, saída, finalidade normal,
destinatário pessoa jurídica. Tudo que está fora é recusado por
`buildNfeSnapshot` **antes de reservar numeração** — o motor recusaria de novo,
mas aí o número já teria sido consumido.

### Quem escolhe o modelo: o tipo de pessoa do cliente

`OnSaleConfirmedListener` emite NFC-e automaticamente ao confirmar a venda —
**exceto quando o cliente é pessoa jurídica**. Nesse caso ele não emite nada, e
a venda fica em `NAO_EMITIDO` esperando a emissão explícita da NF-e.

Não é preferência de fluxo, é necessidade: **`fiscal_documents.sale_id` é
único**. Se a NFC-e automática criasse o documento, a NF-e daquela venda ficaria
impossível de emitir — o endpoint existiria e seria inalcançável. Foi assim que
o defeito apareceu, ao emitir a primeira NF-e de verdade.

A NF-e **não** é automática porque `indFinal` (revenda ou consumo) não tem
resposta segura sem perguntar. É a única pergunta do diálogo de emissão.

**`indIeDest` não se deduz do tipo de pessoa.** Prestadora de serviço é pessoa
jurídica e não é contribuinte de ICMS. O parceiro guarda o indicador em
`partners.ind_ie_dest`, e a inscrição estadual só viaja quando ele é `1`.

**O DANFE da NF-e é HTML.** `danfeFormato()` escolhe extensão e MIME a partir do
`danfeContentType` que o motor declara — gravar HTML com extensão `.pdf`
entregaria ao lojista um arquivo que nenhum leitor abre.

### Os três eventos depois da emissão

| | Cancelamento | Carta de correção | Inutilização |
|---|---|---|---|
| Evento | 110111 | 110110 | **não é evento** — é serviço próprio |
| Age sobre | a nota inteira | um detalhe da nota | numeração que **nunca virou nota** |
| Exige | nota `AUTORIZADO` | nota `AUTORIZADO` | faixa sem documento emitido |
| Sequência | 1 | 1 a 20, **atribuída pelo servidor** | não tem |
| Texto | justificativa 15–255 | correção 15–1000 | justificativa 15–255 |
| Guarda em | `fiscal_documents.xml_cancelamento` | `fiscal_correction_letters` | `fiscal_inutilizations` |
| Permissão | `fiscal.cancel` | `fiscal.cce` | `fiscal.inutilizar` |

**Por que a inutilização não tem chave de acesso:** ela fala de números que nunca
existiram como documento. Por isso guarda série, modelo, ano e faixa — e por isso
a **UF vai no corpo** da chamada ao motor, que nas outras rotas é derivada da chave.

**Quem impõe o quê.** O motor é stateless: confere tamanho de texto e faixa de
sequência, e nada mais. As regras que dependem de histórico moram no backend — a
sequência da CC-e (o `UNIQUE (documento, sequência)` fecha a corrida entre duas
correções simultâneas), o limite de 20, e a conferência da faixa contra os
números já usados. O quadro completo está em
`fiscal_service/docs/CONTRATO_EVENTOS.md`.

### Duas armadilhas da inutilização, descobertas emitindo

Ambas no motor, ambas invisíveis nos testes unitários — só a primeira faixa real as revelou
(14/08/2026):

1. **O ano vai com dois dígitos.** O `ID` do pedido é `ID + cUF + ano + CNPJ + modelo + série +
   faixa`, de tamanho fixo. Mandar `2026` em vez de `26` estica o identificador e a SEFAZ
   devolve **215 — Falha no esquema XML**, sem dizer qual campo. A conversão vive no
   `DFeNetAdapter`, não no contrato: quem chama fala em ano cheio.
2. **O timeout padrão da biblioteca (5s) é curto demais.** O pedido chega e é homologado, mas a
   resposta não volta a tempo; deste lado vira erro e nada é gravado. A tentativa seguinte volta
   como duplicidade — com o ato já praticado. Agora são 30s, e a duplicidade é reconciliada pelo
   protocolo que a própria recusa carrega.

### Ciclo de status do documento

```
PENDENTE ──► AUTORIZADO ──► CANCELADO
    │                └─► (CC-e: não muda o status; a nota segue AUTORIZADO)
    ├──► REJEITADO ──┐
    └──► ERRO ───────┴──► INUTILIZADO   (quando a numeração dele é inutilizada)
```

`INUTILIZADO` existia no enum sem nada que o produzisse: é a inutilização da faixa
que o gera, e só para documento em erro definitivo. A carta de correção **não**
muda o status — ela acrescenta uma linha em `fiscal_correction_letters` e um
evento no documento, e a nota continua autorizada.

### Depois de mudar o contrato: reconstruir a **imagem**

O motor roda em contêiner, e a imagem carrega o `dotnet publish` feito na hora do build.
`dotnet build` no host recompila o `bin/` do repositório — que o contêiner não usa:

```bash
cd ../fiscal_service
docker compose build fiscal-service && docker compose up -d fiscal-service
```

Sintoma de imagem velha: rejeição citando um campo que **não existe mais** no fonte do
motor. Confirme sem adivinhar comparando o contrato servido com o esperado —
`http://localhost:8080/swagger/v1/swagger.json`, em `components.schemas.ItemNfceDto`.
Aconteceu em 13/08/2026: a etapa 1 já estava nos três repositórios e a emissão continuava
rejeitando por `Itens[0].Csosn`, campo removido do motor no commit do contrato novo.

---

## 10. Modelo de dados

| Tabela | Conteúdo |
|--------|----------|
| `fiscal_settings` | Uma linha por (estabelecimento, ambiente): série, próximo número, CSC/idCSC, refs cifradas do certificado, validade, subject e liberação de produção |
| `fiscal_documents` | Documento fiscal: modelo, série, número, chave, status, ambiente, protocolo, rejeição, datas, valores, XMLs, DANFE, QR Code, `idempotencyKey`, `attempts`, engine e **snapshot** |
| `fiscal_status_history` | Toda transição de status, com motivo, usuário e data |
| `fiscal_document_events` | Eventos do documento: cancelamento e carta de correção, inclusive as recusadas |
| `fiscal_correction_letters` | Uma linha por CC-e: sequência (única por documento), texto, condição de uso vigente, protocolo e XML |
| `fiscal_inutilizations` | Faixa de numeração inutilizada: estabelecimento, modelo, série, ano, faixa, justificativa, protocolo e XML. **Não tem documento** |
| `fiscal_certificate_events` | Auditoria de envio e substituição de certificado |
| `fiscal_settings_events` | Auditoria de série, CSC, troca de ambiente e liberação de produção |

O **snapshot** (JSONB) congela emitente, destinatário, itens, impostos, pagamentos e
totais no momento da emissão: alterar produto ou cliente depois não muda o que foi
enviado à SEFAZ. Documento fiscal é append-only — não há exclusão física.

---

## Documentações relacionadas

- [API.md](./API.md) — contratos de API
- [REGRAS_DE_NEGOCIO.md](./REGRAS_DE_NEGOCIO.md) — regras de negócio
- [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md) — modelagem do banco
