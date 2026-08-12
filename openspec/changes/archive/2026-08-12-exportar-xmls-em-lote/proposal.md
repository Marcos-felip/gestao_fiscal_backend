## Why

O contador recebe os XMLs — é deles que o software dele monta a EFD. Mas o único
jeito de tirar XML do sistema hoje é um documento por vez:

```
GET /fiscal/documents/:id/xml/:tipo
```

Fechar um mês com 300 notas significa **300 downloads**, um a um, sem forma de
conferir se veio tudo. Não é fricção de interface: é o processo mensal de
obrigação acessória dependendo de alguém não errar a contagem.

Esta é a única etapa do roteiro fiscal que entrega valor sem depender de nenhuma
outra, e é a que o contador precisa no próximo fechamento.

## What Changes

- **`GET /fiscal/documents/xml/export`** — devolve um **ZIP** com os XMLs do
  período, em stream.
- **Filtros**: `dataInicio` e `dataFim` (obrigatórios), `establishmentId`,
  `modelo` e `ambiente`.
- **Só documentos que existem para o fisco**: `AUTORIZADO` e `CANCELADO`. Nota
  rejeitada, em erro ou pendente não vai para a escrituração e não entra no ZIP.
- **Documento cancelado leva os dois XMLs**: o autorizado e o do evento de
  cancelamento. Sem o segundo, o contador escritura como se a nota valesse.
- **Nome do arquivo pela chave de acesso** (`<chave>-nfe.xml`,
  `<chave>-cancelamento.xml`) — é a convenção que os softwares de escrituração
  esperam, e evita colisão.
- **Manifesto** `_relacao.csv` dentro do ZIP: chave, número, série, modelo, data
  de autorização, status e valor total. É por ele que se confere se veio tudo.
- **Teto de segurança**: período máximo de 92 dias e 5.000 documentos por
  exportação. Acima disso, `400` com mensagem explicando como fatiar. O caminho
  para volumes maiores (exportação assíncrona com notificação) fica registrado
  em `design.md`, fora desta change.
- **Ambiente separado**: exportação de homologação nunca se mistura com produção.
  Nota de teste na escrituração é problema fiscal real.

## Capabilities

### New Capabilities
- `fiscal-file-export`: exportação em lote dos arquivos fiscais de um período,
  para alimentar a escrituração do contador.

### Modified Capabilities
<!-- Nenhuma capability existente muda de comportamento. -->

## Impact

- **Sem migration.** Nenhuma coluna nova; a exportação lê o que já existe.
- `src/fiscal/fiscal.controller.ts`: rota nova, com `@RequirePermission('fiscal.read')`.
- `src/fiscal/fiscal.service.ts`: montagem do ZIP em stream.
- **Nova dependência**: biblioteca de ZIP com suporte a stream (`archiver`), para
  não carregar todos os XMLs em memória antes de responder.
- **Storage**: os XMLs podem estar na coluna `xmlAutorizado` (quando o storage
  não está configurado) **ou** no Supabase, com a coluna guardando a chave. A
  exportação precisa cobrir os dois casos — hoje `persistirArquivos` grava de um
  jeito ou de outro conforme `storage.isConfigured()`.
- **Documento sem XML guardado** não pode derrubar a exportação inteira: entra no
  manifesto marcado como ausente e o ZIP continua.
- Change irmã no frontend: `gestao_fiscal_frontend/openspec/changes/exportar-xmls-em-lote`.
- Etapa **0** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
