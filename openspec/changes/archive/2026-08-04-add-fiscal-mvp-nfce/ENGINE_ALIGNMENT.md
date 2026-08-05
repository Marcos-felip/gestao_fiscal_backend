# Alinhamento NestJS ↔ motor fiscal .NET (`fiscal_service`)

> Handoff para **terminar o `gestao_fiscal_backend`** alinhado ao microserviço `fiscal_service`
> (.NET 8 / DFe.NET). Base: mapeamento do contrato real dos dois lados (ago/2026).
> O `design.md` sempre previu "o .NET monta/assina o XML e devolve DANFE/QR"; a
> implementação do `DfeNetFiscalEngine`/processor ficou como **stub** e precisa ser terminada.

---

## 1. Contrato REAL do `fiscal_service` (.NET) — o que já existe

- **Host:** HTTP **porta 8080**, **sem** prefixo `/api/v1`. Em Docker é HTTP puro.
- **Auth:** header **`X-Api-Key`** (o .NET lê de `FISCAL_API_KEY`; **não sobe** sem a chave). `/health` e `/swagger` são isentos. Swagger só em `Development`.
- **Certificado:** vai **no corpo** de TODO request como `certificadoBase64` (pfx base64) + `certificadoSenha`. Não é header, não é arquivo, não fica no servidor.
- **Todos os verbos são POST** (inclusive consulta e status — precisam do certificado no corpo).
- **Rejeição de negócio da SEFAZ = HTTP 400** com corpo útil (`rejeicao`). Só `status-servico` sempre responde 200.

### Rotas
| Método | Rota | Uso |
|---|---|---|
| POST | `/api/nfce/emit` | emitir (recebe dados estruturados, monta+assina) |
| POST | `/api/nfce/consulta` | consultar situação por chave |
| POST | `/api/nfce/cancel` | cancelar por chave+protocolo+justificativa |
| POST | `/api/sefaz/status-servico` | testar comunicação com a SEFAZ |
| GET | `/health` | health (isento de auth) |

### `POST /api/nfce/emit` — request (`EmitirNfceRequest`, JSON camelCase)
Topo: `emitente{}`, `destinatario?{}`, `itens[]`, `pagamentos[]`, `valorTotal` (= Σ itens, tol. 0,01),
`certificadoBase64`, `certificadoSenha`, `codigoCsc`, `idCsc`, `serie` (1–999), `numero` (1–999999999),
`ambiente` (`"homologacao"`/`"producao"`/`"1"`/`"2"` — **string**).

- **emitente**: `cnpj` (válido), `razaoSocial` (≤60), `nomeFantasia?`, `inscricaoEstadual` (≤14), `crt` (`"1"`/`"2"`/`"3"` **string**), `logradouro`, `numero`, `complemento?`, `bairro`, `codigoMunicipio` (IBGE 7 díg), `municipio`, `uf` (2), `cep` (8 díg), `telefone?`, `email?`.
- **destinatario?**: bloco opcional. `cpfCnpj?`, `nome?`, e endereço só é montado se vierem `logradouro` **e** `uf` juntos. Em homologação o nome é substituído pelo texto legal. Omitir para consumidor não identificado.
- **itens[]**: `numeroItem`, `codigoProduto` (≤60), `descricao` (≤120), `ncm` (8 díg), `cest?` (7), `cfop` (4 díg, **começa com 5**), `unidadeComercial` (≤6), `quantidade` (>0), `valorUnitario` (>0), `gtin?` (vazio="SEM GTIN" senão 8/12/13/14+DV), `origem` (int **0–8**), `csosn` (**restrito** — ver enums). **Não há base/alíquota no item** (o motor deriva ICMS de origem+csosn; PIS/COFINS = CST 07).
- **pagamentos[]**: `tipo` (**string textual**, ex.: `"dinheiro"`, `"pix"`, `"cartao_credito"`), `valor` (>0; Σ = total dos itens, tol. 0,01). **Sem grupo de troco.**

