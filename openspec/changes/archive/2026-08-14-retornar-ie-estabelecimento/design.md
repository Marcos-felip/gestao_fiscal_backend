# Design — IE do emitente: fonte da verdade e round-trip

## A decisão

**Qual das duas colunas de Inscrição Estadual é a autoritativa?**

Decisão: **`Establishment.inscricaoEstadual`**. `Company.inscricaoEstadual`
permanece apenas como fallback.

### Por quê

1. **É o que o código já faz.** `montarEmitente`
   (`fiscal-snapshot.builder.ts:141`) resolve
   `establishment.inscricaoEstadual ?? company.inscricaoEstadual`. Declarar a
   matriz como fonte alinha o contrato ao comportamento real da emissão, em vez de
   criar uma terceira regra.
2. **É o que a legislação assume.** A IE é atribuída por estabelecimento. Uma
   empresa com filial em outra UF tem IE distinta por filial, e a NFC-e é emitida
   pelo estabelecimento emissor. Uma IE única por empresa não sobrevive ao segundo
   estabelecimento.
3. **`stateRegistration` já escreve na matriz.** `companies.service.ts:339-361` faz
   exatamente isso. O que falta é só a leitura.

### Consequência

`Company.inscricaoEstadual` vira campo de compatibilidade. Não é removido nesta
change — empresas sem matriz configurada ainda dependem dele, e o
`isCompanyFiscalComplete` (`fiscal-rules.ts:154`) o consulta.

## Alternativas descartadas

### A. Empresa é a fonte, matriz é derivada

Inverteria `montarEmitente` para preferir a empresa. Descartada: quebra filial com
IE própria, que é o caso normal assim que a empresa cresce, e contraria a
atribuição da IE por estabelecimento.

### B. Unificar numa coluna só

Remover `Company.inscricaoEstadual` e deixar apenas a do estabelecimento. É o
destino correto no longo prazo, mas exige migration com backfill, mexe em
`isCompanyFiscalComplete`, em `montarEmitente` e no onboarding. Fora de escopo:
esta change é sobre tornar o dado legível, não sobre remodelar o cadastro.

### C. Só corrigir o frontend

O frontend já carrega a matriz (`loadMatriz`) e já copia campos dela para o
formulário (`applySede`); bastaria copiar mais um. **É a correção mais barata e
resolve o sintoma visível** — mas deixa o contrato assimétrico: a API continuaria
aceitando no PATCH um campo que o GET nunca devolve, e o próximo consumidor
tropeça igual. Descartada como solução única; o frontend é corrigido na change
irmã, junto.

## Divergência entre as duas IEs

Hoje é possível gravar `inscricaoEstadual = A` na empresa e
`stateRegistration = B` na matriz, na mesma requisição, sem erro. A emissão então
usa `B` silenciosamente, e a tela mostra `A`.

Regra adotada: **recusar a requisição** quando os dois campos vierem preenchidos e
diferentes, com `400` e mensagem em PT-BR. Não sincronizar automaticamente — uma
propagação silenciosa esconderia do usuário qual valor prevaleceu, que é
exatamente o problema que esta change existe para resolver.

Quando apenas `stateRegistration` vier, o comportamento atual é mantido: grava na
matriz.

## O que esta change não resolve

O snapshot do documento fiscal é **congelado na criação** e nunca reconstruído no
retry (`fiscal-emission.processor.ts:119` lê `document.snapshot` direto). Corrigir
a IE no cadastro **não** conserta um documento já criado — é preciso emitir um
documento novo. Isso é comportamento correto de auditoria, e continua valendo
depois desta change. Vale um alerta na UI quando o usuário corrigir a IE tendo
documentos em ERRO, mas isso é outra change.
