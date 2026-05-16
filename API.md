# Documentação da API — Gestão Fiscal

## Configuração

**Base URL:** `http://localhost:3000/api/v1`
**Documentação interativa:** `http://localhost:3000/api/v1/docs` (Swagger UI)
**Autenticação:** Bearer JWT no header `Authorization: Bearer <access_token>`

---

## Autenticação

### POST /auth/register — Registrar novo usuário

**Body:**
```json
{
  "name": "string (min 2 chars)",
  "email": "string (email válido)",
  "password": "string (min 6 chars)"
}
```

**Resposta 201:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "companyActiveId": "uuid | null",
    "role": "string | null",
    "forcePasswordChange": "boolean"
  }
}
```

**Erros:** `409` E-mail já cadastrado

---

### POST /auth/login — Autenticar com e-mail e senha

**Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Resposta 200:** igual ao register

**Erros:** `401` Credenciais inválidas

---

### POST /auth/refresh — Renovar token de acesso

**Body:**
```json
{
  "refreshToken": "string"
}
```

**Resposta 200:** igual ao login

**Erros:** `401` Token de atualização inválido

---

### POST /auth/logout — Encerrar sessão

**Headers:** `Authorization: Bearer <access_token>` (obrigatório)

**Resposta 204:** sem corpo

---

## Usuários

> Todos os endpoints requerem `Authorization: Bearer <token>`

### GET /users/profile — Obter perfil do usuário autenticado

**Resposta 200:**
```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "companyActiveId": "uuid | null",
  "createdAt": "ISO8601"
}
```

---

### PATCH /users/profile — Atualizar perfil

**Body (todos opcionais):**
```json
{
  "name": "string (min 2)",
  "email": "string (email)"
}
```

**Resposta 200:** usuário atualizado

---

### PATCH /users/active-company — Definir empresa ativa

**Body:**
```json
{
  "companyId": "uuid"
}
```

**Resposta 200:** usuário com novo `companyActiveId`

**Erros:** `403` Usuário não é membro da empresa selecionada

---

## Empresas

### POST /companies — Criar nova empresa

> Requer apenas JWT (sem empresa ativa)

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "name": "string (min 2, obrigatório)",
  "type": "MEI | ME | EPP | LTDA | SA | EIRELI | SLU (opcional)",
  "businessSegment": "ALUMINIO_PORTAS | SUPERMERCADO | PAPELARIA | MERCEARIA | LANCHONETE | GENERICO (opcional)",
  "phone": "string (opcional)"
}
```