### `POST /api/nfce/emit` — response (`EmitirNfceResponse`)
`sucesso` (bool), `chaveAcesso?` (44), `protocolo?` (15), **`xmlAutorizadoBase64?`** (nfeProc base64 UTF-8),
**`danfeBase64?`** (PDF em base64), **`qrCode?`** (string de URL, não imagem), `rejeicao?` `{ codigo, mensagem, retornoTecnico? }`.
HTTP 200 se `sucesso`, **400 se rejeição/validação/cert inválido**, 401 auth, 500 interno.

### Outras respostas
- **consulta** (`ConsultarNfceRequest`: `chaveAcesso`, `certificadoBase64`, `certificadoSenha`, `ambiente`) → `{ sucesso, status?, protocolo?, xmlConsultaBase64?, mensagemErro? }`.
- **cancel** (`CancelarNfceRequest`: `chaveAcesso`, `protocoloAutorizacao` **15 díg**, `justificativa` **15–255**, `certificadoBase64`, `certificadoSenha`, `ambiente`) → `{ sucesso, protocolo?, xmlCancelamentoBase64?, motivoRejeicao? }`. UF/CNPJ são derivados da chave.
- **status-servico** (`StatusServicoRequest`: `ambiente`, `uf`, `certificadoBase64`, `certificadoSenha`) → `{ disponivel, mensagem?, tempoMedioResposta? }` (sempre 200).

### Enums / valores aceitos (strings no JSON)
- `ambiente`: `homologacao`/`producao` (ou `1`/`2`).
- `crt`: `1`/`2`/`3` (ou nomes `simples_nacional`/`simples_nacional_excesso`/`regime_normal`).
- `pagamentos[].tipo`: `dinheiro, cheque, cartao_credito, cartao_debito, credito_loja, vale_alimentacao, vale_refeicao, vale_presente, vale_combustivel, boleto, pix, sem_pagamento, outro` (o motor resolve o `tPag` numérico internamente — **enviar a string, não `"01"`/`"17"`**).
- `origem`: int 0–8.
- `csosn`/CST **restritos**: Simples (crt 1/2) → CSOSN ∈ **{102,103,300,400,500}**; Normal (crt 3) → CST ICMS ∈ **{40,41,50}**. Qualquer outro é **rejeitado na validação**.

### Envelope de erro genérico (middlewares)
`{ codigo, mensagem, erros?[{campo,mensagem}], timestamp }` com `codigo ∈ VALIDACAO|CERT_INVALIDO|ARG_INVALIDO|AUTH_FALHA|CONFIG_INVALIDA|ERRO_INTERNO`.

---

## 2. Como o NestJS chama HOJE (desalinhado)

- `IFiscalEngine.emitir(payload)` espera `{ idempotencyKey, ambiente, xml, modelo, serie, numero }` e o processor envia **`xml: ''`** (stub; `xmlEnviado` nunca é populado). Não monta payload estruturado, não usa o snapshot.
- URLs: `POST {base}/api/v1/nfce/emitir`, `GET /api/v1/nfce/consulta/{chave}`, `POST /api/v1/nfce/cancelar`. **Prefixo, nomes e método (GET consulta) errados.**
- `FISCAL_ENGINE_URL` default `http://localhost:5000` (deveria ser `:8080`). **Sem** `X-Api-Key`/`FISCAL_ENGINE_API_KEY`.
- Result esperado não tem `danfe`/`qrCode`; parse é `as` cru (sem validação); trata 400 como erro de transporte.
- `StorageService` pronto mas **nunca chamado**; `danfeUrl`/`qrCode`/`xmlEnviado` nunca gravados; `Sale.fiscalStatus` nunca atualizado; sem rotas de cancel/consulta/retry/status.
- **Sem mapeamento** PaymentMethod→`tipo`, CRT/CSOSN/CST/origem/IBGE, e **sem manejo de certificado** (não há upload; refs são strings vazias).

