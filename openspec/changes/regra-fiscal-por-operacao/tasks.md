## 0. Decisões que precedem o código

> Nenhuma tarefa da seção 2 em diante deve começar antes destas. As duas mudam o
> que se implementa, não como.

- [ ] 0.1 **Assinar ou construir a matriz tributária.** Pedir orçamento a pelo menos dois fornecedores e comparar com o custo de manter tabelas próprias de MVA, pauta, alíquota interna e FCP das UFs de destino. Recomendação registrada em `design.md`: **assinar**.
- [ ] 0.2 **Confirmar com o contador se o DIFAL é devido** por emitente do Simples Nacional em venda a consumidor final não contribuinte de outra UF (ADI 5464). Resposta negativa tira a partilha do escopo desta change e da etapa 3.
- [ ] 0.3 Registrar as duas respostas em `design.md` e rodar `openspec-update-change` para refletir o escopo resultante
- [ ] 0.4 Levantar em quais UFs haverá venda de fato — a matriz própria, se for esse o caminho, é dimensionada por isso e não pelas 27

## 1. Pré-requisito

- [ ] 1.1 Confirmar que a etapa 1 (`contrato-tributario-do-item`) está aplicada — sem o bloco tributário no item não há onde gravar a resposta
- [ ] 1.2 Confirmar o tipo de destinatário que a operação vai ter: empresa contribuinte, consumidor final não contribuinte, ou os dois

## 2. Porta e contexto

- [x] 2.1 `src/fiscal/rules/fiscal-rules.port.ts` — interface `IRegraFiscal`, no padrão do `IFiscalEngine`
- [x] 2.2 Tipo do contexto: produto (NCM, CEST, origem, CFOP e situação padrão), emitente (CRT, UF, contribuinte), destinatário (UF, contribuinte, consumidor final), operação (tipo, finalidade, presença)
- [x] 2.3 Tipo do quadro devolvido, incluindo `regraAplicada`
- [x] 2.4 Registrar a porta no módulo fiscal por token de injeção, para permitir troca de implementação
  - Token `REGRA_FISCAL` no `FiscalModule`, apontando para `ProductFallbackRule`. Trocar de matriz é trocar essa linha.

> ⏸ **Seções 3, 4 e 6 em espera.** Dependem das decisões da seção 0: se a matriz
> for assinada, o que entra atrás da porta é um adaptador HTTP — sem tabela de
> regras, sem resolvedor próprio, sem CRUD. Implementar agora tem chance real de
> ser retrabalho.
>
> O que já está feito é a costura, que é idêntica nos dois caminhos: a porta
> existe, a emissão pergunta a ela, e o comportamento não mudou.

## 3. Modelo e migration

- [ ] 3.1 Tabela de regra fiscal por empresa: critérios de casamento + resultado (CFOP, situação tributária, alíquotas)
- [ ] 3.2 Índices por `companyId` e pelos critérios mais usados na resolução
- [ ] 3.3 Soft delete e isolamento por `companyId`, como o resto do sistema
- [ ] 3.4 Permissões `fiscal.rules.read` e `fiscal.rules.edit` com os **três passos**: catálogo, template e backfill em `company_role_permissions`

## 4. Resolvedor

- [ ] 4.1 Casamento por critérios, com especificidade contada pelo número de critérios preenchidos
- [ ] 4.2 Empate entre regras igualmente específicas → `BadRequestException` nomeando as duas
- [ ] 4.3 Fallback para o cadastro do produto quando nenhuma regra casar
- [ ] 4.4 `regraAplicada` preenchido nos dois caminhos, inclusive no fallback

## 5. Integração com a emissão

- [x] 5.1 `montarItens` passa a consultar a porta em vez de ler CFOP e situação direto do produto
  - `buildFiscalSnapshot` virou **assíncrono**. De propósito agora: um fornecedor de matriz responde por HTTP, e nascer síncrono obrigaria a reescrever tudo acima da porta no dia da troca.
- [x] 5.2 `regraAplicada` gravado no snapshot, junto do quadro
  - Em `snapshot.regrasAplicadas`, por `numeroItem` — fora de `itens`, porque `NfceItem` é o contrato do motor e não tem esse campo.
- [x] 5.3 **Garantir não-regressão:** base sem regra cadastrada produz payload idêntico ao de antes
  - 654 testes verdes. Sem regra cadastrada o quadro vem do cadastro do produto, como antes.

## 6. Configuração e simulação

> A tela de regras é ferramenta de **configuração e diagnóstico**, usada no
> onboarding por quem conhece a matéria — não fluxo do lojista. Não deve entrar
> na navegação do usuário comum.

- [ ] 6.1 Módulo `fiscal-rules` com controller, service e DTOs, filtrando `{ companyId, deletedAt: null }`
- [ ] 6.4 Conjunto base de regras por UF e ramo, aplicável a uma empresa no onboarding — o cliente não parte de zero nem cadastra matriz tributária
- [ ] 6.5 Aplicar o conjunto base é operação idempotente e não sobrescreve regra ajustada manualmente
- [ ] 6.2 Endpoint de simulação, devolvendo quadro e regra aplicada sem criar documento
- [ ] 6.3 Simulação não consome numeração nem grava nada

## 7. Testes

- [ ] 7.1 Resolução de venda interna e interestadual
- [ ] 7.2 Regra específica vence a genérica
- [ ] 7.3 Empate bloqueia a emissão nomeando as regras
- [x] 7.4 Sem regra cadastrada, o resultado vem do produto
- [x] 7.5 **Regressão:** empresa sem regras emite igual a antes
- [ ] 7.6 Isolamento por empresa na listagem e na resolução
- [ ] 7.7 Simulação não cria documento nem consome numeração
- [ ] 7.8 `npm test` verde

## 8. Documentação

- [ ] 8.1 `API.md`: rotas de regra fiscal, simulação e as permissões novas
- [ ] 8.2 `REGRAS_DE_NEGOCIO.md`: precedência, empate e fallback
- [ ] 8.3 `FISCAL.md`: onde a porta entra no fluxo de emissão
- [ ] 8.4 Avisar a change irmã do frontend
