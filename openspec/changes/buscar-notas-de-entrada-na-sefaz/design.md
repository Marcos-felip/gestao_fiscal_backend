## Context

`importar-nota-de-entrada-por-xml` entrega o destino: XML → compra em RASCUNHO.
Esta change entrega a **origem**, para que o XML apareça sozinho.

O serviço da SEFAZ é o `NFeDistribuicaoDFe`, disponível em ambiente nacional. Ele
funciona por **NSU** (número sequencial único por CNPJ destinatário): pede-se "a
partir do NSU N" e ele devolve até 50 documentos, informando o `ultNSU` entregue
e o `maxNSU` existente. É fluxo, não busca — não há consulta por período.

O que ele devolve depende de o destinatário ter manifestado:

| Situação | O que vem |
|---|---|
| Sem manifestação | **Resumo** (`resNFe`): emitente, valor, chave, data. **Sem itens** |
| Após ciência (210210) | **XML completo** (`procNFe`) |

Há limite de frequência por CNPJ; consulta em excesso é recusada como consumo
indevido e pode bloquear o CNPJ temporariamente.

## Goals / Non-Goals

**Goals:**

- Descobrir a nota sem depender de o fornecedor mandá-la.
- Nunca perder nem repetir documento — o NSU é a garantia disso.
- Dar ao usuário o caminho legal da manifestação, inclusive o desconhecimento.
- Entregar o XML completo ao motor de importação que já existe, sem duplicá-lo.

**Non-Goals:**

- Ler XML, casar item, criar compra — é a change irmã.
- CT-e e MDF-e, que a distribuição também devolve.
- Manifestar automaticamente.
- Escriturar crédito ou gerar SPED.

## Decisions

### A distribuição fica no motor .NET; o parser continua no NestJS

Parece incoerente, e não é. A linha é **quem fala com a SEFAZ**:

- **Distribuição e manifestação** exigem certificado A1, assinatura e SOAP contra
  o ambiente nacional. É o que o motor existe para fazer.
- **Ler um XML que já está na nossa mão** não tem nada disso. Mandá-lo ao motor
  acrescentaria rede e contrato a um trabalho local.

### O NSU é por estabelecimento **e** por ambiente

A SEFAZ numera por CNPJ destinatário, e homologação e produção têm sequências
independentes. Um cursor único por empresa embaralharia filiais e ambientes, e o
sintoma seria nota sumindo — o pior tipo de bug para depurar.

### O cursor avança só até o documento efetivamente gravado

Se a consulta devolve 50 documentos e o processamento falha no 30º, o cursor vai
até o 29º. Avançar até `ultNSU` da resposta perderia 21 notas em silêncio, e nada
as traria de volta: a SEFAZ não reentrega NSU passado sem consulta específica.

### Nada é manifestado sozinho

Tentador automatizar a ciência (é ela que libera o XML completo, que é o que
queremos). Descartado: ciência é ato do destinatário, e automatizá-la para todo
CNPJ que emita contra a empresa dá ciência a nota fria também. O sistema oferece
o botão e destaca o emitente desconhecido; quem manifesta é uma pessoa.

**Consequência aceita:** o fluxo tem um passo humano antes de a nota virar compra.
É o mesmo passo que a lei já exige.

### Resumo e XML completo são estados do mesmo documento

`DfeDocument` nasce como resumo e vira completo. Não são duas entidades: a chave
de acesso é a mesma, a nota é a mesma, e separá-las obrigaria a reconciliar
depois. A situação diz em que estado está, e a importação só é oferecida no
estado completo.

### O intervalo de consulta é decisão de projeto, não de conveniência

Consultar de hora em hora por estabelecimento é o ponto de partida — abaixo disso
o risco de consumo indevido cresce sem ganho: nota faturada agora não some se for
vista daqui a uma hora. A recusa por consumo indevido é registrada e respeitada,
com espera antes de reconsultar.

## Risks / Trade-offs

- **Bloqueio por consumo indevido** é o risco operacional principal: afeta o CNPJ,
  não só a requisição. Mitigação: intervalo conservador, recusa respeitada, e um
  cursor por estabelecimento para não multiplicar consultas por empresa.
- **Certificado vencido** interrompe a descoberta silenciosamente. Mitigação: a
  falha aparece onde o checklist de produção já mostra validade de certificado.
- **Volume inicial.** O primeiro `NSU = 0` de uma empresa antiga pode ter
  centenas de documentos, quase todos velhos e irrelevantes. Mitigação: a primeira
  carga é marcada como histórica e não vira pendência de decisão.
- **Manifestação tem prazo legal** e o sistema não o controla nesta change. Fica
  registrado como dívida: o alerta de prazo é candidato natural à change seguinte.
- **A SEFAZ devolve CT-e e MDF-e** no mesmo fluxo. Eles avançam o NSU e são
  ignorados — mas ignorar em silêncio esconde do usuário que chegou algo. São
  registrados com o tipo, sem tratamento.
