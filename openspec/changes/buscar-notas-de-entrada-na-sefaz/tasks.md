> **Depende de `importar-nota-de-entrada-por-xml` estar pronta.** Esta change
> entrega a origem do XML; a irmã entrega o que fazer com ele. Fora de ordem, não
> há para onde mandar o arquivo baixado.

## 1. Motor .NET

- [ ] 1.1 `POST /api/dfe/distribuicao` — consulta por NSU, devolve documentos com NSU, tipo e conteúdo
- [ ] 1.2 `POST /api/dfe/distribuicao/chave` — consulta uma chave específica
- [ ] 1.3 `POST /api/dfe/manifestar` — eventos 210200, 210210, 210220 e 210240
- [ ] 1.4 Consumo indevido devolvido como recusa da SEFAZ, **não** como falha de rede
- [ ] 1.5 Timeout de 30s, como o resto do motor

## 2. Banco

- [ ] 2.1 `dfe_documents`: NSU, chave, tipo, emitente, valor, situação, manifestação, storage key
- [ ] 2.2 `dfe_cursors`: último NSU **por estabelecimento e ambiente**
- [ ] 2.3 Permissões `dfe.read` e `dfe.manifestar` com os **3 passos**, incluindo o backfill

## 3. Descoberta

- [ ] 3.1 Job por estabelecimento, partindo do cursor
- [ ] 3.2 Cursor avança **só** até o documento efetivamente gravado
- [ ] 3.3 Recusa por consumo indevido registrada e respeitada antes de reconsultar
- [ ] 3.4 CT-e e MDF-e registrados pelo tipo, sem tratamento — mas não silenciados
- [ ] 3.5 Primeira carga marcada como histórica, sem virar pendência de decisão

## 4. Manifestação

- [ ] 4.1 Os quatro eventos, com protocolo e XML guardados
- [ ] 4.2 Nenhum evento enviado sem comando do usuário
- [ ] 4.3 Ciência libera o download do XML completo
- [ ] 4.4 Recusa exibe código e motivo, preservando a situação anterior

## 5. Ligação com a importação

- [ ] 5.1 XML completo entra pelo motor de importação da change irmã
- [ ] 5.2 Origem (upload ou SEFAZ) registrada na importação
- [ ] 5.3 Chave já importada recusada, venha de onde vier
- [ ] 5.4 Documento em resumo **não** oferece importação

## 6. Alerta

- [ ] 6.1 Emitente sem compra anterior destacado — é o formato da nota fria

## 7. Testes

- [ ] 7.1 Cursor retoma de onde parou
- [ ] 7.2 Falha no meio do lote não avança o cursor além do gravado
- [ ] 7.3 Consumo indevido não vira erro genérico
- [ ] 7.4 Resumo não gera compra
- [ ] 7.5 Ciência muda a situação e libera a importação
- [ ] 7.6 Chave já importada por upload é recusada na SEFAZ, e vice-versa
- [ ] 7.7 `npm test` verde

## 8. Documentação

- [ ] 8.1 `FISCAL.md`: distribuição, NSU e manifestação
- [ ] 8.2 `API.md` e `BANCO_DE_DADOS.md`
- [ ] 8.3 `ROADMAP_FISCAL.md`: manifestação sai de "fora do roteiro"

## 9. Fora do escopo

- [ ] 9.1 **Prazo legal da manifestação** — alerta fica para a change seguinte
- [ ] 9.2 **CT-e e MDF-e** tratados de verdade
- [ ] 9.3 **Manifestação automática** — decisão de projeto, não omissão
