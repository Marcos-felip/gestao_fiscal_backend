## 1. Dependência e infraestrutura

- [ ] 1.1 Instalar `archiver` (ZIP com suporte a stream) — não montar o ZIP inteiro em memória antes de responder
- [ ] 1.2 Conferir se `StorageService.download` cobre o caso de chave inexistente sem lançar erro que derrube a requisição

## 2. Contrato

- [ ] 2.1 DTO `ExportXmlsDto`: `dataInicio` e `dataFim` obrigatórios (ISO), `establishmentId`, `modelo` e `ambiente` opcionais
- [ ] 2.2 Validar período máximo de 92 dias, com mensagem em PT-BR
- [ ] 2.3 `ambiente` sem valor assume `PRODUCAO` — exportar homologação exige pedido explícito
- [ ] 2.4 Rota `GET /fiscal/documents/xml/export` com `@RequirePermission('fiscal.read')` e `@CurrentCompany()`

## 3. Montagem do ZIP

- [ ] 3.1 Consultar documentos com `{ companyId, deletedAt: null, status: { in: [AUTORIZADO, CANCELADO] } }` no período
- [ ] 3.2 Recusar com `400` acima de 5.000 documentos, antes de começar a montar
- [ ] 3.3 Resolver o XML de cada documento nos dois formatos possíveis: conteúdo na coluna `xmlAutorizado` ou chave do storage
- [ ] 3.4 Documento `CANCELADO` também leva o XML do evento de cancelamento
- [ ] 3.5 Nomear os arquivos como `<chave>-nfe.xml` e `<chave>-cancelamento.xml`
- [ ] 3.6 Gerar `_relacao.csv` com chave, número, série, modelo, data de autorização, status, valor total e indicador de arquivo ausente
- [ ] 3.7 XML não recuperável entra como ausente no manifesto e **não** interrompe a exportação
- [ ] 3.8 Nome do ZIP com empresa, período e ambiente, deixando homologação identificada

## 4. Streaming e resposta

- [ ] 4.1 Responder com `Content-Type: application/zip` e `Content-Disposition: attachment`
- [ ] 4.2 Encaminhar o arquivo em stream, sem acumular tudo em memória
- [ ] 4.3 Tratar falha no meio do stream sem deixar o cliente com ZIP truncado silenciosamente

## 5. Testes

- [ ] 5.1 Período com documentos autorizados e cancelados → ZIP com os dois XMLs do cancelado
- [ ] 5.2 Documentos `REJEITADO`/`ERRO`/`PENDENTE` ficam de fora
- [ ] 5.3 Período vazio devolve ZIP só com manifesto, `200`
- [ ] 5.4 XML indisponível no storage → manifesto marca ausente e a exportação segue
- [ ] 5.5 Período acima de 92 dias e lote acima de 5.000 → `400` com mensagem em PT-BR
- [ ] 5.6 Isolamento por `companyId` mesmo com `establishmentId` de outra empresa
- [ ] 5.7 `npm test` verde

## 6. Documentação

- [ ] 6.1 `API.md`: rota, filtros, formato do ZIP, conteúdo do manifesto e os limites
- [ ] 6.2 `FISCAL.md`: registrar que a plataforma alimenta o contador por XML e não gera SPED
- [ ] 6.3 Avisar a change irmã do frontend que o contrato está publicado
