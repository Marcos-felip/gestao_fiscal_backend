# Regras de Negócio — Gestão Fiscal

## 1. Visão Geral

O sistema é um SaaS (Software as a Service) de gestão fiscal e operacional para empresas brasileiras. Ele permite:

- Gerenciar múltiplas empresas com usuários compartilhados
- Controlar estoque de produtos
- Registrar e controlar compras
- Manter cadastro de clientes e fornecedores
- Preparar a base para emissão fiscal (NF-e)

---

## 2. Multi-tenancy

### Regra fundamental
**Toda** entidade de negócio (produto, compra, parceiro, etc.) pertence a uma empresa específica, identificada pelo campo `company_id`.

### Contexto ativo
- Cada usuário possui uma **empresa ativa** (`company_active_id`)
- Todas as operações são executadas no contexto da empresa ativa
- O usuário pode trocar de empresa ativa a qualquer momento (desde que seja membro)
- Um usuário sem empresa ativa não pode acessar nenhum recurso protegido

### Isolamento de dados
- Um usuário **só pode ver dados da empresa ativa**
- Um usuário **só pode acessar empresas onde possui membership**
- Dados de empresas diferentes nunca se misturam

---

## 3. Fluxo de Onboarding

O sistema exige um fluxo obrigatório de 3 etapas para que o usuário possa operar:

### Etapa 1 — Criar conta de usuário
**Campos obrigatórios:** nome, e-mail, senha

**Resultado:** usuário criado, tokens JWT retornados

### Etapa 2 — Criar empresa
**Campos obrigatórios:** nome da empresa
**Campos opcionais:** tipo (MEI, ME, EPP, LTDA, SA, EIRELI, SLU), telefone

**Resultado automático:**
- Empresa criada
- Membership criado com papel **OWNER**
- Empresa definida como empresa ativa do usuário

### Etapa 3 — Configurar a empresa (Onboarding)
**Campos obrigatórios:** CNPJ, regime tributário, nome do estabelecimento
**Campos opcionais:** inscrição estadual, inscrição municipal, endereço completo

**Resultado:**
- Empresa atualizada com CNPJ e regime tributário
- Estabelecimento **MATRIZ** criado
- Empresa marcada como `is_onboarded = true`

> ⚠️ O onboarding só pode ser feito uma vez por empresa. Tentativas repetidas retornam erro.

---

## 4. Papéis e Permissões

### OWNER
- Controle total da empresa
- Pode convidar e remover membros
- Pode alterar papéis de outros membros (exceto de outros OWNERs)
- **Não pode ser removido da empresa**
- **Não pode ter seu papel alterado**

### ADMIN
- Acesso operacional completo
- Pode convidar novos membros (com papel MEMBER)
- Pode criar e gerenciar estabelecimentos
- Pode confirmar e cancelar compras

### MEMBER
- Acesso básico de leitura e operação
- Pode criar compras (status RASCUNHO)
- Não pode cancelar operações confirmadas
- Não pode gerenciar membros

### Tabela resumida

| Ação | OWNER | ADMIN | MEMBER |
|------|-------|-------|--------|
| Convidar membros | ✅ | ✅ | ❌ |
| Remover membros | ✅ | ❌ | ❌ |
| Alterar papéis | ✅ | ❌ | ❌ |
| Configurar empresa (onboarding) | ✅ | ❌ | ❌ |
| Criar/editar estabelecimentos | ✅ | ✅ | ❌ |
| CRUD de produtos | ✅ | ✅ | ✅ |
| CRUD de parceiros | ✅ | ✅ | ✅ |
| Criar compras (rascunho) | ✅ | ✅ | ✅ |
| Confirmar compras | ✅ | ✅ | ✅ |
| Cancelar compras | ✅ | ✅ | ❌ |
| Movimentação manual de estoque | ✅ | ✅ | ✅ |

---

## 5. Estabelecimentos

