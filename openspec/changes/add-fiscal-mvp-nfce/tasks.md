## 1. Fundacao e enums [Fase A]

- [x] 1.1 Criar modulo `fiscal` (`module/controller/service/dto`) no NestJS
- [x] 1.2 Enum `FiscalDocumentModel` (NFE=55, NFCE=65)
- [x] 1.3 Enum `FiscalEnvironment` (HOMOLOGACAO=2, PRODUCAO=1)
- [x] 1.4 Enum `FiscalDocumentStatus` (NAO_EMITIDO, PENDENTE, PROCESSANDO, AUTORIZADO, REJEITADO, ERRO, CONTINGENCIA, CANCELAMENTO_PENDENTE, CANCELADO, INUTILIZADO)
- [x] 1.5 Enum `TaxRegimeCode`/CRT (1 Simples, 2 Simples excesso, 3 Normal)
- [x] 1.6 Seed das permissoes `fiscal.settings.read/edit`, `fiscal.emit`, `fiscal.cancel`, `fiscal.read` (OWNER/ADMIN por padrao)
- [x] 1.7 Instalar `@nestjs/event-emitter` + registrar no `AppModule`
- [x] 1.8 Instalar `@nestjs/bullmq` + `bullmq` + `ioredis` e configurar `QueueModule`
- [x] 1.9 Adicionar Redis ao `docker-compose.yml`
- [x] 1.10 Instalar `@aws-sdk/client-s3` e configurar `StorageModule` (Supabase S3)

## 2. Configuracao fiscal da empresa [Fase A]

- [x] 2.1 Garantir/estender campos fiscais em `Company` (razao social, nome fantasia, CNPJ, IE, IM, CRT, contribuinte de ICMS)
- [x] 2.2 Endereco fiscal + `codigoIbgeMunicipio` + UF + telefone/e-mail fiscal
- [ ] 2.3 Validar CNPJ/CPF localmente (digitos verificadores)
- [ ] 2.4 Validar formato de IE e de CEP/UF/codigo IBGE
- [x] 2.5 Campo derivado `fiscalConfigComplete` na empresa
- [x] 2.6 Bloquear emissao quando a configuracao da empresa estiver incompleta

## 3. Configuracao fiscal do estabelecimento + certificado [Fase A]

- [x] 3.1 Tabela `FiscalSettings` (1:1 com establishment): ambiente, serie NFC-e, proximo numero, CSC, idCSC
- [x] 3.2 Campos do certificado: ref criptografada do A1, ref da senha, validade, subject
- [x] 3.3 Endpoint obter/gravar `FiscalSettings` do estabelecimento
- [ ] 3.4 Upload de certificado A1 (armazenar criptografado em cofre/KMS, extrair validade/subject)
- [ ] 3.5 Substituir certificado (mantendo auditoria)
- [ ] 3.6 Alertar certificado a <=30 dias do vencimento
- [ ] 3.7 Bloquear emissao com certificado vencido
- [ ] 3.8 Endpoint "teste de comunicacao com a SEFAZ" (chama `IFiscalEngine.statusServico`)

## 4. Dados fiscais dos produtos [Fase A]

- [x] 4.1 Estender `Product` (ou `ProductFiscal` 1:1): NCM, CEST, origem, CFOP padrao
- [x] 4.2 CSOSN (Simples) e CST de ICMS/PIS/COFINS (Normal)
- [x] 4.3 Aliquotas ICMS/PIS/COFINS, unidade comercial, GTIN
- [x] 4.4 Campo derivado `fiscalComplete` por produto
- [ ] 4.5 Endpoint/relatorio de produtos com pendencia fiscal
- [x] 4.6 Bloquear emissao quando algum item da venda estiver fiscalmente incompleto

## 5. Formas de pagamento fiscais [Fase A]

- [x] 5.1 Mapear `PaymentMethod` -> `tPag` (01 dinheiro, 03 credito, 04 debito, 15 boleto, 17 PIX, 90 vale, 99 outros)
- [x] 5.2 Tratar pagamento dividido a partir de `SalePayment[]`
- [ ] 5.3 Validar soma dos pagamentos = total da venda
- [ ] 5.4 Calcular troco (`vTroco`) a partir de `amountReceived`

## 6. Documento fiscal, snapshot e status [Fase A]

- [x] 6.1 Tabela `FiscalDocument` (modelo, serie, numero, chave, status, ambiente, protocolo, rejeicao, datas, valores, XMLs, danfeUrl, qrCode, idempotencyKey, attempts, engine, snapshot)
- [x] 6.2 Vinculo `FiscalDocument` <-> venda, empresa e estabelecimento
- [x] 6.3 Tabela `FiscalStatusHistory` (de/para, motivo, usuario, data)
- [x] 6.4 Tabela `FiscalDocumentEvent` (generica; MVP usa cancelamento)
- [x] 6.5 Snapshot imutavel (emitente, destinatario, endereco, itens, impostos, pagamentos, totais) em JSONB
- [x] 6.6 Proibir exclusao fisica de documento fiscal (soft/append-only)

