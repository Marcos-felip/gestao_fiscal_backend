# Roteiro Fiscal — da NFC-e à NF-e completa

Sequência das etapas que levam o produto de "emite NFC-e a consumidor final" a
"emite NF-e completa, com devolução, carta de correção e cancelamento".

Este arquivo é o **mapa**, não a especificação. Cada etapa tem uma change própria
em `openspec/changes/`, e as changes irmãs nos outros repositórios.

## Contexto que define a ordem

**O contador recebe os XMLs.** A plataforma não gera SPED. Isso significa que o
XML é o entregável final: o software do contador lê os grupos `<ICMS>`, `<IPI>`,
`<PIS>` e `<COFINS>` de cada item e monta a EFD a partir deles. O que estiver
errado no XML vira escrituração errada, e o contador não tem como perceber —
ele não vê o banco de dados, vê o arquivo.

**O snapshot é congelado.** `FiscalDocument.snapshot` é gravado na criação e
nunca reconstruído (`fiscal-emission.processor.ts` lê `document.snapshot`
direto). É a decisão certa para auditoria, e tem um corolário duro:

> O que não entrou no snapshot na hora da emissão não entra nunca mais.

Nota emitida sem base de cálculo e alíquota não vira escrituração correta depois.
Não é bug com conserto — é dado que não foi capturado. É daqui que vem a urgência
da etapa 1.

## As etapas

| # | Etapa | Repos | Estado |
|---|---|---|---|
| 0 | Exportar XMLs em lote por período | backend, frontend | ✅ concluída |
| 1 | Contrato tributário do item | motor, backend, frontend | ✅ concluída |
| 2 | Regra fiscal por operação | backend, frontend | ⏸ **adiada** — ver abaixo |
| 3 | NF-e modelo 55: emissão **interna** | motor, backend, frontend | ✅ implementada — falta emitir em homologação |
| 4 | Eventos: CC-e e inutilização | motor, backend, frontend | **próxima** |
| 5 | Devolução de mercadoria | backend, frontend | ⏸ **adiada** |
| 6 | IBS e CBS | motor, backend | 2027 |

> **Escopo definido em 12/08/2026: NFC-e e NF-e, ambas dentro do estado.**
> Sem venda interestadual, e sem NFS-e por enquanto. É o que reordena o roteiro.

### Nomes das changes

| # | Change |
|---|---|
| 0 | `exportar-xmls-em-lote` |
| 1 | `contrato-tributario-do-item` |
| 2 | `regra-fiscal-por-operacao` |
| 3 | `emitir-nfe-modelo-55` |
| 4 | `eventos-cce-e-inutilizacao` |
| 5 | `devolucao-de-mercadoria` |
| 6 | `tributos-ibs-cbs` |

## Por que esta ordem

A ordem não é preferência — cada etapa é pré-requisito técnico da seguinte.

**0 antes de tudo** porque é a única que entrega valor sem depender de nada. Hoje
só existe `GET /fiscal/documents/:id/xml/:tipo`, um documento por vez: fechar um
mês com 300 notas significa 300 downloads. É pequena e o contador precisa dela no
próximo fechamento.

**1 antes de 2, 3 e 5** porque hoje o item não carrega imposto. O `NfceItem` leva
NCM, CFOP, unidade, quantidade, valor, GTIN, origem e CSOSN — não leva base,
alíquota nem valores. O motor completa o que falta com regra fixa
(`DFeNetAdapter.MontarImposto` crava PIS e COFINS em CST 07). Enquanto isso for
verdade:

- **Devolução é impossível.** Devolução espelha os impostos da nota original; se
  a original não guardou base e alíquota, não há o que espelhar.
- **Regime Normal não emite.** Os CST aceitos são 40, 41 e 50 — isenta, não
  tributada e suspensão. Venda com ICMS destacado não passa.
- **Interestadual não chega ao motor.** `isCfopValido` exige CFOP `5xxx`.

**2 saiu da frente da 3** quando o escopo virou operação interna. O argumento
original era que NF-e interestadual precisa resolver CFOP 6xxx, DIFAL e ST por
operação — e isso continua verdade, para quem vende para fora. Dentro de um
estado só, a operação praticamente não varia: o mesmo produto tem a mesma
resposta no balcão e na venda para outra empresa da mesma UF. Ver "Etapa 2
adiada", abaixo.

**4 depois de 3** porque opera sobre NF-e emitida. **5 foi adiada** em
12/08/2026, junto com a 2 — devolução não entra no escopo atual.

**6 tem prazo externo.** A CBS entra valendo em 2027. A `Zeus.Net.NFe.NFCe`
2026.7.16 já traz os grupos da reforma, então o trabalho é de adapter e contrato,
não de troca de biblioteca.

## Etapa 2 adiada — e por quê

**A regra fiscal por operação existe para responder o que muda quando a operação
muda.** Dentro de um estado só, quase nada muda:

| Operação | CFOP | Situação |
|---|---|---|
| Balcão, consumidor final | 5405 | CSOSN 500 |
| Venda para empresa da mesma UF | 5405 | CSOSN 500 |