---

## 3. Tarefas do backend para fechar (ordenadas por dependência)

### A. Contrato/transporte do engine (desbloqueia tudo)
- [ ] A1. `FISCAL_ENGINE_URL` → `http://<host>:8080`; adicionar `FISCAL_ENGINE_API_KEY`; enviar header **`X-Api-Key`** em todas as chamadas.
- [ ] A2. Corrigir rotas: `POST /api/nfce/emit`, `POST /api/nfce/consulta`, `POST /api/nfce/cancel`, `POST /api/sefaz/status-servico`. Remover `/api/v1`. Consulta vira **POST** com corpo.
- [ ] A3. Redesenhar `IFiscalEngine` + `DfeNetFiscalEngine`:
  - `emitir(req estruturado)` → result `{ sucesso, chaveAcesso, protocolo, xmlAutorizadoBase64, danfeBase64, qrCode, rejeicao{codigo,mensagem,retornoTecnico} }`.
  - Adicionar `statusServico(req)`; ajustar `consultar(req)` (cert+ambiente no corpo) e `cancelar(req)` (protocolo 15 díg, justificativa 15–255, cert, ambiente).
  - Tratar **HTTP 400 como rejeição de negócio** (ler corpo, `sucesso=false`), distinto de 401/500/rede. Parsear/validar a resposta (sem cast cru). Timeout em todos os verbos.

### B. Certificado A1 (bloqueia emissão real)
- [ ] B1. Endpoint de **upload do certificado** (.pfx multipart + senha): validar, **extrair validade/titular** (parse do pfx no Nest, ex.: `node-forge`/`@peculiar/x509`), armazenar **criptografado** (KMS/cofre — nunca texto claro), salvar em `FiscalSettings` (`certificadoRef`/`certificadoSenhaRef` + `certificadoValidade`/`certificadoSubject`).
- [ ] B2. Substituição do certificado (auditoria) + bloquear emissão com **certificado vencido**.
- [ ] B3. Decriptar o pfx **só na borda** da chamada ao motor e enviar `certificadoBase64`+`certificadoSenha`.

### C. Builder do payload estruturado + mapeamentos
- [ ] C1. Montar `EmitirNfceRequest` a partir de `FiscalSettings` + Company/Establishment + snapshot da venda:
  - **emitente** (crt como string vinda de `Company.crt`; IBGE 7 díg, cep 8, uf) — incluir `crt` no snapshot/emitente (hoje ausente).
  - **destinatario?** (omitir sem cliente).
  - **itens[]** (cfop começa com 5; `origem`, `csosn`/CST **do conjunto suportado**; `unidadeComercial`, `gtin`=barcode).
  - **pagamentos[]** com `tipo` **textual** (mapear `PaymentMethod`→`dinheiro`/`pix`/`cartao_credito`/…), `valor`.
  - `valorTotal`, `codigoCsc`, `idCsc`, `serie`, `numero`, `ambiente` (string), `certificadoBase64/Senha`.
- [ ] C2. Garantir consistência exigida pelo motor (Σ itens = valorTotal; Σ pagamentos = total; tol. 0,01).

### D. Processar resposta + storage
- [ ] D1. Processor: gravar `chaveAcesso`, `protocolo`, `dataAutorizacao`; decodificar `xmlAutorizadoBase64`; decodificar `danfeBase64` (PDF); gravar `qrCode`; rejeição → `rejeicaoCodigo`/`rejeicaoMensagem` (REJEITADO) vs ERRO.
- [ ] D2. **Wire `StorageService`** no processor: upload de XML e DANFE em `fiscal/{companyId}/{ano}/{mes}/{chave}.(xml|pdf)`; guardar refs em `xmlAutorizado`/`danfeUrl`; ajustar `getXml`/adicionar `getDanfe` para servir do storage.
- [ ] D3. Atualizar **`Sale.fiscalStatus`** (PROCESSANDO na emissão; AUTORIZADO/REJEITADO/CANCELADO conforme resultado).