## 7. Motor fiscal (.NET) + porta [Fase A]

- [x] 7.1 Repositorio `fiscal_service` criado em `/home/marcos/Projetos/fiscal_service` (estrutura DDD + Clean Architecture ja montada)
- [x] 7.2 Porta `IFiscalEngine` no Nest + implementacao `DfeNetFiscalEngine` (HTTP client com API Key)
- [ ] 7.3 Contrato de comunicacao NestJS <-> .NET documentado (headers, payload, response)
- [ ] 7.4 Health check do motor fiscal (.NET `/health`) integrado ao monitoring do NestJS

## 8. Emissao automatica de NFC-e [Fase A]

- [x] 8.1 Emitir evento `sale.confirmed` no `SalesService.finalize()` via `EventEmitter` ao transitar para `CONCLUIDA`
- [x] 8.2 Listener `OnSaleConfirmed` no `FiscalModule`: validar empresa/estabelecimento/certificado/CSC/numeracao/produtos/pagamentos/totais
- [x] 8.3 Reservar numeracao sequencial atomica por serie+estabelecimento
- [x] 8.4 Criar `FiscalDocument` (PENDENTE) + `idempotencyKey` e enfileirar (BullMQ)
- [x] 8.5 Job de emissao: montar snapshot e chamar `IFiscalEngine.emitirNfce`
- [ ] 8.6 Processar autorizacao: salvar chave, protocolo, XML autorizado, QR Code
- [ ] 8.7 Upload XML/DANFE para Supabase Storage (S3): `fiscal/{companyId}/{ano}/{mes}/{chave}.xml`
- [ ] 8.8 Atualizar status fiscal da venda (`Sale.fiscalStatus`)
- [ ] 8.9 Endpoints de download: XML autorizado e DANFE (+ reimpressao)

## 9. Consulta e cancelamento [Fase B]

- [ ] 9.1 `POST /fiscal/documents/:id/consulta` (situacao na SEFAZ)
- [ ] 9.2 `POST /fiscal/documents/:id/cancel { justificativa }` (min. 15 caracteres)
- [ ] 9.3 Enviar evento de cancelamento e armazenar protocolo + XML de cancelamento
- [ ] 9.4 Atualizar documento para CANCELADO e refletir na venda
- [ ] 9.5 Impedir cancelamento duplicado e tratar cancelamento rejeitado

## 10. Rejeicoes, idempotencia e retry [Fase B]

- [ ] 10.1 Persistir codigo + mensagem de rejeicao + retorno tecnico completo
- [ ] 10.2 `POST /fiscal/documents/:id/retry` sem duplicar (respeita idempotencia)
- [ ] 10.3 Contar tentativas (`attempts`) e registrar usuario/data de cada uma
- [ ] 10.4 Endpoint da central de rejeicoes (listar/filtrar por status, periodo, estabelecimento)

## 11. Producao [Fase C]

- [ ] 11.1 Separar configuracao de homologacao e producao
- [ ] 11.2 Flag/checklist explicito de ativacao (impedir producao por acidente)
- [ ] 11.3 Validar certificado, CSC, serie e numeracao de producao
- [ ] 11.4 Validar consulta publica da nota autorizada em producao

## 12. Auditoria e storage [Fase C]

- [ ] 12.1 Registrar emissao, cancelamento, download de XML, reimpressao
- [ ] 12.2 Registrar troca de certificado, alteracao de serie e de CSC
- [ ] 12.3 Registrar mudanca de ambiente (homologacao<->producao)
- [ ] 12.4 Storage de XML/DANFE via Supabase Storage (S3) com refs no banco
- [ ] 12.5 Organizar arquivos por empresa/ano/mes

## 13. Endpoints, listagem e docs [Fase C]

- [x] 13.1 `GET /fiscal/documents` (filtros: status, periodo, estabelecimento, modelo) e `GET /fiscal/documents/:id`
- [x] 13.2 Aplicar gating por permissao em todos os endpoints
- [ ] 13.3 Atualizar `API.md`, `REGRAS_DE_NEGOCIO.md`, `BANCO_DE_DADOS.md`
- [ ] 13.4 Criar `FISCAL.md` (arquitetura NestJS<->.NET, contrato do motor, politica de certificados, ambientes)

## 14. Criterio de conclusao do MVP [Fase C]

- [ ] 14.1 Emitir NFC-e em homologacao e em producao
- [ ] 14.2 Consultar situacao, gerar/baixar DANFE e XML, reimprimir
- [ ] 14.3 Cancelar, exibir rejeicoes, evitar duplicidade
- [ ] 14.4 Manter historico e auditoria completos

## 15. Alinhamento com o motor .NET (contrato real) [Fase A/B]

