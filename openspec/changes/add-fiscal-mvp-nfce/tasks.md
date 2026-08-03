## 1. Fundação e enums

- [ ] 1.1 Criar módulo `fiscal` (Clean Architecture) no NestJS
- [ ] 1.2 Enum `FiscalDocumentModel` (NFE=55, NFCE=65)
- [ ] 1.3 Enum `FiscalEnvironment` (HOMOLOGACAO=2, PRODUCAO=1)
- [ ] 1.4 Enum `FiscalDocumentStatus` (NAO_EMITIDO, PENDENTE, PROCESSANDO, AUTORIZADO, REJEITADO, ERRO, CONTINGENCIA, CANCELAMENTO_PENDENTE, CANCELADO, INUTILIZADO)
- [ ] 1.5 Enum `TaxRegimeCode`/CRT (1 Simples, 2 Simples excesso, 3 Normal)
- [ ] 1.6 Seed das permissões `fiscal.settings.read/edit`, `fiscal.emit`, `fiscal.cancel`, `fiscal.read` (OWNER/ADMIN por padrão)

## 2. Configuração fiscal da empresa

- [ ] 2.1 Garantir/estender campos fiscais em `Company` (razão social, nome fantasia, CNPJ, IE, IM, CRT, contribuinte de ICMS)
- [ ] 2.2 Endereço fiscal + `codigoIbgeMunicipio` + UF + telefone/e-mail fiscal
- [ ] 2.3 Validar CNPJ/CPF localmente (dígitos verificadores)
- [ ] 2.4 Validar formato de IE e de CEP/UF/código IBGE
- [ ] 2.5 Campo derivado `fiscalConfigComplete` na empresa
- [ ] 2.6 Bloquear emissão quando a configuração da empresa estiver incompleta

## 3. Configuração fiscal do estabelecimento + certificado

- [ ] 3.1 Tabela `FiscalSettings` (1:1 com establishment): ambiente, série NFC-e, próximo número, CSC, idCSC
- [ ] 3.2 Campos do certificado: ref criptografada do A1, ref da senha, validade, subject
- [ ] 3.3 Endpoint obter/gravar `FiscalSettings` do estabelecimento
- [ ] 3.4 Upload de certificado A1 (armazenar criptografado em cofre/KMS, extrair validade/subject)
- [ ] 3.5 Substituir certificado (mantendo auditoria)
- [ ] 3.6 Alertar certificado a ≤30 dias do vencimento
- [ ] 3.7 Bloquear emissão com certificado vencido
- [ ] 3.8 Endpoint "teste de comunicação com a SEFAZ" (chama `IFiscalEngine.statusServico`)

## 4. Dados fiscais dos produtos

- [ ] 4.1 Estender `Product` (ou `ProductFiscal` 1:1): NCM, CEST, origem, CFOP padrão
- [ ] 4.2 CSOSN (Simples) e CST de ICMS/PIS/COFINS (Normal)
- [ ] 4.3 Alíquotas ICMS/PIS/COFINS, unidade comercial, GTIN
- [ ] 4.4 Campo derivado `fiscalComplete` por produto
- [ ] 4.5 Endpoint/relatório de produtos com pendência fiscal
- [ ] 4.6 Bloquear emissão quando algum item da venda estiver fiscalmente incompleto

## 5. Formas de pagamento fiscais

- [ ] 5.1 Mapear `PaymentMethod` → `tPag` (01 dinheiro, 03 crédito, 04 débito, 15 boleto, 17 PIX, 90 vale, 99 outros)
- [ ] 5.2 Tratar pagamento dividido a partir de `SalePayment[]`
- [ ] 5.3 Validar soma dos pagamentos = total da venda
- [ ] 5.4 Calcular troco (`vTroco`) a partir de `amountReceived`

## 6. Documento fiscal, snapshot e status

- [ ] 6.1 Tabela `FiscalDocument` (modelo, série, número, chave, status, ambiente, protocolo, rejeição, datas, valores, XMLs, danfeUrl, qrCode, idempotencyKey, attempts, engine, snapshot)
- [ ] 6.2 Vínculo `FiscalDocument` ↔ venda, empresa e estabelecimento
- [ ] 6.3 Tabela `FiscalStatusHistory` (de/para, motivo, usuário, data)
- [ ] 6.4 Tabela `FiscalDocumentEvent` (genérica; MVP usa cancelamento)
- [ ] 6.5 Snapshot imutável (emitente, destinatário, endereço, itens, impostos, pagamentos, totais) em JSONB
- [ ] 6.6 Proibir exclusão física de documento fiscal (soft/append-only)

