## 1. Dependência e infraestrutura

- [x] 1.1 Instalar `archiver` (ZIP com suporte a stream) — não montar o ZIP inteiro em memória antes de responder
  - Preso na linha **7.x**: a 8.0 é ESM-only e, neste app CommonJS, só carregaria pelo `require(esm)` experimental do Node. O motivo está comentado no import.
- [x] 1.2 Conferir se `StorageService.download` cobre o caso de chave inexistente sem lançar erro que derrube a requisição
  - Ele **lança**. A resolução foi encapsulada em `lerXmlArmazenado`, que devolve `null` em vez de propagar; quem chama decide se isso é `404` (download individual) ou linha ausente no manifesto (exportação).

## 2. Contrato

- [x] 2.1 DTO `ExportXmlsDto`: `dataInicio` e `dataFim` obrigatórios (ISO), `establishmentId`, `modelo` e `ambiente` opcionais
- [x] 2.2 Validar período máximo de 92 dias, com mensagem em PT-BR
  - Em `resolverPeriodo`, não no DTO: a regra compara os dois campos e é a mesma família do teto de documentos, então os dois limites ficam juntos. O DTO valida só o formato.
- [x] 2.3 `ambiente` sem valor assume `PRODUCAO` — exportar homologação exige pedido explícito
- [x] 2.4 Rota `GET /fiscal/documents/xml/export` com `@RequirePermission('fiscal.read')` e `@CurrentCompany()`
  - Declarada antes de `documents/:id` para não depender da ordem de match do Nest.

## 3. Montagem do ZIP

- [x] 3.1 Consultar documentos com `{ companyId, deletedAt: null, status: { in: [AUTORIZADO, CANCELADO] } }` no período
  - Recorte pela **data de emissão**: é a data que consta do XML e que define em qual período o contador escritura.
- [x] 3.2 Recusar com `400` acima de 5.000 documentos, antes de começar a montar
- [x] 3.3 Resolver o XML de cada documento nos dois formatos possíveis: conteúdo na coluna `xmlAutorizado` ou chave do storage
- [x] 3.4 Documento `CANCELADO` também leva o XML do evento de cancelamento
- [x] 3.5 Nomear os arquivos como `<chave>-nfe.xml` e `<chave>-cancelamento.xml`
- [x] 3.6 Gerar `_relacao.csv` com chave, número, série, modelo, data de autorização, status, valor total e indicador de arquivo ausente
- [x] 3.7 XML não recuperável entra como ausente no manifesto e **não** interrompe a exportação
- [x] 3.8 Nome do ZIP com empresa, período e ambiente, deixando homologação identificada

## 4. Streaming e resposta

- [x] 4.1 Responder com `Content-Type: application/zip` e `Content-Disposition: attachment`
- [x] 4.2 Encaminhar o arquivo em stream, sem acumular tudo em memória
  - O ZIP sai em stream e os XMLs do storage são lidos um a um. **Ressalva:** quando o storage não está configurado, o XML mora na coluna e vem inteiro no `findMany` — aí o lote carrega tudo, por construção do modelo. É o cenário que o teto de 5.000 documentos limita (~25 MB).
- [x] 4.3 Tratar falha no meio do stream sem deixar o cliente com ZIP truncado silenciosamente
  - `archive.destroy(erro)` aborta o stream: o download falha visivelmente em vez de entregar um ZIP incompleto que parece completo.

## 5. Testes

- [x] 5.1 Período com documentos autorizados e cancelados → ZIP com os dois XMLs do cancelado
- [x] 5.2 Documentos `REJEITADO`/`ERRO`/`PENDENTE` ficam de fora
  - Verificado pelo `where` da consulta (Prisma mockado), não contra banco real.
- [x] 5.3 Período vazio devolve ZIP só com manifesto, `200`
- [x] 5.4 XML indisponível no storage → manifesto marca ausente e a exportação segue
- [x] 5.5 Período acima de 92 dias e lote acima de 5.000 → `400` com mensagem em PT-BR
- [x] 5.6 Isolamento por `companyId` mesmo com `establishmentId` de outra empresa
- [x] 5.7 `npm test` verde — 610 testes, 34 suítes
- [x] 5.8 Validação ponta a ponta com banco e storage reais — exportação baixada e conferida pelo usuário em 12/08/2026

## 6. Documentação

- [x] 6.1 `API.md`: rota, filtros, formato do ZIP, conteúdo do manifesto e os limites
- [x] 6.2 `FISCAL.md`: registrar que a plataforma alimenta o contador por XML e não gera SPED
- [x] 6.3 Avisar a change irmã do frontend que o contrato está publicado
