> **Podada em 14/08/2026** contra o código real e contra o que a etapa 3
> produziu.

## 1. Pré-requisitos

- [x] 1.1 Etapa 3 aplicada e arquivada em 14/08/2026 — o cancelamento já atende o modelo 55
- [x] 1.2 Etapa 0 aplicada (a exportação passa a incluir os XMLs de CC-e)
- [x] 1.3 Change irmã do `fiscal_service` no ar — contrato em `fiscal_service/docs/CONTRATO_EVENTOS.md`
- [x] 1.4 Revisar esta proposta contra o que as etapas anteriores produziram

## 2. Migrations

- [x] 2.1 Tabela de carta de correção: documento, sequência, texto, protocolo, XML, autor e data
- [x] 2.2 Tabela de inutilização: série, modelo, ambiente, faixa, justificativa, protocolo, XML
- [x] 2.3 Permissões `fiscal.cce` e `fiscal.inutilizar` com os **três passos**

## 3. Carta de correção

- [x] 3.1 Rota e service, exigindo documento `AUTORIZADO`
- [x] 3.2 Sequência atribuída pelo sistema, a partir do que já existe para a nota — **o motor não faz isso:** ele é stateless e só confere a faixa 1 a 20
- [x] 3.3 Validar texto entre 15 e 1000 caracteres, em PT-BR
- [x] 3.4 Recusar acima de 20 correções, citando o limite legal
- [x] 3.5 Guardar XML do evento no storage, no mesmo padrão do cancelamento
- [x] 3.6 Registrar no histórico do documento — inclusive a **recusa** da SEFAZ, antes do `400`

## 4. Inutilização

- [x] 4.1 Rota e service com série, modelo, ambiente, faixa e justificativa
- [x] 4.2 Recusar faixa que contenha número de documento autorizado ou cancelado, nomeando o número e a chave
- [x] 4.2b **Sugerir os buracos:** para uma série, os números de 1 até `proximoNumero - 1` sem documento são exatamente os candidatos. Calculável do que já existe — evita digitar a faixa errada
- [x] 4.3 Documento em erro definitivo passa a `INUTILIZADO` quando sua numeração é inutilizada
- [x] 4.4 Guardar XML e protocolo

## 5. Cancelamento

- [x] 5.1 Estender ao modelo 55 — feito na etapa 3. **O prazo continua sendo da SEFAZ:**
  duplicá-lo aqui criaria uma segunda verdade que envelhece sozinha; a recusa dela
  chega como `400` com o motivo em PT-BR

## 6. Exportação

- [x] 6.1 XMLs de CC-e no ZIP, como `<chave>-cce-NN.xml` — a sequência entra no nome porque
  uma nota aceita até 20 cartas, todas na mesma chave
- [x] 6.2 Manifesto ganha a coluna "Cartas de correção"; correção que não volta do storage
  entra em ausentes como `cce-02`

## 7. Testes

- [x] 7.1 CC-e em documento não autorizado recusada
- [x] 7.2 Texto fora do tamanho recusado (`fiscal-events.dto.spec.ts`)
- [x] 7.3 Sequência atribuída automaticamente e limite de 20 respeitado
- [x] 7.4 Inutilização de faixa com documento autorizado recusada
- [x] 7.5 Faixa invertida recusada, antes de qualquer consulta
- [x] 7.6 Permissões separadas declaradas nas quatro rotas (`fiscal.cce`, `fiscal.inutilizar`,
  `fiscal.read`) — a decisão do guard já é coberta por `require-permission.guard.spec.ts`
- [x] 7.7 Exportação inclui o XML da correção
- [x] 7.8 `npm test` verde

## 8. Documentação

- [x] 8.1 `API.md`: rotas, regras e permissões
- [x] 8.2 `REGRAS_DE_NEGOCIO.md`: o que a CC-e pode e não pode corrigir
- [x] 8.3 `FISCAL.md`: os três eventos e o ciclo de status
- [x] 8.4 Avisar a change irmã do frontend (`gestao_fiscal_frontend/openspec/changes/eventos-cce-e-inutilizacao`)

## 9. Fora do escopo desta change

- [ ] 9.1 Validação ponta a ponta em homologação (CC-e numa nota real e inutilização de
  uma faixa) — depende do motor no ar e do certificado; fica junto da entrega do frontend