**Resposta 201:**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "string | null",
  "businessSegment": "string | null",
  "phone": "string | null",
  "isOnboarded": false,
  "createdAt": "ISO8601"
}
```

> Ao criar, automaticamente cria um Membership OWNER e define como empresa ativa.

---

### GET /companies — Listar empresas do usuário

> Requer apenas JWT

**Resposta 200:** array de empresas onde o usuário tem membership (inclui `businessSegment`)

---

### GET /companies/:id — Buscar empresa por ID

> Requer empresa ativa

**Resposta 200:** dados da empresa

**Erros:** `404` Empresa não encontrada · `403` Acesso negado

---

### PATCH /companies/:id — Atualizar empresa (apenas OWNER)

> Requer empresa ativa. Permite atualizar dados da empresa: nome, tipo, CNPJ, inscrição estadual, telefone e regime tributário.

**Body:** (todos os campos são opcionais)
```json
{
  "name": "string (min 2 chars)",
  "type": "MEI | ME | EPP | LTDA | SA | EIRELI | SLU",
  "cnpj": "string (formato: XX.XXX.XXX/XXXX-XX)",
  "stateRegistration": "string (Inscrição Estadual, min 11 dígitos)",
  "phone": "string (formato: (XX) XXXXX-XXXX)",
  "taxRegime": "SIMPLES_NACIONAL | LUCRO_PRESUMIDO | LUCRO_REAL | MEI"
}
```

**Validações:**
- `name`: mínimo 2 caracteres
- `type`: enum válido (MEI, ME, EPP, LTDA, SA, EIRELI, SLU)
- `cnpj`: formato brasileiro XX.XXX.XXX/XXXX-XX (validação de dígitos)
- `stateRegistration`: mínimo 11 dígitos (padrão estadual brasileiro)
- `phone`: formato (XX) XXXXX-XXXX ou variações
- `taxRegime`: enum válido (SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL, MEI)

**Resposta 200:**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "string",
  "cnpj": "string",
  "taxRegime": "string",
  "phone": "string",
  "isOnboarded": "boolean",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**Erros:**
- `400` Validação inválida (CNPJ, IE, telefone, nome)
- `403` Acesso negado (não é OWNER)
- `404` Empresa não encontrada
- `409` CNPJ já cadastrado em outra empresa

---

### POST /companies/onboarding — Configurar empresa (apenas OWNER)

> Obrigatório após criar empresa. Só pode ser feito uma vez.

**Body:**
```json
{
  "cnpj": "string (CNPJ válido, obrigatório)",
  "taxRegime": "SIMPLES_NACIONAL | LUCRO_PRESUMIDO | LUCRO_REAL | MEI",
  "phone": "string (opcional)",
  "establishmentName": "string (min 2, obrigatório)",
  "inscricaoEstadual": "string (opcional)",
  "inscricaoMunicipal": "string (opcional)",
  "cep": "string (opcional)",
  "street": "string (opcional)",
  "number": "string (opcional)",
  "complement": "string (opcional)",
  "neighborhood": "string (opcional)",
  "city": "string (opcional)",
  "state": "string (2 chars, ex: SP)"
}
```

**Resposta 200:** empresa atualizada com `isOnboarded: true`

**Erros:** `400` Empresa já foi configurada · `409` CNPJ já cadastrado

---

## Memberships (Membros da Empresa)

> Todos requerem empresa ativa

### POST /memberships — Criar membro na empresa

> Requer permissão `users.create`. OWNER pode criar ADMIN ou MEMBER. ADMIN pode criar apenas MEMBER. MEMBER com permissão `users.create` pode criar apenas MEMBER.

**Body:**
```json
{
  "name": "string (min 2, obrigatório)",
  "email": "string (e-mail válido, obrigatório)",
  "role": "ADMIN | MEMBER (default: MEMBER)"
}
```

**Resposta 201:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "companyId": "uuid",
  "role": "MEMBER",
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string"
  }
}
```

**Erros:**
- `409` E-mail já cadastrado
- `409` Usuário já é membro desta empresa
- `403` Sem permissão (apenas OWNER/ADMIN/MEMBER com `users.create`)

---

### GET /memberships — Listar membros

**Resposta 200:** array de memberships com dados do usuário

---

### PATCH /memberships/:id/role — Alterar papel (apenas OWNER)

**Body:**
```json
{
  "role": "ADMIN | MEMBER"
}
```

**Erros:** `400` Não é possível alterar o papel de um OWNER

---

### DELETE /memberships/:id — Remover membro (apenas OWNER)

**Resposta 200**

**Erros:** `400` Não é possível remover o OWNER da empresa

---

## Estabelecimentos

> Todos requerem empresa ativa

### GET /establishments — Listar estabelecimentos

**Resposta 200:** array de estabelecimentos da empresa

---

### POST /establishments — Criar estabelecimento (OWNER ou ADMIN)

**Body:**
```json
{
  "name": "string (min 2, obrigatório)",
  "type": "MATRIZ | FILIAL (obrigatório)",
  "cnpj": "string (CNPJ válido, opcional)",
  "inscricaoEstadual": "string (opcional)",
  "inscricaoMunicipal": "string (opcional)",
  "cep": "string (opcional)",
  "street": "string (opcional)",
  "number": "string (opcional)",
  "complement": "string (opcional)",
  "neighborhood": "string (opcional)",
  "city": "string (opcional)",
  "state": "string (2 chars)"
}
```

**Erros:** `409` Já existe um estabelecimento MATRIZ

---

### GET /establishments/:id — Buscar por ID

---

### PATCH /establishments/:id — Atualizar (OWNER ou ADMIN)

---

### DELETE /establishments/:id — Excluir (apenas OWNER)

**Erros:** `400` Não é possível excluir o estabelecimento MATRIZ

---

## Produtos

> Todos requerem empresa ativa