## 7. Microserviço .NET (fiscal-engine) + porta

- [ ] 7.1 Criar serviço .NET com DFe.NET (projeto, health check)
- [ ] 7.2 `POST /nfce/emit` (recebe payload + certificado + ambiente → monta, assina, transmite, retorna situação/chave/protocolo/xml/DANFE/QR/rejeição)
- [ ] 7.3 `POST /nfce/consulta` (situação pela chave)
- [ ] 7.4 `POST /nfce/cancel` (evento de cancelamento → protocolo + XML)
- [ ] 7.5 `POST /sefaz/status-servico` (teste de comunicação)
- [ ] 7.6 Autenticação do canal interno (segredo/mTLS) e nunca logar certificado
- [ ] 7.7 Porta `IFiscalEngine` no Nest + implementação `DfeNetFiscalEngine` (HTTP client)

## 8. Emissão de NFC-e (homologação)

- [ ] 8.1 `POST /fiscal/nfce { saleId }` idempotente: validar empresa/estabelecimento/certificado/CSC/numeração/produtos/pagamentos/totais
- [ ] 8.2 Reservar numeração sequencial atômica por série+estabelecimento
- [ ] 8.3 Criar `FiscalDocument` (PENDENTE) + `idempotencyKey` e enfileirar (BullMQ)
- [ ] 8.4 Job de emissão: montar snapshot e chamar `IFiscalEngine.emitirNfce`
- [ ] 8.5 Processar autorização: salvar chave, protocolo, XML autorizado, QR Code
- [ ] 8.6 Gerar/armazenar DANFE NFC-e
- [ ] 8.7 Atualizar status fiscal da venda
- [ ] 8.8 Endpoints de download: XML autorizado e DANFE (+ reimpressão)

## 9. Consulta e cancelamento

- [ ] 9.1 `POST /fiscal/documents/:id/consulta` (situação na SEFAZ)
- [ ] 9.2 `POST /fiscal/documents/:id/cancel { justificativa }` (mín. 15 caracteres)
- [ ] 9.3 Enviar evento de cancelamento e armazenar protocolo + XML de cancelamento
- [ ] 9.4 Atualizar documento para CANCELADO e refletir na venda
- [ ] 9.5 Impedir cancelamento duplicado e tratar cancelamento rejeitado

## 10. Rejeições, idempotência e retry

- [ ] 10.1 Persistir código + mensagem de rejeição + retorno técnico completo
- [ ] 10.2 `POST /fiscal/documents/:id/retry` sem duplicar (respeita idempotência)
- [ ] 10.3 Contar tentativas (`attempts`) e registrar usuário/data de cada uma
- [ ] 10.4 Endpoint da central de rejeições (listar/filtrar por status, período, estabelecimento)

## 11. Produção

- [ ] 11.1 Separar configuração de homologação e produção
- [ ] 11.2 Flag/checklist explícito de ativação (impedir produção por acidente)
- [ ] 11.3 Validar certificado, CSC, série e numeração de produção
- [ ] 11.4 Validar consulta pública da nota autorizada em produção

## 12. Auditoria e storage

- [ ] 12.1 Registrar emissão, cancelamento, download de XML, reimpressão
- [ ] 12.2 Registrar troca de certificado, alteração de série e de CSC
- [ ] 12.3 Registrar mudança de ambiente (homologação↔produção)
- [ ] 12.4 Storage de XML/DANFE (object storage/S3-MinIO) com refs no banco
- [ ] 12.5 Organizar arquivos por empresa/ano/mês

## 13. Endpoints, listagem e docs

- [ ] 13.1 `GET /fiscal/documents` (filtros: status, período, estabelecimento, modelo) e `GET /fiscal/documents/:id`
- [ ] 13.2 Aplicar gating por permissão em todos os endpoints
- [ ] 13.3 Atualizar `API.md`, `REGRAS_DE_NEGOCIO.md`, `BANCO_DE_DADOS.md`
- [ ] 13.4 Criar `FISCAL.md` (arquitetura NestJS↔.NET, contrato do motor, política de certificados, ambientes)

## 14. Critério de conclusão do MVP

- [ ] 14.1 Emitir NFC-e em homologação e em produção
- [ ] 14.2 Consultar situação, gerar/baixar DANFE e XML, reimprimir
- [ ] 14.3 Cancelar, exibir rejeições, evitar duplicidade
- [ ] 14.4 Manter histórico e auditoria completos