- Cada empresa pode ter múltiplos estabelecimentos (MATRIZ e FILIAIs)
- **Toda empresa deve ter exatamente uma MATRIZ** (criada no onboarding)
- **Não é possível criar uma segunda MATRIZ** para a mesma empresa
- **Não é possível excluir a MATRIZ**
- Filiais podem ser criadas e excluídas livremente (por OWNER ou ADMIN)
- Compras são vinculadas a um estabelecimento específico

---

## 6. Produtos

- Cada produto pertence a uma empresa (isolamento multi-tenant)
- **SKU deve ser único dentro de uma empresa** (duas empresas diferentes podem ter o mesmo SKU)
- **Código de barras deve ser único dentro de uma empresa**
- Produtos têm estoque controlado pelo campo `current_stock`
- Produtos com `is_active = false` não aparecem nas listagens padrão
- Soft delete: produtos excluídos têm `deleted_at` preenchido e não aparecem mais
- Campos fiscais (NCM, CEST, CFOP, origem) são opcionais no MVP

### Unidades de medida aceitas
`UN`, `KG`, `LT`, `MT`, `CX`, `PC`, `PCT`, `DZ`

---

## 7. Parceiros (Clientes e Fornecedores)

- Um parceiro pode ser **CLIENT** (cliente), **SUPPLIER** (fornecedor) ou **BOTH** (ambos)
- Parceiros do tipo **PF** (Pessoa Física) usam CPF
- Parceiros do tipo **PJ** (Pessoa Jurídica) usam CNPJ
- O campo `cpf_cnpj` é validado com as regras do documento informado
- Parceiros com `is_active = false` não aparecem nas listagens padrão
- Soft delete disponível

---

## 8. Estoque

### Tipos de movimentação
| Tipo | Efeito no estoque | Quando usar |
|------|-------------------|-------------|
| `ENTRADA` | Aumenta `current_stock` | Recebimento de mercadorias |
| `SAIDA` | Diminui `current_stock` | Saída de mercadorias |
| `AJUSTE` | **Define** o valor do estoque | Correção de inventário |

### Regras
- **Estoque não pode ficar negativo**: tentativa de SAIDA com quantidade maior que o estoque atual retorna erro
- Movimentações manuais de estoque são registradas com motivo (opcional)
- Movimentações automáticas (geradas por compras confirmadas) têm o `reference_id` preenchido com o ID da compra
- Toda movimentação é registrada de forma permanente (histórico completo)
- A operação de criação de movimentação e atualização do estoque é **atômica** (transação)

---

## 9. Compras

### Ciclo de vida

```
RASCUNHO → CONFIRMADO → CANCELADO
RASCUNHO → CANCELADO
```

### RASCUNHO
- Compra criada mas não executada
- Estoque **não é afetado**
- Pode ser editada (fornecedor, notas)
- Pode ser confirmada ou cancelada

### CONFIRMADO
- Estoque **aumentado** automaticamente (movimentação ENTRADA por item)
- Numeração sequencial por empresa (`purchase_number`)
- **Não pode ser editada**
- Pode ser cancelada (com estorno automático do estoque)

### CANCELADO
- Se veio de CONFIRMADO: estoque **estornado** automaticamente (movimentação SAIDA por item)
- Não pode mais ser alterado

### Regras adicionais
- Apenas compras em RASCUNHO ou CANCELADO podem ser excluídas (soft delete)
- Número da compra (`purchase_number`) é único por empresa e sequencial
- Total calculado automaticamente: `Σ (quantidade × preço_unitário)`
- Itens: mínimo 1 item por compra

---

## 10. Soft Delete

- Registros "excluídos" **não são apagados do banco** — recebem `deleted_at = data/hora`
- Registros com `deleted_at != null` **não aparecem em nenhuma consulta**
- Permite auditoria e recuperação de dados históricos

### O que NÃO pode ser excluído
| Entidade | Restrição |
|----------|-----------|
| Membership OWNER | Não pode ser removido da empresa |
| Establishment MATRIZ | Não pode ser excluído |
| Compra CONFIRMADA | Não pode ser excluída (apenas cancelada) |
