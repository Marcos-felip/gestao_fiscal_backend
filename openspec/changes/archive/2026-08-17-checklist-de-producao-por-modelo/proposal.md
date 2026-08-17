## Why

O checklist de liberação de produção é o último portão antes de a nota valer
dinheiro — e ele só sabe falar de NFC-e.

Os seis itens de `buildProductionChecklist` conferem certificado, **CSC**, série
`serieNfce`, próximo número `proximoNumeroNfce` e **consulta pública do QR Code**.
Três deles são exclusivos do modelo 65. O resultado é errado nos dois sentidos:

- **Libera sem olhar a NF-e.** Um estabelecimento pode passar no checklist inteiro
  sem que ninguém tenha conferido a série nem a numeração do modelo 55. A etapa 3
  entregou sequências independentes por modelo; o portão continua vendo uma só.
- **Barra quem não emite NFC-e.** CSC é bloqueante. Quem vende só para empresas —
  e emite apenas NF-e — não consegue liberar produção por falta de um código que
  não se aplica à operação dele.

Some-se a isso o que a emissão real ensinou em 14/08: o que a SEFAZ recusa não
aparece em teste unitário. O checklist não substitui a primeira nota real, mas é
o que evita que ela falhe por algo que dava para conferir antes.

## What Changes

- **O checklist passa a saber de quais modelos se trata.** Cada item declara a
  quais modelos se aplica, e a apuração considera só os que o estabelecimento vai
  emitir.
- **Série e próximo número ganham uma linha por modelo**, em vez de uma linha que
  olha apenas a NFC-e.
- **CSC e consulta pública viram itens da NFC-e**, deixando de bloquear quem não
  a emite.
- **Item novo, não bloqueante: produtos com pendência fiscal.** Reaproveita o
  `GET /products/fiscal-pending` que já existe. O sistema não pode preencher o
  CSOSN por ninguém, mas pode dizer quantos produtos ainda não emitem **antes** de
  a rejeição aparecer na primeira venda do balcão.
- **A liberação continua exigindo que nenhum item bloqueante esteja pendente** —
  o que muda é o conjunto de itens, não a regra.

## Non-Goals

- **Não libera produção de ninguém, e não emite nada em produção.** A change
  entrega o portão; atravessá-lo é decisão do lojista, com o contador, e depende
  de CSC de produção emitido pela SEFAZ.
- **Não infere quais modelos o estabelecimento emite** a partir do histórico:
  quem sabe se vai emitir NF-e é quem opera, e o histórico de um estabelecimento
  novo é vazio por definição.

## Capabilities

### Modified Capabilities
- `fiscal-configuration`: o checklist de produção passa a ser apurado por modelo,
  e a liberação a considerar apenas o que se aplica.

## Impact

- `src/fiscal/emission/fiscal-preconditions.ts` — o cálculo do checklist.
- `src/fiscal/fiscal.service.ts` — a apuração passa a receber os modelos e a
  contagem de produtos pendentes.
- **Migration**: campo em `fiscal_settings` dizendo quais modelos o
  estabelecimento emite. Sem ele não há como distinguir "não configurou CSC" de
  "não emite NFC-e".
- Change irmã no frontend: a seção de produção passa a mostrar os itens agrupados
  por modelo, e a configuração a perguntar quais modelos o estabelecimento emite.
- Fora do [roteiro fiscal](../../../ROADMAP_FISCAL.md) — é a virada para produção
  que vem **depois** das etapas 0 a 4.
