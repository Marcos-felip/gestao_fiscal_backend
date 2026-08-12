> **Recorte definido em 12/08/2026: NF-e apenas dentro do estado.**
>
> Sem venda interestadual, a change encolhe: **não** entram CFOP 6xxx, DIFAL,
> partilha nem ST interestadual. Fica NF-e modelo 55 em operação interna, para
> destinatário identificado.
>
> Isso também **remove a dependência da etapa 2**, que foi adiada. O quadro
> tributário já vem pronto da etapa 1, resolvido pela porta
> `IRegraFiscal` — hoje respondida pelo cadastro do produto, que numa operação
> que não varia é a resposta certa.
>
> **Destinatário: empresa e pessoa física** (definido em 12/08/2026). O
> `indIEDest` precisa dos três valores — `1` contribuinte de ICMS, `2` isento de
> IE, `9` não contribuinte — e a validação do destinatário muda conforme ele:
> empresa contribuinte exige IE, pessoa física não tem.
>
> Consequência que precisa de decisão de produto: **para pessoa física, NFC-e e
> NF-e se sobrepõem.** As duas atendem consumidor final em operação interna. O
> sistema precisa de um critério para saber qual emitir — se é escolha do
> operador, se depende do valor, ou se depende de a venda ter entrega. Está como
> tarefa na seção 1.

## Why

NF-e completa é requisito de lançamento. Hoje o modelo 55 existe no sistema
apenas como valor de enum (`FiscalDocumentModel.NFE`) e filtro de listagem —
nada emite.

O que falta no backend não é "chamar outra rota do motor". A NF-e tem exigências
que a NFC-e não tem, e várias delas atravessam módulos que já existem:

- **Destinatário obrigatório e completo**, com endereço e indicador de IE. O
  `Partner` tem endereço, mas **não tem `indIEDest`** — é o único campo de
  cadastro que falta de fato.
- **Numeração e série próprias.** `FiscalSettings` hoje só tem `serieNfce` e
  `proximoNumeroNfce`.
- ~~**CFOP interestadual.**~~ Fora do recorte: operação interna usa `5xxx`, e
  `isCfopValido` já aceita. **Nada a fazer aqui.**
- **Transporte, volumes e cobrança**, que não existem em lugar nenhum.
- **Finalidade da nota** (`finNFe`) e tipo de operação (`tpNF`).

## What Changes

- **`FiscalSettings` ganha série e numeração de NF-e**, independentes das de
  NFC-e, com a mesma reserva atômica já usada hoje.
- **`Partner` ganha `indIEDest`** (contribuinte, isento, não contribuinte).
- **Emissão de NF-e** a partir de venda ou pedido, com destinatário obrigatório —
  recusando quando o parceiro estiver incompleto, com mensagem que diga o que
  falta.
- **Snapshot da NF-e** com os grupos próprios: destinatário completo, transporte,
  volumes, cobrança, natureza da operação, `tpNF` e `finNFe`.
- ~~**`isCfopValido` passa a depender do modelo**~~ — fora do recorte interno.
  Volta quando houver venda interestadual.
- **Permissões** `fiscal.nfe.emit` e `fiscal.nfe.cancel`, separadas das de NFC-e —
  quem opera caixa não necessariamente emite NF-e.
- **DANFE do modelo 55** armazenado e servido como o da NFC-e.

## Capabilities

### New Capabilities
- `nfe-emission`: emissão, consulta e cancelamento de NF-e modelo 55, com
  destinatário completo, transporte, volumes e cobrança.

### Modified Capabilities
- `fiscal-configuration`: série e numeração passam a existir por modelo.
- `fiscal-document`: o documento passa a suportar os grupos exclusivos do modelo 55.

## Impact

- **Migrations**: `serie_nfe` e `proximo_numero_nfe` em `fiscal_settings`;
  `ind_ie_dest` em `partners`; permissões novas com os **três passos**.
- `src/fiscal/emission/` — builder de snapshot da NF-e, separado do da NFC-e.
- `src/fiscal/fiscal-engine/` — porta estendida com as operações do modelo 55.
- `src/partners/` — campo novo e validação.
- **Depende da etapa 1**, que está concluída. **Não depende mais da etapa 2**: o
  argumento era NF-e interestadual, que saiu do recorte.
- **Revisar antes de implementar.** Proposta escrita antes das etapas 1 e 2
  existirem — ver o aviso no roteiro fiscal.
- Changes irmãs no `fiscal_service` e no frontend.
- Etapa **3** do [roteiro fiscal](../../../ROADMAP_FISCAL.md).
