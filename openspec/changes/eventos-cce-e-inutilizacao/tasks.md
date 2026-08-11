> **Reveja esta proposta antes de começar** — escrita antes das etapas 0 e 3.

## 1. Pré-requisitos

- [ ] 1.1 Etapa 3 aplicada (cancelamento do modelo 55)
- [ ] 1.2 Etapa 0 aplicada (a exportação passa a incluir os XMLs de CC-e)
- [ ] 1.3 Change irmã do `fiscal_service` no ar
- [ ] 1.4 Revisar esta proposta contra o que as etapas anteriores produziram

## 2. Migrations

- [ ] 2.1 Tabela de carta de correção: documento, sequência, texto, protocolo, XML, autor e data
- [ ] 2.2 Tabela de inutilização: série, modelo, ambiente, faixa, justificativa, protocolo, XML
- [ ] 2.3 Permissões `fiscal.cce` e `fiscal.inutilizar` com os **três passos**

## 3. Carta de correção

- [ ] 3.1 Rota e service, exigindo documento `AUTORIZADO`
- [ ] 3.2 Sequência atribuída pelo sistema, a partir do que já existe para a nota
- [ ] 3.3 Validar texto entre 15 e 1000 caracteres, em PT-BR
- [ ] 3.4 Recusar acima de 20 correções, citando o limite legal
- [ ] 3.5 Guardar XML do evento no storage, no mesmo padrão do cancelamento
- [ ] 3.6 Registrar no histórico do documento

## 4. Inutilização

- [ ] 4.1 Rota e service com série, modelo, ambiente, faixa e justificativa
- [ ] 4.2 Recusar faixa que contenha número de documento autorizado, nomeando o conflito
- [ ] 4.3 Documento em erro definitivo passa a `INUTILIZADO` quando sua numeração é inutilizada
- [ ] 4.4 Guardar XML e protocolo

## 5. Cancelamento

- [ ] 5.1 Estender ao modelo 55, com os prazos de cada modelo

## 6. Exportação

- [ ] 6.1 Incluir XMLs de CC-e no ZIP da etapa 0, nomeados pela chave com sufixo próprio
- [ ] 6.2 Refletir as correções no manifesto

## 7. Testes

- [ ] 7.1 CC-e em documento não autorizado recusada
- [ ] 7.2 Texto fora do tamanho recusado
- [ ] 7.3 Sequência atribuída automaticamente e limite de 20 respeitado
- [ ] 7.4 Inutilização de faixa com documento autorizado recusada
- [ ] 7.5 Faixa invertida recusada
- [ ] 7.6 Permissões separadas respeitadas
- [ ] 7.7 Exportação inclui o XML da correção
- [ ] 7.8 `npm test` verde

## 8. Documentação

- [ ] 8.1 `API.md`: rotas, regras e permissões
- [ ] 8.2 `REGRAS_DE_NEGOCIO.md`: o que a CC-e pode e não pode corrigir
- [ ] 8.3 `FISCAL.md`: os três eventos e o ciclo de status
- [ ] 8.4 Avisar a change irmã do frontend
