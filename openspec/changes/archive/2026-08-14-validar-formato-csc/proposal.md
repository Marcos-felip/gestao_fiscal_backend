## Why

O CSC não tem validação nenhuma. No DTO ele é só `@IsString()`
(`create-fiscal-settings.dto.ts:44`), e na emissão a única checagem é se a string
está vazia (`emit-request.builder.ts:45` e `fiscal-preconditions.ts:24`).

Em 10/08/2026 isso custou caro: um CSC de **6 dígitos** foi gravado, passou pelo
cadastro, passou pela pré-condição de emissão, **consumiu numeração de nota** e só
falhou na SEFAZ com **rejeição 464 — "Rejeição: QR-Code com hash inválido"**. A
mensagem da SEFAZ não menciona CSC: ela diz que o hash não confere. O diagnóstico
só fechou depois de recalcular o SHA-1 de `chave|2|2|1` + CSC à mão e reproduzir o
hash rejeitado.

O CSC é a única credencial fiscal do sistema sem validação de formato. Certificado
tem validade conferida, CNPJ e IE têm formato conferido, NCM/CFOP/CSOSN têm regra
em `fiscal-rules.ts`. O CSC não tem nada — e é justamente o que falha com a
mensagem mais opaca.

## What Changes

- **Validação de formato do CSC** (`codigoCsc`) no cadastro e na emissão:
  16 a 64 caracteres, apenas alfanuméricos. O mínimo é **16, não 32**, de
  propósito: MG emite 32 caracteres hexadecimais, outras UFs emitem tamanhos
  diferentes, e travar em 32 quebraria quem emite menor. 16 pega toda a classe de
  erro "digitei o número errado do portal" sem inventar regra de UF.
- **Validação de formato do idCSC** (`idCsc`): apenas dígitos, 1 a 6 posições.
  O `cIdToken` do QR Code tem 6 posições e é preenchido com zeros à esquerda —
  qualquer coisa fora disso não produz QR válido. Hoje o campo aceita 20
  caracteres livres.
- **Mensagens de erro em PT-BR que dizem onde obter o valor** (portal da SEFAZ da
  UF, seção de credenciamento NFC-e), porque o erro típico é o usuário confundir o
  ID com o código, ou colar só um pedaço.
- **A pré-condição de emissão passa a distinguir "ausente" de "malformado"** e a
  bloquear antes de consumir numeração, com o motivo correto no histórico do
  documento.
- **Backfill não é feito**: configurações já gravadas com CSC inválido continuam no
  banco e passam a ser barradas na emissão com mensagem clara — que é exatamente o
  comportamento desejado, e melhor que uma migration adivinhar o valor certo.

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova. -->

### Modified Capabilities
- `fiscal-configuration`: a configuração fiscal do estabelecimento passa a validar
  o formato do CSC e do idCSC, no cadastro e como pré-condição de emissão.

## Impact

- **Sem migration.** Só validação; nenhuma coluna muda.
- `src/fiscal/dto/create-fiscal-settings.dto.ts` e `update-fiscal-settings.dto.ts`:
  novos validadores `class-validator`.
- `src/fiscal/emission/fiscal-rules.ts`: duas funções novas (`isCscValido`,
  `isIdCscValido`), mantendo a regra do motor num lugar só.
- `src/fiscal/emission/emit-request.builder.ts` e `fiscal-preconditions.ts`:
  passam a usar as funções acima em vez de só checar string vazia.
- **Efeito colateral desejado:** estabelecimentos com CSC inválido já cadastrado
  deixam de emitir e passam a aparecer como pendência de configuração. É uma
  mudança de comportamento visível, e intencional.
- Change irmã no frontend: `gestao_fiscal_frontend/openspec/changes/validar-formato-csc`
  (mesma regra no formulário, para o erro aparecer antes do round-trip).