### GET /products — Listar produtos

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `page` | number | Página (default: 1) |
| `limit` | number | Itens por página (default: 20, max: 100) |
| `search` | string | Busca por nome |

**Resposta 200:**
```json
{
  "data": [{ "id": "uuid", "name": "string", "sku": "string", "currentStock": "string", "..." : "..." }],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### POST /products — Criar produto

**Body:**
```json
{
  "name": "string (min 2, obrigatório)",
  "description": "string (opcional)",
  "sku": "string (único por empresa, opcional)",
  "barcode": "string (único por empresa, opcional)",
  "unit": "UN | KG | LT | MT | CX | PC | PCT | DZ (default: UN)",
  "costPrice": "number (opcional)",
  "salePrice": "number (opcional)",
  "minStock": "number >= 0 (opcional)",
  "ncm": "string (opcional)",
  "cest": "string (opcional)",
  "cfop": "string (opcional)",
  "origin": "number 0-8 (opcional)",
  "technicalAttributes": "{ ... } objeto JSON com atributos técnicos (opcional)"
}
```

**Erros:** `409` SKU ou código de barras já cadastrado

---

### GET /products/:id — Buscar por ID

---

### PATCH /products/:id — Atualizar produto

**Body:** mesmo campos do POST (incluindo `technicalAttributes`), mais `isActive: boolean`

---

### DELETE /products/:id — Excluir produto (soft delete)

---

## Parceiros (Clientes e Fornecedores)

> Todos requerem empresa ativa

### GET /partners — Listar parceiros

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `page` | number | Paginação |
| `limit` | number | |
| `search` | string | Busca por nome |
| `type` | CLIENT \| SUPPLIER \| BOTH | Filtro por tipo |

---

### POST /partners — Criar parceiro

**Body:**
```json
{
  "type": "CLIENT | SUPPLIER | BOTH (obrigatório)",
  "personType": "PF | PJ (obrigatório)",
  "name": "string (min 2, obrigatório)",
  "tradeName": "string (opcional)",
  "cpfCnpj": "string (CPF ou CNPJ válido, opcional)",
  "rgIe": "string (RG ou IE, opcional)",
  "email": "string (email, opcional)",
  "phone": "string (opcional)",
  "cep": "string (opcional)",
  "street": "string (opcional)",
  "number": "string (opcional)",
  "complement": "string (opcional)",
  "neighborhood": "string (opcional)",
  "city": "string (opcional)",
  "state": "string (2 chars, opcional)"
}
```

---

### GET /partners/:id · PATCH /partners/:id · DELETE /partners/:id

---

## Estoque

> Todos requerem empresa ativa

### POST /stock/movements — Registrar movimentação

**Body:**
```json
{
  "productId": "uuid (obrigatório)",
  "type": "ENTRADA | SAIDA | AJUSTE (obrigatório)",
  "quantity": "number > 0 (obrigatório)",
  "reason": "string (opcional)"
}
```

**Resposta 201:** movimentação criada

**Erros:**
- `404` Produto não encontrado
- `400` Estoque insuficiente (ao tentar SAIDA com quantidade > estoque)

**Efeitos no estoque:**
- `ENTRADA`: `currentStock += quantity`
- `SAIDA`: `currentStock -= quantity`
- `AJUSTE`: `currentStock = quantity`

---

### GET /stock/movements — Listar movimentações

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `page` / `limit` | number | Paginação |
| `productId` | uuid | Filtrar por produto |
| `type` | ENTRADA \| SAIDA \| AJUSTE | Filtrar por tipo |
| `startDate` | ISO8601 | Data inicial |
| `endDate` | ISO8601 | Data final |

---

## Compras

> Estrutura análoga. Todos requerem empresa ativa.

### POST /purchases — Criar nova compra (status: RASCUNHO)

**Body:**
```json
{
  "establishmentId": "uuid (obrigatório)",
  "supplierId": "uuid (opcional)",
  "items": [
    {
      "productId": "uuid",
      "quantity": "number > 0",
      "unitPrice": "number > 0"
    }
  ],
  "notes": "string (opcional)",
  "purchaseDate": "ISO8601 (opcional)"
}
```

---

### GET /purchases — Listar compras

**Query params:** `page`, `limit`, `status`, `supplierId`, `startDate`, `endDate`

---

### GET /purchases/:id · PATCH /purchases/:id

> Apenas compras em **RASCUNHO** podem ser editadas.

---

### POST /purchases/:id/confirm — Confirmar compra

> Dá entrada no estoque de cada item.

**Erros:** `400` Apenas compras em RASCUNHO podem ser confirmadas

---

### POST /purchases/:id/cancel — Cancelar compra (ADMIN ou OWNER)

> Se confirmada: estorna o estoque (movimentação SAIDA).

---

### DELETE /purchases/:id — Excluir compra (ADMIN ou OWNER)

---

## Paginação

Todos os endpoints de listagem suportam paginação:

**Query params:**
- `page`: número da página (default: 1, min: 1)
- `limit`: itens por página (default: 20, min: 1, max: 100)
- `search`: busca textual por nome (quando suportado)

**Formato da resposta paginada:**
```json
{
  "data": [],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

## Enums — Valores Aceitos

| Enum | Valores aceitos |
|------|----------------|
| `CompanyType` | `MEI`, `ME`, `EPP`, `LTDA`, `SA`, `EIRELI`, `SLU` |
| `BusinessSegment` | `ALUMINIO_PORTAS`, `SUPERMERCADO`, `PAPELARIA`, `MERCEARIA`, `LANCHONETE`, `GENERICO` |
| `TaxRegime` | `SIMPLES_NACIONAL`, `LUCRO_PRESUMIDO`, `LUCRO_REAL`, `MEI` |
| `EstablishmentType` | `MATRIZ`, `FILIAL` |
| `MembershipRole` | `OWNER`, `ADMIN`, `MEMBER` |
| `PartnerType` | `CLIENT`, `SUPPLIER`, `BOTH` |
| `PersonType` | `PF`, `PJ` |
| `UnitOfMeasure` | `UN`, `KG`, `LT`, `MT`, `CX`, `PC`, `PCT`, `DZ` |
| `StockMovementType` | `ENTRADA`, `SAIDA`, `AJUSTE` |
| `PurchaseStatus` | `DRAFT`, `CONFIRMED`, `CANCELLED` |

---

## Multi-tenancy — Como funciona para o frontend

1. O usuário faz login e recebe `accessToken`
2. Toda requisição deve enviar `Authorization: Bearer <accessToken>`
3. O backend identifica automaticamente a **empresa ativa** do usuário (`companyActiveId`)
4. Todos os dados retornados pertencem à empresa ativa
5. Para trocar de empresa: `PATCH /users/active-company` com o novo `companyId`
6. Após trocar de empresa, todas as próximas requisições usarão a nova empresa

---

## Fluxo completo de uso

### 1. Onboarding inicial
```
POST /auth/register          → salvar accessToken e refreshToken
POST /companies              → criar empresa (empresa ativa definida automaticamente)
POST /companies/onboarding   → configurar CNPJ, regime e estabelecimento MATRIZ
```

### 2. Cadastro de produtos e parceiros
```
POST /products               → cadastrar produtos
POST /partners               → cadastrar clientes e fornecedores
```

### 3. Fluxo de compra
```
POST /purchases              → criar compra em RASCUNHO
POST /purchases/:id/confirm  → confirmar (estoque aumenta)
```

### 4. Renovar token
```
POST /auth/refresh           → enviar refreshToken, receber novo par de tokens
```

---

## Códigos de status HTTP

| Status | Significado |
|--------|-------------|
| `200` | Sucesso |
| `201` | Criado com sucesso |
| `204` | Sem conteúdo (ex: logout) |
| `400` | Dados inválidos ou regra de negócio violada |
| `401` | Não autenticado (token inválido ou ausente) |
| `403` | Sem permissão (papel insuficiente ou empresa incorreta) |
| `404` | Recurso não encontrado |
| `409` | Conflito (duplicidade: e-mail, CNPJ, SKU, etc.) |
| `500` | Erro interno do servidor |

---

## Formato de erros

```json
{
  "statusCode": 404,
  "message": "Produto não encontrado",
  "error": "Not Found"
}
```
