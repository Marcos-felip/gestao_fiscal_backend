> **Reveja esta proposta antes de começar.** É a escrita mais longe do código
> real — depende das etapas 1, 2 e 3, nenhuma delas existente quando foi
> redigida. Rode `openspec-update-change` antes de qualquer implementação.

## 1. Pré-requisitos

- [ ] 1.1 Etapas 1, 2 e 3 aplicadas
- [ ] 1.2 Revisar esta proposta contra o contrato do item, a regra fiscal e a NF-e reais

## 2. Migrations

- [ ] 2.1 Vínculo documento de devolução → documento original
- [ ] 2.2 Itens devolvidos com quantidade, para controle de saldo
- [ ] 2.3 Permissão `fiscal.devolucao` com os **três passos**

## 3. Saldo devolvível

- [ ] 3.1 Cálculo do saldo por item: quantidade da original menos o já devolvido
- [ ] 3.2 Recusar devolução acima do saldo, informando o disponível
- [ ] 3.3 Considerar apenas devoluções autorizadas no cálculo — rejeitada não consome saldo

## 4. Emissão da devolução

- [ ] 4.1 Snapshot próprio, com `finNFe` de devolução e `refNFe` da original
- [ ] 4.2 Espelhar o quadro tributário da original, proporcional à quantidade devolvida
- [ ] 4.3 Recusar quando a original não tiver quadro tributário no snapshot
- [ ] 4.4 CFOP de devolução resolvido pela regra fiscal, a partir do CFOP da original
- [ ] 4.5 Reaproveitar a fila de emissão, com o modelo e a finalidade carimbados

## 5. Contrapartidas

- [ ] 5.1 Movimentação `ENTRADA` de estoque vinculada à devolução
- [ ] 5.2 Abatimento ou cancelamento do título a receber, conforme a proporção
- [ ] 5.3 Tudo na mesma transação — falha na emissão não move estoque nem financeiro

## 6. Rastreabilidade

- [ ] 6.1 Navegação nos dois sentidos entre devolução e original
- [ ] 6.2 Saldo devolvível por item exposto na consulta da original

## 7. Testes

- [ ] 7.1 Devolução total e parcial
- [ ] 7.2 Espelho proporcional dos impostos
- [ ] 7.3 Alíquota alterada depois da original não afeta a devolução
- [ ] 7.4 Original sem quadro tributário recusada
- [ ] 7.5 Devolução acima do saldo recusada; devolução dentro do saldo aceita
- [ ] 7.6 Estoque e financeiro ajustados; falha na emissão não altera nenhum dos dois
- [ ] 7.7 `npm test` verde

## 8. Documentação

- [ ] 8.1 `API.md`: rota, regras de saldo e permissão
- [ ] 8.2 `REGRAS_DE_NEGOCIO.md`: espelho de impostos e saldo devolvível
- [ ] 8.3 Avisar a change irmã do frontend
