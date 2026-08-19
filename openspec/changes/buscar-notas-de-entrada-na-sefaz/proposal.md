## Why

**A change irmã `importar-nota-de-entrada-por-xml` resolve o trabalho de digitar,
mas não o de conseguir o arquivo.** O XML continua chegando por e-mail, WhatsApp
ou pen drive do contador — e nota que não chega não é importada. O lojista
descobre a compra quando a mercadoria bate na porta, não quando ela é faturada.

A SEFAZ tem o serviço que resolve isso: **`NFeDistribuicaoDFe`** devolve toda
NF-e emitida **contra o CNPJ da empresa**, sem que ninguém precise pedir ao
fornecedor. É como o sistema descobre sozinho o que foi comprado.

Junto vem uma obrigação que hoje o sistema ignora: a **manifestação do
destinatário**. Quem recebe mercadoria deve dizer à SEFAZ o que fez com a nota —
e há dois casos em que ela **deixa de ser opcional**:

- **Ciência da operação (210210)** é o que libera o XML completo. Sem manifestar,
  a distribuição devolve só o *resumo* da nota (emitente, valor, chave), sem
  itens — e resumo não vira compra.
- **Desconhecimento (210220)** é a única defesa contra nota fria emitida contra o
  seu CNPJ. Sem ela, a nota fica no seu CNPJ como se fosse aceita.

## What Changes

- **Consultar a SEFAZ periodicamente** por notas emitidas contra o CNPJ dos
  estabelecimentos, guardando o `NSU` de onde parou — a distribuição é um fluxo
  sequencial, não uma busca por período.
- **Notas descobertas viram pendências**, listadas com emitente, valor e data,
  antes de qualquer decisão. É a caixa de entrada fiscal da empresa.
- **Manifestar o destinatário** nos quatro eventos: ciência (210210), confirmação
  (210200), desconhecimento (210220) e operação não realizada (210240).
- **Resumo vira XML completo** depois da ciência, e o XML completo entra **no
  mesmo motor de importação da change irmã** — mesma leitura, mesmo casamento,
  mesma compra em RASCUNHO. A origem é o que muda, não o destino.
- **O motor .NET ganha `/api/dfe`**: distribuição por NSU e por chave, e os
  eventos de manifestação. É onde há SEFAZ, certificado e assinatura — por isso é
  lá, e não no NestJS como o parser.
- **Alerta de nota desconhecida**: nota de emitente que nunca foi fornecedor é
  destacada, porque é o formato que a nota fria tem.

**Fora do escopo:**

- **Ler o XML e casar itens** — é a change irmã, e esta a reaproveita inteira.
- **CT-e e MDF-e**, que a distribuição também devolve. Só NF-e modelo 55 aqui.
- **Manifestação automática.** Nenhum evento é enviado sem alguém mandar:
  confirmar uma nota fria por automatismo é pior do que não manifestar.

## Capabilities

### New Capabilities
- `dfe-distribution`: descoberta de notas de entrada na SEFAZ, controle de NSU e
  manifestação do destinatário.

### Modified Capabilities
- `nfe-import`: a importação passa a aceitar XML vindo da SEFAZ, além do upload,
  e um documento pode existir como resumo antes de ter XML completo.
- `fiscal-engine-integration`: o motor ganha o contrato de distribuição e de
  manifestação.

## Impact

- **Depende de `importar-nota-de-entrada-por-xml` estar pronta.** Esta change
  entrega a origem; a irmã entrega o destino. Fora de ordem, não há para onde
  mandar o XML baixado.
- **Motor .NET:** rotas novas em `/api/dfe` (distribuição e manifestação) usando
  o `NFeDistribuicaoDFe` e o `RecepcaoEvento` do DFe.NET.
- **Banco:** `dfe_documents` (uma linha por nota descoberta, com NSU, chave,
  situação e manifestação) e `dfe_cursors` (o NSU por estabelecimento e ambiente).
- **Backend:** módulo `src/dfe/`, com job agendado por estabelecimento.
- **Certificado:** exige o A1 do estabelecimento, o mesmo da emissão.
- **Permissões:** `dfe.read` e `dfe.manifestar`, com os 3 passos de migration.
- **Limite da SEFAZ:** a distribuição tem restrição de frequência por CNPJ —
  consulta em excesso é bloqueada, então o intervalo é decisão de projeto, não de
  conveniência.
