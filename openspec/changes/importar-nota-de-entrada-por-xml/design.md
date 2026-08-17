## Context

O módulo de compras está pronto e não é usado. `purchases.confirm` já roda em
transação criando `StockMovement` ENTRADA por item, atualizando `currentStock` e
gerando os `FinancialEntry` PAGAR quando A_PRAZO. O que falta não é o destino: é
o caminho até ele.

Estado da base em 17/08/2026: **0 compras**, **49 movimentações**, **34 sem
`referenceId`**. O usuário lança o movimento cru porque recadastrar a nota inteira
custa mais do que o benefício.

O XML da NF-e (modelo 55, layout 4.00) que chega do fornecedor traz, em
`infNFe`: `emit` (CNPJ, IE, razão social, endereço), `det[]` com `prod` (cProd,
cEAN, xProd, NCM, CFOP, uCom, qCom, vUnCom, vProd) e `imposto`, e `cobr/dup[]`
com as duplicatas (nDup, dVenc, vDup).

## Goals / Non-Goals

**Goals:**

- Transformar o XML em compra em RASCUNHO com o mínimo de perguntas.
- Fazer a segunda nota de um mesmo fornecedor não perguntar nada.
- Guardar o XML, que é o documento do contador.
- Não movimentar estoque sem uma pessoa confirmar.

**Non-Goals:**

- Buscar nota na SEFAZ — change irmã `buscar-notas-de-entrada-na-sefaz`.
- Manifestação do destinatário — só é exigida na busca automática.
- Escriturar crédito de ICMS ou gerar SPED — o roteiro já decidiu que quem
  escritura é o contador.
- Emitir NF-e de entrada (devolução) — é emissão, vive em `devolucao-de-mercadoria`.
- Importar NFC-e ou CT-e de entrada.

## Decisions

### O XML é lido no NestJS, não no motor .NET

Ler XML de entrada é desserializar um arquivo que já está na nossa mão. Não há
SEFAZ, certificado, assinatura nem rede envolvidos — que é tudo o que justifica o
motor existir. Mandar o arquivo ao .NET acrescentaria um salto de rede, um
contrato novo e um ponto de falha a um trabalho local.

**Trade-off aceito:** duplicamos o conhecimento do layout 4.00 num segundo lugar.
É pouco: o parser lê ~15 campos de `infNFe`, e nenhum deles muda entre notas
técnicas de forma silenciosa. Se um dia precisarmos validar contra o XSD oficial,
aí sim vale a viagem ao motor.

### A importação é uma entidade, não um passo

`NfeImport` existe separada de `Purchase` porque a importação **pode não virar
compra**: pode ter item sem casar, pode ser recusada, pode ficar parada esperando
alguém decidir. Se o registro só existisse ao final, uma importação interrompida
sumiria — e o usuário reimportaria o arquivo para descobrir o que faltava.

Ela guarda a chave de acesso (com `@@unique([companyId, chaveAcesso])`), o
`storageKey` do XML, a situação, e uma linha por item lido com o resultado do
casamento.

### O casamento tenta GTIN, depois código do fornecedor — nunca descrição

Ordem deliberada:

1. **GTIN** (`cEAN` do XML contra `product.barcode`). É código global; quando
   existe e não é `SEM GTIN`, é a evidência mais forte que a nota oferece.
2. **Código do fornecedor** (`cProd` contra `partner_product_codes`, gravado numa
   importação anterior daquele fornecedor). O mesmo `cProd` de fornecedores
   diferentes aponta para produtos diferentes — por isso a chave é
   `(partnerId, codigoFornecedor)`, nunca só o código.
3. **Nada.** O item fica pendente e o usuário escolhe.

**Descrição textual foi descartada de propósito.** "REFRIG LATA 350" e
"Refrigerante Lata 350ml" são o mesmo produto; "Parafuso 3x20" e "Parafuso 3x25"
não são, e diferem em um caractere. Casar por similaridade acerta o fácil e erra
o caro, e o erro entra no estoque como se fosse conferido.

### Criar produto automaticamente foi descartado

Item não reconhecido **não** vira produto novo sozinho. O produto nasceria sem
preço de venda, sem unidade conferida e com nome do fornecedor — e o catálogo
acumularia "REFRIG LATA 350" ao lado de "Refrigerante Lata 350ml". A tela oferece
criar, com os dados do XML preenchidos, mas a decisão é de quem olha.

### As duplicatas definem a condição de pagamento

`cobr/dup[]` presente ⇒ compra A_PRAZO, com `installments = dup.length`,
`firstDueDate = min(dVenc)` e `intervalDays` calculado pelo espaçamento médio.
Ausente ⇒ A_VISTA. É o que a nota diz; o usuário ainda pode corrigir no rascunho
antes de confirmar.

**Limitação conhecida:** o modelo `Purchase` guarda parcelas por
`installments`/`intervalDays`, não uma lista de vencimentos. Uma nota com
vencimentos irregulares (15/30/45/90) vira aproximação. Não vou mudar o modelo de
compras nesta change — a divergência aparece no rascunho, onde dá para ajustar.
Registrado como dívida.

### O custo do item atualiza `costPrice` na confirmação da compra, não na importação

A importação não escreve no cadastro de produto. Quem atualiza custo é a
confirmação da compra, que é onde a mercadoria de fato entra. Importação que
nunca virou compra não pode mexer em margem.

### Estabelecimento vem do destinatário do XML

`dest.CNPJ` casa com o CNPJ de um `Establishment` da empresa. Não casou, a
importação é recusada nomeando o CNPJ — é mais honesto do que jogar a entrada na
matriz e a mercadoria aparecer no lugar errado.

## Risks / Trade-offs

- **XML com item de devolução embutido** (CFOP 1202/1411 no meio da nota de
  compra) entraria como entrada normal. Mitigação: a compra nasce em RASCUNHO e o
  CFOP de cada item fica visível. Não vou tratar CFOP por item nesta change.
- **Nota em unidade diferente da nossa** (caixa com 12 × unidade) é o erro mais
  provável em produção. A divergência de unidade é apontada, mas **não há
  conversão** — quem decide é quem confere. Fator de conversão por fornecedor é
  candidato natural à próxima change.
- **Parser próprio pode não cobrir variação de emissor.** Notas reais trazem
  campos opcionais em ordens diferentes e namespaces com prefixo. Mitigação:
  testes com XML real de fornecedores diferentes, e o arquivo guardado permite
  reprocessar quando o parser melhorar.
- **`partner_product_codes` memoriza um erro.** Se o usuário casar errado uma
  vez, o erro se repete silenciosamente. Mitigação: o de-para é editável e a tela
  mostra que aquele casamento veio da memória, não do GTIN.
- **Volume.** Uma nota de distribuidor pode ter 300 itens. A tela precisa
  aguentar; o casamento é uma consulta por chave, não por item.
