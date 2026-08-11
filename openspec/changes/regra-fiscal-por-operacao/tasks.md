## 1. Pré-requisito

- [ ] 1.1 Confirmar que a etapa 1 (`contrato-tributario-do-item`) está aplicada — sem o bloco tributário no item não há onde gravar a resposta

## 2. Porta e contexto

- [ ] 2.1 `src/fiscal/rules/fiscal-rules.port.ts` — interface `IRegraFiscal`, no padrão do `IFiscalEngine`
- [ ] 2.2 Tipo do contexto: produto (NCM, CEST, origem, CFOP e situação padrão), emitente (CRT, UF, contribuinte), destinatário (UF, contribuinte, consumidor final), operação (tipo, finalidade, presença)
- [ ] 2.3 Tipo do quadro devolvido, incluindo `regraAplicada`
- [ ] 2.4 Registrar a porta no módulo fiscal por token de injeção, para permitir troca de implementação

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

- [ ] 5.1 `montarItens` passa a consultar a porta em vez de ler CFOP e situação direto do produto
- [ ] 5.2 `regraAplicada` gravado no snapshot, junto do quadro
- [ ] 5.3 **Garantir não-regressão:** base sem regra cadastrada produz payload idêntico ao de antes

## 6. CRUD e simulação

- [ ] 6.1 Módulo `fiscal-rules` com controller, service e DTOs, filtrando `{ companyId, deletedAt: null }`
- [ ] 6.2 Endpoint de simulação, devolvendo quadro e regra aplicada sem criar documento
- [ ] 6.3 Simulação não consome numeração nem grava nada

## 7. Testes

- [ ] 7.1 Resolução de venda interna e interestadual
- [ ] 7.2 Regra específica vence a genérica
- [ ] 7.3 Empate bloqueia a emissão nomeando as regras
- [ ] 7.4 Sem regra cadastrada, o resultado vem do produto
- [ ] 7.5 **Regressão:** empresa sem regras emite igual a antes
- [ ] 7.6 Isolamento por empresa na listagem e na resolução
- [ ] 7.7 Simulação não cria documento nem consome numeração
- [ ] 7.8 `npm test` verde

## 8. Documentação

- [ ] 8.1 `API.md`: rotas de regra fiscal, simulação e as permissões novas
- [ ] 8.2 `REGRAS_DE_NEGOCIO.md`: precedência, empate e fallback
- [ ] 8.3 `FISCAL.md`: onde a porta entra no fluxo de emissão
- [ ] 8.4 Avisar a change irmã do frontend
