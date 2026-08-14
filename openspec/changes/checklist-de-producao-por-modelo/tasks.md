> **Revise esta proposta antes de implementar.** Ela foi escrita em 14/08/2026,
> contra o `buildProductionChecklist` que existe hoje.

## 1. Migration

- [ ] 1.1 Campo em `fiscal_settings` com os modelos que o estabelecimento emite, aceitando os dois
- [ ] 1.2 Backfill: quem já tem CSC configurado emite NFC-e; quem já emitiu NF-e emite NF-e. Na dúvida, **os dois** — é o comportamento de hoje e não trava ninguém

## 2. Checklist

- [ ] 2.1 Cada item declara a que modelos se aplica
- [ ] 2.2 Apuração filtra pelos modelos do estabelecimento
- [ ] 2.3 Série e próximo número viram um item por modelo, nomeando qual
- [ ] 2.4 CSC, ID do CSC e consulta pública passam a ser itens da NFC-e
- [ ] 2.5 Certificado continua valendo para todos — a assinatura é a mesma
- [ ] 2.6 Item não bloqueante com a contagem de produtos com pendência fiscal, reaproveitando a consulta de `GET /products/fiscal-pending`

## 3. Liberação

- [ ] 3.1 A liberação continua recusando enquanto houver bloqueante pendente, agora sobre o conjunto filtrado
- [ ] 3.2 Auditoria da liberação registra quais modelos foram liberados

## 4. Testes

- [ ] 4.1 Estabelecimento só de NFC-e: itens do modelo 55 ausentes
- [ ] 4.2 Estabelecimento só de NF-e: CSC e consulta pública não bloqueiam
- [ ] 4.3 Série de NF-e inválida bloqueia quando o modelo é emitido
- [ ] 4.4 Contagem de produtos pendentes não bloqueia
- [ ] 4.5 Configuração sem nenhum modelo é recusada
- [ ] 4.6 `npm test` verde

## 5. Documentação

- [ ] 5.1 `API.md`: o campo novo e o formato do checklist
- [ ] 5.2 `FISCAL.md`: o que cada modelo exige para produção
- [ ] 5.3 Avisar a change irmã do frontend

## 6. Fora do escopo

- [ ] 6.1 **Liberar produção de verdade e emitir a primeira nota real** — decisão do
  lojista com o contador, e depende do CSC de produção emitido pela SEFAZ. Esta
  change entrega o portão, não o atravessa