Mesmo produto, mesma resposta. E quando a operação não varia, **o cadastro do
produto é o lugar certo da resposta** — que é exatamente o que a
`CadastroDoProdutoRule` já faz, desde a costura entregue na etapa 2.

O que falta para a emissão sair correta hoje **não é código**: é o CSOSN certo em
cada produto. Cerveja e refrigerante em 500 (ST em MG), alimento preparado no que
o contador determinar. Trabalho de cadastro, uma vez, com quem sabe.

### O que foi feito da etapa 2 — e revertido

A porta `IRegraFiscal` e a `CadastroDoProdutoRule` chegaram a ser implementadas
e foram **revertidas** no mesmo dia, quando a devolução saiu do escopo.

A costura só se paga quando existe uma segunda implementação. A única prevista
era a devolução; sem ela, restava indireção pura — e `regraAplicada` gravando o
mesmo valor em todo documento, para sempre, num snapshot que é congelado.

O desenho está preservado no `design.md` da change. Refazer é meio dia; refazer
com o segundo caso em mãos é melhor do que ter adivinhado a forma antes dele.

### O que fica em espera

Modelo de regras, resolvedor por especificidade, CRUD e conjunto base por UF e
ramo. São as seções 3, 4 e 6 da change.

### O que reabre a etapa 2

Qualquer uma destas:

1. **Venda para fora do estado** — volta CFOP 6xxx, DIFAL, ST interestadual, e
   com eles a decisão de assinar ou construir a matriz.
2. **Devolução** (etapa 5) — CFOP 1202 espelhando a nota original é a primeira
   operação que realmente varia dentro do mesmo estado. **Também adiada em
   12/08/2026**, o que remove o último caso conhecido de operação variável no
   escopo atual.
3. **Produto cuja resposta dependa do comprador** dentro da mesma UF.

Enquanto nenhuma acontecer, a etapa 2 completa é custo sem uso.


## O que a etapa 3 deixou em aberto

Implementada nos três repositórios em 13/08/2026, com 121 testes no motor, 674
no backend e 273 no frontend. O que **não** foi feito, e por quê:

- **Emissão real em homologação.** Falta um cliente PJ com código IBGE e
  indicador de IE cadastrados, e uma venda para ele. É o mesmo passo que fechou
  a etapa 1 — sem ele, o caminho está testado mas não exercitado.
- **DANFE do modelo 55 é HTML, não PDF.** O layout retrato pronto depende de
  `System.Drawing.Common`, Windows-only no .NET 8, e o motor roda em contêiner
  Linux — medido, não suposto. O download no frontend ainda assume PDF.
- **Transporte, volumes e cobrança** existem no contrato dos três repositórios e
  têm teste, mas o formulário não os coleta: venda de balcão não tem frete, e o
  grupo ausente já significa "sem frete".
- **Série e numeração de NF-e na tela de configuração.** O backend tem os
  campos; a tela só é necessária para continuar numeração vinda de outro sistema.
- **Estoque por estabelecimento** (seção 1c da change) continua adiado: cada
  empresa da base tem uma MATRIZ e nenhuma filial, então a limitação não é
  observável. Ela passa a existir na primeira filial.

## Aviso sobre a validade destas changes

As changes das sete etapas foram escritas **de uma vez**, a pedido, para serem
aplicadas e arquivadas em sequência. Isso tem um custo conhecido:

- **Etapas 0 a 2** foram escritas contra o código real e conferidas nele. Podem
  ser implementadas como estão.
- **Etapas 3 a 5** foram escritas antes de a etapa 1 existir. O contrato do item
  vai ensinar coisas que provavelmente mudam detalhes delas. **Revise a proposta
  antes de implementar** — use `openspec-update-change`, não comece direto pelas
  tasks.
- **Etapa 6** depende de NT que ainda está sendo revisada. A tabela de
  `cClassTrib` e os grupos de IBS/CBS mudam entre versões do Informe Técnico.
  **Revalide contra a NT vigente** antes de escrever qualquer linha.

Uma spec escrita hoje para trabalho que começa em seis meses envelhece. O roteiro
não envelhece; os detalhes sim.

## Fora do roteiro

- **Geração de SPED** (EFD ICMS/IPI e EFD Contribuições) — a plataforma alimenta
  o contador com XML; quem escritura é ele.
- **Sintegra** — confirmar necessidade antes de investir: a maioria dos estados
  dispensou para quem entrega EFD.
- **NFS-e** — **prevista para o futuro, não descartada** (confirmado em
  12/08/2026). Fica fora deste roteiro, que é inteiro sobre mercadoria. Quando
  entrar, é frente própria e provavelmente maior que qualquer etapa daqui: a
  nota de serviço é **municipal**, cada prefeitura tem seu padrão, e o motor
  atual não serve.

  Isso importa para o plano comercial: **clínica não emite NF-e**, emite NFS-e; e
  **oficina emite as duas** — a peça é mercadoria, a mão de obra é serviço.
  Enquanto a NFS-e não existir, esses dois ramos não são atendidos por completo.
- **CT-e, MDF-e, manifestação do destinatário, DF-e**.
- **Certificado A3** — a arquitetura é cloud e stateless; A1 resolve.