### E. Rotas Fase B + orquestração
- [ ] E1. `POST /fiscal/documents/:id/cancel { justificativa }` → `engine.cancelar` → gravar `xmlCancelamento`/`dataCancelamento`/status CANCELADO + `Sale.fiscalStatus`; impedir duplicado; justificativa 15–255.
- [ ] E2. `POST /fiscal/documents/:id/consulta` → `engine.consultar` → reconciliar status (ex.: timeout mas autorizada).
- [ ] E3. `POST /fiscal/documents/:id/retry` → reprocessa idempotente (mesma numeração/documento).
- [ ] E4. Endpoint **teste SEFAZ** → `engine.statusServico` (cert+ambiente+uf) → `{ disponivel, mensagem, tempoMedioResposta }`.
- [ ] E5. `GET /fiscal/documents/:id/danfe` (PDF do storage) + expor `qrCode` no detalhe.

### F. Gaps de DTO/validação (já detectados no frontend)
- [ ] F1. **`UpdateCompanyDto`** aceitar campos fiscais (crt, IE/IM, `codigoIbgeMunicipio`, `contribuinteIcms`, razão social, tel/e-mail fiscal) **ou** expor `PATCH /companies/:id/fiscal`. (desbloqueia a tela fiscal da empresa no frontend)
- [ ] F2. **`CreateProductDto`/`UpdateProductDto`** declarar `csosn`, `cstIcms/Pis/Cofins`, `aliquotaIcms/Pis/Cofins` (hoje o `whitelist:true` os descarta).
- [ ] F3. **Derivar `Product.fiscalComplete`** no service, validando contra as regras do motor (NCM 8, CFOP começa com 5, `csosn ∈ {102,103,300,400,500}` p/ SN ou `cst ∈ {40,41,50}` p/ Normal, `origem` 0–8).
- [ ] F4. Validar pré-condições de emissão com as **mesmas** regras do motor (falhar cedo com mensagem amigável antes de enfileirar).

### G. Infra / docs
- [ ] G1. `docker-compose`: subir o `fiscal_service` (8080) + `FISCAL_API_KEY`; garantir Redis; setar `FISCAL_ENGINE_URL`/`FISCAL_ENGINE_API_KEY` no Nest.
- [ ] G2. Health check do motor (`GET /health`) no monitoring.
- [ ] G3. Documentar o contrato (FISCAL.md — cumpre tasks 7.3 e 13.4). Este arquivo já serve de base.

---

## 4. Desdobramentos no frontend (após o backend acima)

O contrato HTTP do NestJS para o frontend (`/fiscal/**`) **não muda de forma** — as mudanças são internas do engine. Ao concluir o backend, destravam no frontend (seção 8 do change do front, hoje diferida):

1. **DANFE + QR Code** no detalhe do documento e no pós-venda (baixar PDF via `danfeUrl`, exibir `qrCode`). — front tarefa 8.6
2. **Upload de certificado A1** (.pfx + senha) na config fiscal. — 8.1
3. **Botão "testar comunicação SEFAZ"**. — 8.2
4. **Cancelamento** (justificativa 15–255) + **central de rejeições/retry** + **consulta SEFAZ**. — 8.3/8.4/8.5
5. **Dados fiscais da empresa** (tarefa 3, hoje bloqueada) — destrava com F1.
6. **Produto**: `fiscalComplete` passa a refletir de verdade (F3). Considerar **restringir o select de CSOSN/CST** no form ao conjunto suportado pelo motor (102/103/300/400/500 e 40/41/50) para evitar rejeição.
7. **Pagamentos**: se a emissão manual enviar `payments`, usar os códigos que o Nest espera (o Nest mapeia para o `tipo` textual do motor).
