> ⚠️ **Revalide antes de implementar.** Escrita em 11/08/2026 contra o
> entendimento da reforma tributária naquele momento. A tabela de `cClassTrib` e
> os grupos de IBS/CBS vêm sendo revisados entre versões do Informe Técnico.

## Why

A CBS entra valendo em 2027 e o IBS na sequência. Uma plataforma que lança agora
e opera além disso precisa dos tributos da reforma no documento fiscal.

Hoje não é bloqueante — a nota 7 foi autorizada pela SEFAZ-MG em 10/08/2026 sem
nenhum grupo de IBS/CBS. O que existe é prazo, não urgência.

Esta etapa vem por último de propósito: modelar antes de a NT estabilizar produz
migration de arrependimento. O que **não** pode acontecer é a etapa 1 desenhar o
quadro tributário sem deixar espaço para estes tributos — e é por isso que ela já
prevê a extensão.

## What Changes

- **Bloco de IBS/CBS por item** no snapshot e no payload: situação tributária,
  classificação tributária, alíquotas de IBS estadual e municipal, alíquota de
  CBS, reduções, diferimentos, créditos presumidos e valores.
- **Classificação tributária como dado, não enum de código.** A tabela oficial é
  atualizada com frequência; precisa ser cadastro consultável e versionável, não
  constante em TypeScript. Repetir aqui o erro do CST fixo do motor seria não ter
  aprendido nada com a etapa 1.
- **Resolução pela regra fiscal da etapa 2**: quem determina a classificação por
  NCM e operação é a mesma porta que já resolve CFOP e situação tributária.
- **Imposto Seletivo** nos produtos sujeitos a ele.
- **Totais de IBS e CBS** no documento.
- **Convivência** com o regime anterior durante a transição.

## Capabilities

### New Capabilities
- `fiscal-reform-taxation`: tributos da reforma — IBS, CBS e Imposto Seletivo —
  no cadastro, na resolução por operação e no documento fiscal.

### Modified Capabilities
- `fiscal-taxation`: o quadro tributário do item passa a comportar os tributos da
  reforma.
- `fiscal-rules`: a resolução por operação passa a determinar a classificação
  tributária.

## Impact

- **Migrations**: tabela de classificação tributária (dado atualizável), campos
  no produto e na regra fiscal.
- `src/fiscal/emission/` — bloco novo no snapshot, com incremento de versão.
- **Depende das etapas 1 e 2.**
- **Custo de errar o momento**: modelar contra NT desatualizada gera migration
  que precisa ser desfeita. A primeira tarefa desta change é revalidar.
- Change irmã no `fiscal_service`.
- Etapa **6** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
