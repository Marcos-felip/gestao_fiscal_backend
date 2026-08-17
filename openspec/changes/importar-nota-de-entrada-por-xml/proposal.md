## Why

**A entrada de mercadoria é digitada à mão, e por isso ninguém usa o módulo de
compras.** A base tem **0 compras** e **49 movimentações de estoque**, 34 delas
sem referência a documento nenhum: alguém abriu a tela de estoque e lançou o
número. O módulo de compras existe, confirma em transação e já gera entrada de
estoque e títulos a pagar — mas exige recadastrar item por item o que a nota do
fornecedor já traz pronto, então lançar o movimento cru é mais barato do que
usá-lo.

O custo não é só o tempo de digitação:

- **Custo de aquisição errado.** Quem digita o movimento não informa preço, então
  `costPrice` do produto envelhece e a margem da venda vira chute.
- **Nada liga estoque a financeiro.** A duplicata da nota é lançada em outro
  lugar, por outra pessoa, sem vínculo com a mercadoria que entrou.
- **O contador não tem de onde puxar.** O XML de entrada é o documento que
  escritura o crédito de ICMS; ele existe na caixa de e-mail, não no sistema.
- **Não há rastro.** Divergência de saldo não tem documento para conferir.

O XML da NF-e de entrada traz **tudo**: emitente com CNPJ e endereço, cada item
com código, GTIN, descrição, NCM, CFOP, unidade, quantidade, valor, impostos, e
as duplicatas com vencimento. Redigitar isso é o que está amador.

## What Changes

- **Importar o XML da NF-e de entrada** (upload do arquivo que o fornecedor ou o
  contador mandou) e transformá-lo numa **Compra em RASCUNHO**, com fornecedor,
  itens, valores e parcelas já preenchidos.
- **Nada entra no estoque pela importação.** A compra nasce em RASCUNHO; quem
  confirma é uma pessoa, pelo fluxo que já existe — e é a confirmação que
  movimenta estoque e gera os títulos. Um XML com item duplicado ou unidade
  diferente da nossa não corrompe saldo sem alguém ver.
- **De-para de produto memorizado por fornecedor.** O casamento tenta GTIN,
  depois o código que aquele fornecedor usou numa importação anterior. O que
  sobrar é apontado pelo usuário **uma vez**, e a resposta fica guardada: na
  segunda nota do mesmo fornecedor, quase nada é perguntado.
- **Fornecedor reconhecido ou criado pelo XML**, a partir do CNPJ do emitente,
  com endereço e inscrição estadual que a nota já traz.
- **A chave de acesso é única por empresa** — importar o mesmo XML duas vezes é
  recusado, com o número da compra que já o consumiu.
- **O XML fica guardado** e pode ser baixado depois: é o documento que o contador
  escritura.
- **A importação não é a compra.** Ela é registrada à parte, com o resultado do
  casamento de cada item, para que uma importação recusada deixe rastro do que
  faltou em vez de sumir.

**Fora do escopo, de propósito:**

- **Busca automática na SEFAZ** (Distribuição DFe) — é a change irmã
  `buscar-notas-de-entrada-na-sefaz`, que reaproveita todo o motor de importação
  desta aqui e só troca a origem do XML.
- **Manifestação do destinatário** — vem com a busca automática, que é onde ela é
  exigida.
- **Escrituração e apuração de crédito de ICMS.** A plataforma alimenta o
  contador com o XML; quem escritura é ele (decisão já registrada no roteiro).
- **NF-e de entrada emitida por nós** (devolução, entrada de produtor rural) — é
  emissão, e vive na change `devolucao-de-mercadoria`.

## Capabilities

### New Capabilities
- `nfe-import`: leitura do XML da NF-e de entrada, casamento de emitente e itens
  com o cadastro, e a compra em rascunho que nasce daí.

### Modified Capabilities

Nenhuma. O de-para memorizado é requisito da própria `nfe-import` — ele só existe
para a importação, e pendurá-lo em `fiscal-configuration` faria uma capacidade
descrever regra de outra.

## Impact

- **Banco:** tabelas novas `nfe_imports` (uma por XML lido, com chave de acesso
  única por empresa) e `partner_product_codes` (o de-para memorizado). `purchases`
  ganha `nfeImportId`.
- **Backend:** módulo novo `src/nfe-import/` — parser do XML, casamento e criação
  da compra. `purchases` ganha a origem; `products` e `partners` são lidos, não
  alterados.
- **Motor .NET: sem mudança.** Ler XML de entrada é desserializar um arquivo que
  já temos; não envolve SEFAZ, certificado nem assinatura. Mandar isso ao motor
  acrescentaria uma chamada de rede a um trabalho que é local.
- **Storage:** o XML importado é guardado como os XMLs de emissão já são.
- **Permissões:** `purchases.import` nova, com os 3 passos de migration
  (catálogo, template e backfill em `company_role_permissions`).
- **API:** `POST /purchases/import/nfe` (upload), `GET /purchases/import/:id`,
  `POST /purchases/import/:id/confirmar` e `GET /purchases/import/:id/xml`.
