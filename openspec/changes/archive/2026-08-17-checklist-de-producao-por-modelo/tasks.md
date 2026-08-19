> **Revise esta proposta antes de implementar.** Ela foi escrita em 14/08/2026,
> contra o `buildProductionChecklist` que existe hoje.

## 1. Migration

- [x] 1.1 Campo `modelos_emitidos` em `fiscal_settings`, aceitando os dois
- [x] 1.2 Backfill: CSC configurado → NFC-e; NF-e já emitida → NF-e; nada revelado → os dois

## 2. Checklist

- [x] 2.1 Cada item declara a que modelos se aplica
- [x] 2.2 Apuração filtra pelos modelos do estabelecimento
- [x] 2.3 Série e próximo número viram um item por modelo, nomeando qual
- [x] 2.4 CSC, ID do CSC e consulta pública passam a ser itens da NFC-e
- [x] 2.5 Certificado continua valendo para todos — a assinatura é a mesma
- [x] 2.6 Item não bloqueante com a contagem de produtos com pendência fiscal

## 3. Liberação

- [x] 3.1 A liberação continua recusando enquanto houver bloqueante pendente, agora sobre o conjunto filtrado
- [x] 3.2 Auditoria da liberação registrar **quais modelos** foram liberados. `valorNovo`
  passa a trazer os modelos em português (`NFC-e, NF-e`) em vez de `true`; a revogação
  registra em `valorAnterior` os que deixaram de valer. Lista vazia continua valendo como
  "os dois", pela mesma apuração do checklist

## 4. Testes

- [x] 4.1 Estabelecimento só de NFC-e: itens do modelo 55 ausentes
- [x] 4.2 Estabelecimento só de NF-e: CSC e consulta pública não bloqueiam
- [x] 4.3 Série de NF-e inválida bloqueia quando o modelo é emitido
- [x] 4.4 Contagem de produtos pendentes não bloqueia
- [x] 4.5 Configuração sem nenhum modelo é recusada (validação do DTO)
- [x] 4.6 `npm test` verde — 742 testes

## 5. Documentação

- [x] 5.1 `API.md`: o campo novo e o formato do checklist
- [x] 5.2 `FISCAL.md`: o que cada modelo exige para produção
- [x] 5.3 Avisar a change irmã do frontend

## 6. Fora do escopo

- [ ] 6.1 **Liberar produção de verdade e emitir a primeira nota real** — decisão do
  lojista com o contador, e depende do CSC de produção emitido pela SEFAZ. Esta
  change entrega o portão, não o atravessa