> Detalhes completos (campos, rotas, enums, gaps) em `ENGINE_ALIGNMENT.md` (mesma pasta).
> Consolida/termina os stubs das secoes 3, 5, 8, 9 e 10 conforme o contrato REAL do
> `fiscal_service` (dados estruturados, cert no corpo, DANFE/QR no retorno, X-Api-Key, :8080).

### A. Contrato/transporte do engine
- [x] 15.A1 `FISCAL_ENGINE_URL` -> `:8080`; add `FISCAL_ENGINE_API_KEY`; enviar header `X-Api-Key` em toda chamada
- [x] 15.A2 Corrigir rotas: `POST /api/nfce/emit`, `POST /api/nfce/consulta`, `POST /api/nfce/cancel`, `POST /api/sefaz/status-servico` (remover `/api/v1`; consulta vira POST)
- [x] 15.A3 Redesenhar `IFiscalEngine`/`DfeNetFiscalEngine`: request estruturado; result com `xmlAutorizadoBase64`/`danfeBase64`/`qrCode`/`rejeicao{}`; tratar HTTP 400 como rejeicao; add `statusServico`; parse/validacao da resposta; timeout em todos

### B. Certificado A1
- [x] 15.B1 Endpoint de upload do .pfx + senha: validar, extrair validade/titular, armazenar criptografado em FiscalSettings (cumpre 3.4)
- [x] 15.B2 Substituir certificado + bloquear emissao com certificado vencido (cumpre 3.5/3.7)
- [x] 15.B3 Decriptar o pfx so na borda e enviar `certificadoBase64`+`certificadoSenha` ao motor

### C. Builder do payload estruturado + mapeamentos
- [x] 15.C1 Montar `EmitirNfceRequest` do snapshot+settings+company/establishment (emitente com `crt` string, itens com cfop/origem/csosn suportado, pagamentos `tipo` textual, cert, csc/idcsc, serie/numero, ambiente string)
- [x] 15.C2 Garantir consistencia Sigma itens = valorTotal = Sigma pagamentos (tol. 0,01); mapear `PaymentMethod`->tipo textual (cumpre 5.1-5.4)

### D. Processar resposta + storage
- [x] 15.D1 Gravar chave/protocolo/dataAutorizacao; decodificar `xmlAutorizadoBase64`/`danfeBase64`; gravar `qrCode`; rejeicao->REJEITADO vs ERRO (cumpre 8.6)
- [x] 15.D2 Wire `StorageService`: upload XML+DANFE em `fiscal/{companyId}/{ano}/{mes}/{chave}.(xml|pdf)`; refs no banco; servir do storage (cumpre 8.7/12.4)
- [x] 15.D3 Atualizar `Sale.fiscalStatus` (PROCESSANDO->AUTORIZADO/REJEITADO/CANCELADO) (cumpre 8.8)

### E. Rotas Fase B + orquestracao
- [ ] 15.E1 `POST /fiscal/documents/:id/cancel {justificativa}` (15-255) -> cancelar + gravar `xmlCancelamento`/`dataCancelamento`/CANCELADO + Sale (cumpre 9.x)
- [ ] 15.E2 `POST /fiscal/documents/:id/consulta` -> reconciliar situacao (cumpre 9.1)
- [ ] 15.E3 `POST /fiscal/documents/:id/retry` idempotente (cumpre 10.2)
- [ ] 15.E4 Endpoint teste SEFAZ -> `statusServico` (cumpre 3.8)
- [ ] 15.E5 `GET /fiscal/documents/:id/danfe` (PDF do storage) + expor `qrCode` (cumpre 8.9)

### F. Gaps de DTO/validacao (detectados pelo frontend)
- [ ] 15.F1 `UpdateCompanyDto` aceitar campos fiscais (ou `PATCH /companies/:id/fiscal`) — desbloqueia tela fiscal da empresa
- [ ] 15.F2 `CreateProductDto`/`UpdateProductDto` declarar csosn/cstIcms/cstPis/cstCofins/aliquotas (hoje `whitelist` descarta)
- [ ] 15.F3 Derivar `Product.fiscalComplete` no service, validando contra as regras do motor (NCM 8, CFOP inicia com 5, csosn/cst suportado, origem 0-8)
- [ ] 15.F4 Validar pre-condicoes de emissao com as mesmas regras do motor (falhar cedo com mensagem amigavel)

### G. Infra / docs
- [ ] 15.G1 docker-compose: subir `fiscal_service` (8080) + `FISCAL_API_KEY`; Redis; setar `FISCAL_ENGINE_URL`/`FISCAL_ENGINE_API_KEY` no Nest
- [ ] 15.G2 Health check do motor (`GET /health`) no monitoring (cumpre 7.4)
- [ ] 15.G3 Documentar o contrato em FISCAL.md (cumpre 7.3/13.4; base em ENGINE_ALIGNMENT.md)
