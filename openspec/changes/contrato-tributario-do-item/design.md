# Design — Contrato tributário do item

## Escopo: capturar o dado, não calcular imposto

Esta etapa **não** implementa cálculo tributário. Ela cria a estrutura e a
preenche com o que o cadastro já sabe.

Para o cliente atual — Simples Nacional, CSOSN 102, venda interna a consumidor
final — o quadro tributário correto é quase todo vazio: `ICMSSN102` não comporta
valores. O ganho não é o valor gravado hoje; é que a **estrutura existe**, e a
partir de agora toda nota nasce com ela.

Quem preenche com regra de verdade é a etapa 2 (`regra-fiscal-por-operacao`).
O contrato é idêntico nos dois casos: muda só quem responde.

## Versão do snapshot: 1 → 2

`FiscalSnapshot.versao` existe desde a Fase A e nunca foi usado. É agora.

`lerSnapshot` (`emit-request.builder.ts`) hoje recusa qualquer coisa que não seja
`versao === 1`. Passa a aceitar 1 e 2:

- **Versão 2** — item com bloco `imposto`. Caminho novo.
- **Versão 1** — item sem o bloco. Continua emitindo pela regra antiga, através
  do fallback do motor.

Por que manter a leitura da versão 1: existem documentos em `ERRO` e `REJEITADO`
no banco que ainda podem ser reprocessados, e a consulta de documento antigo lê o
snapshot para exibir os itens. Quebrar a leitura transformaria histórico em lixo.

**A versão 1 não deve ser recriada.** Nenhum documento novo nasce em versão 1
depois desta change.

## O backfill dos produtos

Problema: `fiscalComplete` passa a exigir CST de PIS e COFINS. Os produtos
existentes têm os dois nulos. Sem backfill, no dia do deploy **nenhum produto
está fiscalmente completo e nenhuma nota é emitida**.

Decisão: migration preenchendo `cst_pis` e `cst_cofins` com o valor que
**reproduz exatamente o comportamento de hoje** nos produtos que estão nulos.

Isso é deliberado e merece ser dito com clareza: o valor escolhido não é
necessariamente o *correto* para cada produto — é o que o motor já vinha
mandando. A change não tem como saber que a cerveja é monofásica; quem sabe é o
contador.

O que o backfill garante: **nenhuma emissão para, e nenhum XML muda de conteúdo
no dia do deploy.** A correção por produto vem depois, com informação que o
sistema não tem.

Alternativas descartadas:

- **Deixar nulo e bloquear a emissão** — para o cliente no dia do deploy para
  resolver um problema que não é urgente naquele instante.
- **Adivinhar por NCM** — exigiria a tabela de monofásicos, que é justamente o
  tipo de matriz da etapa 2. Fazer aqui é antecipar a etapa errada.

A tarefa que sobra, e que precisa ficar registrada em algum lugar visível: **o
contador precisa revisar o CST de PIS/COFINS dos produtos**, em especial bebidas.

## Espelhar a validação do motor, de novo

`fiscal-rules.ts` já existe com esse propósito declarado:

> *"Estas validações são as mesmas aplicadas pelo `fiscal_service`: repeti-las
> aqui faz a emissão falhar cedo, com mensagem em português, em vez de virar
> rejeição da SEFAZ depois de consumir um número de nota."*

O mesmo vale para o quadro tributário. A regra de "qual campo cada CST exige"
existe nos dois lados de propósito: no motor porque ele monta o XML, aqui porque
é onde o erro pode ser explicado ao usuário antes de queimar numeração.

Duplicação consciente, não descuido. O que **não** pode acontecer é as duas
divergirem em silêncio — por isso ambas ficam num arquivo só, de cada lado, e o
teste de regressão cobre os mesmos casos.

## Totais da nota

Hoje o snapshot leva `valorTotal` e nada mais. O grupo `<total>` do XML tem
`vBC`, `vICMS`, `vST`, `vPIS`, `vCOFINS`, `vProd`, `vNF` — e o motor precisa
deles para NF-e.

Como o item passa a carregar os valores, os totais são **soma dos itens**, não
número solto. Devem ser calculados no builder, com a mesma função `somar` e a
mesma tolerância de centavos já usadas — e conferidos contra os itens, como
`conferirSomatorios` já faz com o valor total.

## O que esta change não resolve

- **O snapshot continua congelado.** Corrigir o cadastro não conserta documento
  já criado; continua sendo necessário emitir documento novo. É comportamento
  correto de auditoria e segue valendo.
- **As notas já emitidas** não ganham base e alíquota retroativamente. Não há de
  onde tirar. É exatamente o custo que esta change para de acumular.
