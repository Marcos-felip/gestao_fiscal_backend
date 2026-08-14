## Why

O sistema tem um evento fiscal só: cancelamento. Faltam dois que a operação real
exige.

**Carta de Correção.** Nota autorizada não pode ser alterada, mas erro de
digitação em campo não essencial acontece. A CC-e é o instrumento legal, tem
limite de 20 por nota e **não pode alterar valores, datas nem as partes**. Sem
ela, o único caminho para um erro de descrição é cancelar e reemitir — o que nem
sempre é possível dentro do prazo.

**Inutilização.** Quando um número é queimado e nunca será usado — falha
definitiva na emissão, salto na sequência — o fisco exige inutilização formal da
faixa. Buraco na numeração é apontamento. O sistema hoje não tem como registrar
isso: o `FiscalDocumentStatus` já tem o valor `INUTILIZADO`, e nada o produz.

## What Changes

- **Carta de correção** por documento autorizado, com histórico próprio: cada
  CC-e é um evento com sequência, texto e XML guardados.
- **Inutilização de faixa** por série, modelo e ambiente, criando registro
  próprio — não é um `FiscalDocument`, é um ato sobre numeração que nunca virou
  documento.
- **Regras impostas antes da SEFAZ**: limite de 20 correções, texto de 15 a 1000
  caracteres, sequência incremental. Erro do usuário deve aparecer em português,
  não como rejeição.
- **Cancelamento estendido ao modelo 55**, com os prazos de cada modelo.
- **Permissões** `fiscal.cce` e `fiscal.inutilizar`, separadas — corrigir nota e
  inutilizar faixa são atos de peso diferente.
- **XML dos eventos entra na exportação em lote** da etapa 0: o contador precisa
  da CC-e junto da nota que ela corrige.

## Capabilities

### New Capabilities
- `fiscal-events`: eventos fiscais além do cancelamento — carta de correção e
  inutilização de numeração, com histórico e arquivos.

### Modified Capabilities
- `fiscal-document`: o ciclo de vida passa a produzir o status `INUTILIZADO`, que
  hoje existe no enum sem nada que o gere.
- `fiscal-file-export`: a exportação passa a incluir os XMLs de carta de correção.

## Impact

- **Migrations**: tabela de eventos de correção e tabela de inutilização;
  permissões novas com os **três passos**.
- `src/fiscal/` — casos de uso, rotas e persistência dos dois eventos.
- **Depende da etapa 3** para o cancelamento do modelo 55, e da **etapa 0** para
  a exportação incluir os XMLs de CC-e.
- **Revisar antes de implementar** — ver o aviso no roteiro fiscal.
- Changes irmãs no `fiscal_service` e no frontend.
- Etapa **4** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
