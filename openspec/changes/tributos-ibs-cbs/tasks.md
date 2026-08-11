> ⚠️ **Antes de qualquer tarefa:** revalide a proposta e os requisitos contra a
> NT vigente. Foram escritos em 11/08/2026.

## 1. Revalidação

- [ ] 1.1 Identificar a NT e a versão do Informe Técnico vigentes
- [ ] 1.2 Confirmar o que é obrigatório na data da implementação
- [ ] 1.3 Rodar `openspec-update-change` sobre esta change com o que foi apurado
- [ ] 1.4 Conferir se a change irmã do motor já publicou o contrato

## 2. Cadastro da classificação tributária

- [ ] 2.1 Tabela de classificação tributária como **dado**, não enum de código
- [ ] 2.2 Rotina de atualização da tabela sem exigir deploy
- [ ] 2.3 Recusar item que referencie classificação inexistente, nomeando o código

## 3. Modelo

- [ ] 3.1 Campos de IBS/CBS no produto e na regra fiscal
- [ ] 3.2 Imposto Seletivo onde aplicável
- [ ] 3.3 Migrations correspondentes

## 4. Resolução e snapshot

- [ ] 4.1 A porta `IRegraFiscal` passa a resolver também a classificação tributária
- [ ] 4.2 Bloco de IBS/CBS no quadro tributário do item
- [ ] 4.3 Incrementar a versão do snapshot, mantendo a leitura das anteriores
- [ ] 4.4 Totais de IBS e CBS somados dos itens, com a tolerância já usada

## 5. Testes

- [ ] 5.1 Item com e sem os tributos da reforma
- [ ] 5.2 Classificação desconhecida recusada
- [ ] 5.3 Totais somados; divergência bloqueia a emissão
- [ ] 5.4 Snapshot de versão anterior continua legível
- [ ] 5.5 **Regressão:** emissão fora do regime da reforma inalterada
- [ ] 5.6 `npm test` verde

## 6. Documentação

- [ ] 6.1 `FISCAL.md`: os tributos da reforma e a versão da NT implementada
- [ ] 6.2 `BANCO_DE_DADOS.md`: tabelas e campos novos
- [ ] 6.3 `API.md`: campos novos no produto e na regra fiscal
- [ ] 6.4 Registrar a versão da NT em lugar visível — sem isso a próxima revalidação recomeça do zero
