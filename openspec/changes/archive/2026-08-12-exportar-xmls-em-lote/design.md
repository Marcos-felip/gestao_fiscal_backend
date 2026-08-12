# Design — Exportação de XMLs em lote

## Síncrono agora, assíncrono depois

Decisão: exportação **síncrona**, com teto de 92 dias e 5.000 documentos.

Um XML de NFC-e tem por volta de 5 KB. Cinco mil documentos dão ~25 MB antes da
compressão — cabe num stream HTTP sem drama. Abaixo desse teto, a exportação
síncrona é a solução mais simples que funciona: uma rota, sem fila, sem
notificação, sem estado intermediário para o usuário acompanhar.

O caminho para volumes maiores, **quando doer**: enfileirar na BullMQ (a infra já
existe, é a mesma da emissão), gravar o ZIP no storage e devolver um link
assinado. Fica registrado aqui para não ser redescoberto, mas **não entra nesta
change** — construir fila para um problema que ninguém tem ainda é custo sem uso.

O gatilho para migrar: cliente reclamando de timeout, ou o teto de 5.000 virando
incômodo recorrente em vez de exceção.

## Por que só AUTORIZADO e CANCELADO

O contador escritura o que existe para o fisco. Documento `REJEITADO` nunca
existiu; `ERRO` e `PENDENTE` não chegaram à SEFAZ. Incluí-los no ZIP cria risco
real: alguém escritura uma nota que não vale.

`CANCELADO` entra porque a nota **foi autorizada** — ela existe, consumiu
numeração, e o cancelamento é um evento sobre ela. Escriturar o autorizado sem o
cancelamento é pior do que não mandar nada.

## Por que o manifesto

O ZIP sozinho não permite conferência. O contador precisa saber se recebeu tudo,
e o problema clássico do fechamento é justamente descobrir em novembro que
faltaram três notas de agosto.

`_relacao.csv` responde "quantas notas o sistema diz que existem no período" no
mesmo pacote em que entrega os arquivos. É a diferença entre entregar dados e
entregar dados conferíveis.

CSV e não JSON de propósito: quem abre esse arquivo usa Excel.

## Falha parcial não derruba o lote

Um documento cujo XML sumiu do storage **não** pode fazer a exportação inteira
falhar. Se fizesse, um arquivo perdido em agosto impediria o fechamento do mês
todo, e o usuário não teria como contornar.

A regra adotada: o documento entra no manifesto marcado como ausente, os demais
são exportados, e a requisição termina com `200`. O problema fica visível e
localizado, em vez de bloqueante e opaco.

Isso é coerente com `persistirArquivos` (`fiscal-emission.processor.ts`), que já
segue a mesma filosofia: falha de storage não transforma nota autorizada em erro.

## Ambiente explícito

Exportar sem informar ambiente devolve **produção**. Homologação exige pedido
explícito, e o nome do arquivo carrega a marca.

O risco que isso evita é concreto: XML de homologação escriturado como se fosse
real. Os dois ambientes têm numeração própria e chaves parecidas — a diferença é
um dígito no `tpAmb`. Facilitar a mistura seria convidar o erro.

## Dois formatos de XML guardado

`persistirArquivos` grava o XML de dois jeitos, conforme `storage.isConfigured()`:

- **Com storage**: o conteúdo vai para o Supabase e a coluna `xmlAutorizado`
  guarda a **chave**.
- **Sem storage**: a coluna guarda o **XML inteiro**.

A exportação precisa cobrir os dois — instalações diferentes estão em estados
diferentes, e a coluna não diz qual é qual pelo tipo. A heurística prática é o
formato do valor: chave de storage começa com `fiscal/`, XML começa com `<`.

Vale encapsular essa resolução numa função só, porque o download individual
(`GET /documents/:id/xml/:tipo`) tem exatamente o mesmo problema e hoje resolve
por conta própria.
