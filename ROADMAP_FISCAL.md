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

| # | Etapa | Repos | Destrava |
|---|---|---|---|
| 0 | Exportar XMLs em lote por período | backend, frontend | o fechamento do contador |
| 1 | Contrato tributário do item | motor, backend, frontend | 2, 3, 5 — e o SPED do contador |
| 2 | Regra fiscal por operação | backend, frontend | 3, 5 |
| 3 | NF-e modelo 55: emissão | motor, backend, frontend | 4, 5 |
| 4 | Eventos: CC-e e inutilização | motor, backend, frontend | — |
| 5 | Devolução de mercadoria | backend, frontend | — |
| 6 | IBS e CBS | motor, backend | 2027 |

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

**2 antes de 3** porque NF-e interestadual precisa resolver CFOP 6xxx, DIFAL e ST
por operação. A resposta fiscal não é um campo do produto: é função de NCM/CEST +
regime do emitente + UF de origem + UF de destino + tipo de operação + se o
destinatário é contribuinte.

**4 e 5 depois de 3** porque os dois operam sobre NF-e emitida.

**6 tem prazo externo.** A CBS entra valendo em 2027. A `Zeus.Net.NFe.NFCe`
2026.7.16 já traz os grupos da reforma, então o trabalho é de adapter e contrato,
não de troca de biblioteca.

## Decisões que bloqueiam a etapa 2

**Regra fiscal: construir ou assinar.**

Manter a matriz tributária (quais NCM têm ST em cada UF, MVA, pauta, alíquota
interna, reduções de base) é manutenção perpétua — os estados publicam decreto o
tempo todo. Existem serviços que vendem essa regra por assinatura.

A porta (`IRegraFiscal`, no padrão do `IFiscalEngine`) é o desenho certo nos dois
caminhos. O que mudou foi a recomendação de o que colocar atrás dela.

> **Recomendação revisada em 12/08/2026: assinar.**
>
> A recomendação anterior era construir simples, apoiada na premissa de que o
> primeiro cliente vendia só NFC-e interna a consumidor final — "a matriz dele
> cabe em meia dúzia de regras". **Essa premissa caiu**: o usuário confirmou que
> vai vender para fora do estado.
>
> Isso traz ST interestadual (protocolo e MVA ajustada por combinação
> origem-destino-produto), DIFAL com alíquota interna e FCP de cada UF de
> destino, e pauta fiscal que varia por estado. Não é tabela que se escreve uma
> vez; é manutenção mensal permanente, e errar produz nota autorizada com imposto
> errado.
>
> Pedir orçamento é a **primeira tarefa** da etapa 2. Se o custo inviabilizar, o
> caminho é matriz própria restrita às UFs onde há venda real — decisão
> consciente, não descoberta no meio.

**Quem cadastra as regras não é o lojista.** O dono da lanchonete não sabe o que é
MVA. O modelo é conjunto base por UF e ramo, ajustado no onboarding por quem
conhece a matéria, com o cliente final nunca vendo a tela. A etapa 2 foi revisada
para refletir isso.

**Pergunta aberta para o contador, que muda o escopo pela metade:** emitente do
Simples Nacional recolhe DIFAL em venda a consumidor final não contribuinte de
outra UF? Há entendimento consolidado de que não (ADI 5464, STF). Se confirmado,
toda a partilha sai do escopo das etapas 2 e 3.

O contrato do item da etapa 1 é **idêntico** em todos esses caminhos. Só muda
quem preenche o quadro tributário.

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
- **NFS-e, CT-e, MDF-e, manifestação do destinatário, DF-e**.
- **Certificado A3** — a arquitetura é cloud e stateless; A1 resolve.
