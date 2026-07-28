# Documentação da API — Gestão Fiscal

## Configuração

**Base URL:** `http://localhost:3000/api/v1`
**Documentação interativa:** `http://localhost:3000/api/v1/docs` (Swagger UI)
**Autenticação:** Bearer JWT no header `Authorization: Bearer <access_token>`

### Modelo de autorização

A API combina dois mecanismos:

| Mecanismo | Como é aplicado | Onde é usado |
|-----------|-----------------|--------------|
| **Papel (role)** | `@TenantProtected(OWNER, ADMIN, ...)` — compara `membership.role` | Onboarding, gestão de papéis, gestão de permissões |
| **Permissão granular** | `@RequirePermission('products.create')` — consulta `company_role_permissions` da empresa ativa | Maioria dos endpoints de CRUD |
| **Perfil de permissão** | Conjunto nomeado de permissões vinculado a um membro | **Todo** o acesso de um MEMBER |

Três regras valem para todo o sistema:

1. **OWNER tem acesso total.** O papel OWNER nunca é barrado por permissão — o guard o libera sem consultar o banco. Ele só não faz o que a API não oferece (não existe exclusão de empresa) e não pode alterar as próprias permissões.
2. **ADMIN opera tudo abaixo do OWNER.** Recebe todas as permissões por padrão — inclusive editar e remover usuários, exceto o OWNER. O que o separa do OWNER são os endpoints travados por papel (onboarding, alterar papel, gerenciar permissões).
3. **MEMBER nasce sem nenhuma permissão.** O acesso de um MEMBER vem **exclusivamente** dos perfis vinculados a ele — sem perfil, sem acesso. Perfis são por empresa e não se aplicam a OWNER nem a ADMIN.

```
efetivas(OWNER)  = catálogo completo (o guard nem consulta o banco)
efetivas(ADMIN)  = company_role_permissions[ADMIN]
efetivas(MEMBER) = company_role_permissions[MEMBER] ∪ perfis vinculados
                   └─ vazio por padrão ─┘
```

Ver [Perfis de permissão](#perfis-de-permissão).

O erro de permissão granular retorna:

```json
{ "statusCode": 403, "message": "Sem permissão para acessar: products.create", "error": "Forbidden" }
```

> Cada endpoint abaixo indica a **permissão** ou o **papel** exigido. Consulte a seção [Permissões](#permissões) para a lista completa de códigos e a matriz padrão por papel.

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

> `role` é o papel do usuário na **empresa ativa** (`null` quando ainda não há empresa ativa).
> `forcePasswordChange: true` indica que o usuário precisa trocar a senha antes de operar — o frontend deve redirecionar para o fluxo de `POST /auth/change-password-first-login`.

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

### POST /auth/change-password-first-login — Trocar senha obrigatória

> Usado quando o login retorna `forcePasswordChange: true` (usuários criados por um administrador recebem senha provisória).
> Também pode ser usado para troca de senha comum — não há verificação de que `forcePasswordChange` esteja ativo.

**Headers:** `Authorization: Bearer <access_token>` (obrigatório)

**Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (min 8, com maiúscula, minúscula e dígito)",
  "confirmPassword": "string (igual a newPassword)"
}
```

**Resposta 200:**
```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "forcePasswordChange": false,
  "passwordChangedAt": "ISO8601"
}
```

**Erros:**
- `400` As senhas não conferem
- `400` A nova senha não pode ser igual à senha atual
- `400` Nova senha fora do padrão (mínimo 8 caracteres, maiúscula, minúscula e dígito)
- `401` Senha atual incorreta
- `404` Usuário não encontrado

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
  "role": "OWNER | ADMIN | MEMBER | null",
  "forcePasswordChange": "boolean",
  "membershipsCount": 2,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

> `role` é o papel na empresa ativa. `membershipsCount` é a quantidade de empresas às quais o usuário pertence.

**Erros:** `404` Usuário não encontrado

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

### POST /users — Criar usuário e vinculá-lo a uma empresa

> **Permissão:** `users.create` · requer empresa ativa

Cria o usuário e o membership em uma única chamada. Se `password` não for informado, a API gera uma **senha provisória de 12 caracteres** e a devolve em `temporaryPassword` (única oportunidade de lê-la).

**Body:**
```json
{
  "name": "string (min 2, opcional — default: parte do e-mail antes do @)",
  "email": "string (e-mail válido, obrigatório)",
  "password": "string (min 6, opcional)",
  "role": "ADMIN | MEMBER (obrigatório)",
  "companyId": "uuid (obrigatório — deve ser a empresa ativa)",
  "forcePasswordChange": "boolean (opcional, default: true)"
}
```

**Resposta 201:**
```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "role": "MEMBER",
  "companyId": "uuid",
  "createdAt": "ISO8601",
  "forcePasswordChange": true,
  "temporaryPassword": "string (somente quando password não é enviado)"
}
```

> O usuário já nasce com `companyActiveId` apontando para a empresa — ele consegue usar as rotas de
> tenant no primeiro login, sem precisar de `PATCH /users/active-company`.

**Erros:**
- `404` Empresa não encontrada
- `409` Email já cadastrado
- `403` Sem permissão para acessar: users.create
- `403` Não é possível criar usuários em outra empresa (quando `companyId` ≠ empresa ativa)
- `403` Não é possível atribuir o papel OWNER a um usuário
- `403` Não é possível atribuir um papel superior ao seu

---

### POST /users/:id/memberships — Vincular usuário existente à empresa ativa

> **Permissão:** `users.create` · requer empresa ativa

**Body:**
```json
{
  "role": "ADMIN | MEMBER (obrigatório)"
}
```

**Resposta 201:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "companyId": "uuid",
  "role": "MEMBER",
  "createdAt": "ISO8601"
}
```

> Se o usuário ainda não tinha empresa ativa, esta passa a ser a ativa. Quem já opera em outra
> empresa **não** tem o contexto trocado — precisa chamar `PATCH /users/active-company`.

**Erros:**
- `404` Usuário não encontrado · `404` Empresa não encontrada
- `409` Usuário já é membro da empresa
- `403` Não é possível atribuir o papel OWNER a um usuário
- `403` Não é possível atribuir um papel superior ao seu

---

### PATCH /users/:id — Editar usuário da empresa ativa

> **Permissão:** `users.edit` (por padrão OWNER e ADMIN) · requer empresa ativa

Edita os dados cadastrais de outro usuário. **Não altera o papel** — para isso use `PATCH /memberships/:id/role`.

O usuário precisa ser membro da empresa ativa, e não é possível editar quem tem papel **superior** ao do solicitante (um ADMIN não edita o OWNER).

**Body (todos opcionais):**
```json
{
  "name": "string (min 2)",
  "email": "string (e-mail válido)"
}
```

**Resposta 200:**
```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "forcePasswordChange": "boolean",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**Erros:**
- `400` Nome deve ter no mínimo 2 caracteres · `400` E-mail inválido
- `403` Sem permissão para acessar: users.edit
- `403` Não é possível gerenciar um usuário de papel superior ao seu
- `404` Usuário não encontrado nesta empresa
- `409` E-mail já cadastrado

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

> **Permissão:** `company.read` · requer empresa ativa

**Resposta 200:** dados da empresa

**Erros:** `404` Empresa não encontrada · `403` Acesso negado

---

### PATCH /companies/:id — Atualizar empresa

> **Permissão:** `company.edit` (por padrão OWNER e ADMIN) · requer empresa ativa
>
> ⚠️ O `:id` da URL é **ignorado**: a atualização é sempre aplicada à **empresa ativa** do usuário.

Permite atualizar dados da empresa: nome, tipo, CNPJ, inscrição estadual, telefone e regime tributário.

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
- `403` Sem permissão para acessar: company.edit
- `404` Empresa não encontrada
- `409` CNPJ já cadastrado em outra empresa

---

### POST /companies/onboarding — Configurar empresa (apenas OWNER)

> **Papel:** OWNER · requer empresa ativa

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

> **Permissão:** `users.create` (por padrão OWNER e ADMIN)

Cria usuário + membership na **empresa ativa** em uma transação atômica. A senha é sempre provisória (gerada internamente, não retornada), o usuário nasce com `forcePasswordChange: true` e com a **empresa ativa já definida**.

**Body:**
```json
{
  "name": "string (min 2, obrigatório)",
  "email": "string (e-mail válido, obrigatório)",
  "role": "ADMIN | MEMBER (default: MEMBER)"
}
```

> O papel informado obedece à [hierarquia de papéis](#hierarquia-de-papéis).

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
- `403` Sem permissão para acessar: users.create
- `403` Não é possível atribuir o papel OWNER a um usuário
- `403` Não é possível atribuir um papel superior ao seu

---

### GET /memberships — Listar membros

> **Permissão:** `users.list`

**Resposta 200:** array de memberships com os dados do usuário e os perfis vinculados

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "companyId": "uuid",
    "role": "MEMBER",
    "user": { "id": "uuid", "name": "string", "email": "string" },
    "profiles": [{ "id": "uuid", "name": "Estoquista" }]
  }
]
```

> `profiles` vem sempre presente (`[]` quando não há vínculo) para a tela de usuários não precisar de uma chamada por linha. Só MEMBER tem perfis.

---

### PATCH /memberships/:id/role — Alterar papel (apenas OWNER)

> **Papel:** OWNER

**Body:**
```json
{
  "role": "ADMIN | MEMBER"
}
```

**Erros:**
- `404` Associação não encontrada
- `400` Não é possível alterar o papel de um OWNER
- `403` Não é possível atribuir o papel OWNER a um usuário (promoção bloqueada)

---

### DELETE /memberships/:id — Remover membro da empresa ativa

> **Permissão:** `users.delete` (por padrão OWNER e ADMIN) · soft delete do membership

O OWNER nunca pode ser removido, e não é possível remover quem tem papel **superior** ao do solicitante. Papéis de mesmo nível podem se remover (um ADMIN remove outro ADMIN).

**Resposta 204:** sem corpo

**Erros:**
- `404` Associação não encontrada
- `400` Não é possível remover o OWNER da empresa
- `403` Sem permissão para acessar: users.delete
- `403` Não é possível gerenciar um usuário de papel superior ao seu

---

### GET /memberships/:id/profiles — Perfis vinculados ao membro

> **Permissão:** `permissions.manage`

**Resposta 200:**
```json
[
  { "id": "uuid", "name": "Estoquista", "description": "Acesso ao estoque" }
]
```

**Erros:** `404` Associação não encontrada

---

### PUT /memberships/:id/profiles — Substituir os perfis do membro

> **Permissão:** `permissions.manage` · aceita **apenas** membros com papel `MEMBER`

Substitui **todo** o conjunto de perfis do membro. Enviar `[]` desvincula todos. IDs repetidos são deduplicados.

**Body:**
```json
{
  "profileIds": ["uuid", "uuid"]
}
```

**Resposta 200:** array com os perfis que ficaram vinculados (mesmo formato do `GET`)

**Erros:**
- `404` Associação não encontrada
- `409` Perfis de permissão só podem ser vinculados a usuários com papel MEMBER
- `422` Perfil não encontrado nesta empresa: `<id>` (inclui perfis de outra empresa)
- `403` Não é possível gerenciar um usuário de papel superior ao seu
- `403` Sem permissão para acessar: permissions.manage

---

## Permissões

> Todos requerem empresa ativa. As permissões são **por empresa**: cada empresa tem seu próprio
> conjunto, criado a partir do padrão do sistema quando a empresa é criada — **exceto MEMBER, que
> nasce vazio**.
>
> Os endpoints `GET /permissions/:role` e `PATCH /permissions/:role` foram mantidos, mas **o frontend
> não os usa mais**: o acesso do MEMBER é configurado por [perfis](#perfis-de-permissão). Ver a nota
> em cada um.

### GET /permissions/me — Listar as permissões do usuário autenticado

> Qualquer membro autenticado com empresa ativa

Use este endpoint para montar o menu e habilitar/desabilitar ações no frontend. É o único endpoint de permissões acessível ao MEMBER.

**Resposta 200:** array de códigos ordenado alfabeticamente, sem duplicatas
```json
["partners.list", "products.list", "products.read", "purchases.create"]
```

Como a resposta é montada:

| Papel | Conteúdo |
|-------|----------|
| OWNER | catálogo completo, refletindo o acesso total do papel |
| ADMIN | conjunto do papel ADMIN na empresa ativa |
| MEMBER | união das permissões dos perfis vinculados — **`[]` enquanto não tiver nenhum perfil** |

> Trate `[]` como estado normal, não como erro: um MEMBER recém-criado não tem acesso a nada até
> receber um perfil. A tela deve mostrar isso de forma clara em vez de parecer quebrada.

---

### GET /permissions — Listar permissões agrupadas por domínio

> **Papel:** OWNER ou ADMIN

**Resposta 200:**
```json
[
  {
    "domain": "products",
    "label": "Produtos",
    "permissions": [
      { "code": "products.create", "description": "Criar produto" },
      { "code": "products.delete", "description": "Deletar produto" }
    ]
  }
]
```

Os grupos vêm ordenados alfabeticamente por `domain`, e as permissões por `code`. O `label` é traduzido para os domínios conhecidos (`company`, `users`, `products`, `purchases`, `stock`, `partners`); domínios sem tradução repetem o próprio `domain` como label.

---

### GET /permissions/:role — Listar permissões de um papel na empresa ativa

> **Papel:** OWNER ou ADMIN
> `:role` = `OWNER` | `ADMIN` | `MEMBER`

**Resposta 200:** array de códigos ordenado alfabeticamente
```json
["company.read", "partners.list", "products.create", "products.list"]
```

> Para `:role = OWNER` a resposta é o catálogo completo (acesso total), independentemente do que estiver gravado.
> Para `:role = MEMBER` a resposta é `[]` por padrão — o papel não tem baseline. Para saber o que um
> MEMBER específico pode fazer, use `GET /memberships/:id/profiles`.

**Erros:** `400` Papel inválido. Valores aceitos: OWNER, ADMIN, MEMBER

---

### PATCH /permissions/:role — Atualizar permissões de um papel na empresa ativa

> **Papel:** OWNER · **somente `:role` = `MEMBER`**

Substitui **todo** o conjunto de permissões do papel MEMBER **dentro da empresa ativa** (remove as atuais e insere as informadas). Enviar `[]` remove todas as permissões do papel. Outras empresas não são afetadas.

**Body:**
```json
{
  "permissionCodes": ["products.list", "products.read", "stock.list"]
}
```

**Resposta 200:** array com os códigos aplicados, sem duplicatas e ordenado

**Erros:**
- `400` Apenas as permissões do papel MEMBER podem ser gerenciadas. (ao tentar `OWNER` ou `ADMIN`)
- `400` Papel inválido. Valores aceitos: OWNER, ADMIN, MEMBER
- `404` Permissão não encontrada: `<código>` (código inexistente na tabela `permissions`)

> ⚠️ **Endpoint legado.** O baseline do papel MEMBER é vazio por padrão e o frontend não o usa mais —
> conceda acesso por [perfil de permissão](#perfis-de-permissão). Este `PATCH` continua funcionando e
> é o único jeito de dar uma permissão a **todos** os MEMBERs da empresa de uma vez; use com cuidado,
> porque ela passa a valer para quem não tem perfil nenhum.

---

## Perfis de permissão

> Todos requerem empresa ativa e a permissão `permissions.manage` (por padrão OWNER e ADMIN).

Um **perfil** é um conjunto nomeado de permissões, escopado por empresa. Um MEMBER pode ter vários
perfis ao mesmo tempo, e as permissões se **somam**. Como o papel MEMBER nasce sem nenhuma permissão,
**perfil é a única forma de dar acesso a um MEMBER**: sem perfil vinculado, ele não consegue fazer nada.

Regras que valem para todo o recurso:

- O `name` é **único por empresa**
- Perfis só se vinculam a memberships com papel `MEMBER` — OWNER e ADMIN já têm acesso amplo
- Só é possível vincular perfis **da própria empresa**
- Excluir um perfil o desvincula automaticamente de todos os membros

### GET /permission-profiles — Listar perfis da empresa ativa

**Resposta 200:**
```json
[
  {
    "id": "uuid",
    "name": "Estoquista",
    "description": "Acesso a produtos e movimentações de estoque",
    "permissionCodes": ["products.list", "stock.create"],
    "membersCount": 3,
    "createdAt": "2026-07-28T12:00:00.000Z",
    "updatedAt": "2026-07-28T12:00:00.000Z"
  }
]
```

> Ordenado por `name`. `permissionCodes` vem ordenado e sem duplicatas; `membersCount` é a quantidade de membros vinculados.

---

### POST /permission-profiles — Criar perfil

**Body:**
```json
{
  "name": "string (min 2, max 60, obrigatório)",
  "description": "string (max 255, opcional)",
  "permissionCodes": ["products.list", "stock.create"]
}
```

**Resposta 201:** o perfil criado (mesmo formato do `GET`)

**Erros:**
- `409` Já existe um perfil com este nome
- `422` Permissão não encontrada: `<código>` (código fora do catálogo `permissions`)
- `403` Sem permissão para acessar: permissions.manage

---

### GET /permission-profiles/:id — Detalhar perfil

**Resposta 200:** o perfil (mesmo formato do `GET` da lista)

**Erros:** `404` Perfil de permissão não encontrado (inclui perfil de outra empresa)

---

### PATCH /permission-profiles/:id — Atualizar perfil

Todos os campos são opcionais. Quando `permissionCodes` é enviado, ele **substitui integralmente**
a lista de permissões do perfil — mesmo padrão do `PATCH /permissions/:role`. Omitir o campo mantém
as permissões atuais; enviar `[]` remove todas. Enviar `description` vazia limpa a descrição.

**Body:**
```json
{
  "name": "Estoquista sênior",
  "description": "Acesso total ao estoque",
  "permissionCodes": ["products.list", "stock.create", "stock.list"]
}
```

**Resposta 200:** o perfil atualizado

**Erros:**
- `404` Perfil de permissão não encontrado
- `409` Já existe um perfil com este nome
- `422` Permissão não encontrada: `<código>`

---

### DELETE /permission-profiles/:id — Excluir perfil

Exclusão **definitiva** (não é soft delete — perfil é configuração, não dado de negócio). O vínculo
com os membros cai junto por cascade; os demais perfis de cada membro continuam valendo.

**Resposta 204:** sem corpo

**Erros:** `404` Perfil de permissão não encontrado

---

### Migração para o modelo de perfis

A migration `20260728150000_empty_member_baseline` **apagou todas as linhas de `company_role_permissions`
com `role = 'MEMBER'`**, em todas as empresas. Consequência imediata:

- Todo MEMBER que já existia passou a receber `403` em qualquer endpoint protegido por permissão
- `GET /permissions/me` passou a devolver `[]` para esses usuários
- OWNER e ADMIN não foram afetados

Para restabelecer o acesso, cada empresa precisa criar ao menos um perfil e vinculá-lo aos membros:

```
POST /permission-profiles       { "name": "Operação", "permissionCodes": [ ...ver "Perfil sugerido"... ] }
GET  /memberships               → lista os membros; filtrar os de papel MEMBER
PUT  /memberships/:id/profiles  { "profileIds": ["<id do perfil>"] }   (um por membro)
```

O conjunto que o MEMBER tinha antes continua registrado na tabela `role_permissions` (que deixou de
ser copiada para MEMBER, mas foi preservada de propósito). Para consultá-lo e usar como base do
primeiro perfil:

```sql
SELECT permission_code FROM role_permissions WHERE role = 'MEMBER' ORDER BY permission_code;
```

Os mesmos códigos estão marcados com 🔹 na coluna **Perfil sugerido** do [catálogo](#catálogo-de-permissões).

---

## Estabelecimentos

> Todos requerem empresa ativa

### GET /establishments — Listar estabelecimentos

> **Permissão:** `establishments.list`

**Resposta 200:** array de estabelecimentos da empresa

---

### POST /establishments — Criar estabelecimento

> **Permissão:** `establishments.create` (por padrão OWNER e ADMIN)

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

> **Permissão:** `establishments.read`

---

### PATCH /establishments/:id — Atualizar

> **Permissão:** `establishments.edit` (por padrão OWNER e ADMIN)

---

### DELETE /establishments/:id — Excluir estabelecimento

> **Permissão:** `establishments.delete` (por padrão OWNER e ADMIN)

**Erros:** `400` Não é possível excluir o estabelecimento MATRIZ

---

## Produtos

> Todos requerem empresa ativa

### GET /products — Listar produtos

> **Permissão:** `products.list`

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

> **Permissão:** `products.create`

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

> **Permissão:** `products.read`

---

### PATCH /products/:id — Atualizar produto

> **Permissão:** `products.edit`

**Body:** mesmo campos do POST (incluindo `technicalAttributes`), mais `isActive: boolean`

---

### DELETE /products/:id — Excluir produto (soft delete)

> **Permissão:** `products.delete` · **Resposta 204** sem corpo

---

## Parceiros (Clientes e Fornecedores)

> Todos requerem empresa ativa

### GET /partners — Listar parceiros

> **Permissão:** `partners.list`

**Query params:**
| Param | Tipo | Descrição |
|-------|------|-----------|
| `page` | number | Paginação |
| `limit` | number | |
| `search` | string | Busca por nome |
| `type` | CLIENT \| SUPPLIER \| BOTH | Filtro por tipo |

---

### POST /partners — Criar parceiro

> **Permissão:** `partners.create`

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

> **Permissões:** `partners.read` · `partners.edit` · `partners.delete` (DELETE responde `204`)

---

## Estoque

> Todos requerem empresa ativa

### POST /stock/movements — Registrar movimentação

> **Permissão:** `stock.create`

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

> **Permissão:** `stock.list`

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

> **Permissão:** `purchases.create`

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

> **Permissão:** `purchases.list`

**Query params:** `page`, `limit`, `status`, `supplierId`, `startDate`, `endDate`

---

### GET /purchases/:id · PATCH /purchases/:id

> **Permissões:** `purchases.read` · `purchases.edit`
> Apenas compras em **RASCUNHO** podem ser editadas.

---

### POST /purchases/:id/confirm — Confirmar compra

> **Permissão:** `purchases.confirm` · dá entrada no estoque de cada item.

**Erros:** `400` Apenas compras em RASCUNHO podem ser confirmadas

---

### POST /purchases/:id/cancel — Cancelar compra

> **Permissão:** `purchases.cancel` (por padrão OWNER e ADMIN)
> Se confirmada: estorna o estoque (movimentação SAIDA).

---

### DELETE /purchases/:id — Excluir compra

> **Permissão:** `purchases.delete` (por padrão OWNER e ADMIN) · **Resposta 204** sem corpo

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

## Catálogo de permissões

Códigos no formato `dominio.acao`, armazenados na tabela `permissions`.

- **OWNER** nunca é barrado — não depende de cadastro
- **ADMIN** recebe todas as permissões quando a empresa é criada (`company_role_permissions`)
- **MEMBER nasce sem nenhuma permissão.** Todo o acesso dele vem dos [perfis](#perfis-de-permissão) vinculados

Por isso as tabelas abaixo não têm coluna MEMBER: para qualquer código, um MEMBER só tem acesso se
algum perfil vinculado a ele contiver aquele código.

Legenda: ✅ concedida por padrão à empresa nova · **Perfil sugerido** = 🔹 marca os códigos que
compunham o antigo conjunto padrão do MEMBER, útil como ponto de partida ao montar o primeiro perfil ·
**Endpoint** = endpoint que exige a permissão (— = código cadastrado mas ainda não usado por nenhuma rota).

### Empresa (`company`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `company.read` | Ler dados da empresa | ✅ | ✅ | 🔹 | `GET /companies/:id` |
| `company.edit` | Editar dados da empresa | ✅ | ✅ | | `PATCH /companies/:id` |

### Usuários (`users`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `users.list` | Listar usuários | ✅ | ✅ | 🔹 | `GET /memberships` |
| `users.create` | Criar novo usuário | ✅ | ✅ | | `POST /memberships`, `POST /users`, `POST /users/:id/memberships` |
| `users.read` | Ler dados do usuário | ✅ | ✅ | | — |
| `users.edit` | Editar dados do usuário | ✅ | ✅ | | `PATCH /users/:id` |
| `users.delete` | Deletar usuário | ✅ | ✅ | | `DELETE /memberships/:id` |

> Mesmo com `users.create`, o papel atribuído obedece à [hierarquia de papéis](#hierarquia-de-papéis).
> `users.edit` e `users.delete` obedecem à mesma hierarquia: ninguém edita ou remove um usuário de papel superior ao seu.

### Permissões (`permissions`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `permissions.manage` | Gerenciar perfis de permissão | ✅ | ✅ | | `GET/POST/PATCH/DELETE /permission-profiles`, `GET/PUT /memberships/:id/profiles` |

> Nada impede colocar `permissions.manage` em um perfil, mas pense duas vezes: um MEMBER com essa
> permissão passa a criar perfis e a se auto-conceder acesso.

### Estabelecimentos (`establishments`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `establishments.list` | Listar estabelecimentos | ✅ | ✅ | 🔹 | `GET /establishments` |
| `establishments.create` | Criar estabelecimento | ✅ | ✅ | | `POST /establishments` |
| `establishments.read` | Ler dados do estabelecimento | ✅ | ✅ | 🔹 | `GET /establishments/:id` |
| `establishments.edit` | Editar estabelecimento | ✅ | ✅ | | `PATCH /establishments/:id` |
| `establishments.delete` | Deletar estabelecimento | ✅ | ✅ | | `DELETE /establishments/:id` |

### Produtos (`products`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `products.list` | Listar produtos | ✅ | ✅ | 🔹 | `GET /products` |
| `products.create` | Criar produto | ✅ | ✅ | 🔹 | `POST /products` |
| `products.read` | Ler dados do produto | ✅ | ✅ | 🔹 | `GET /products/:id` |
| `products.edit` | Editar produto | ✅ | ✅ | 🔹 | `PATCH /products/:id` |
| `products.delete` | Deletar produto | ✅ | ✅ | 🔹 | `DELETE /products/:id` |

### Compras (`purchases`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `purchases.list` | Listar compras | ✅ | ✅ | 🔹 | `GET /purchases` |
| `purchases.create` | Criar compra | ✅ | ✅ | 🔹 | `POST /purchases` |
| `purchases.read` | Ler dados da compra | ✅ | ✅ | 🔹 | `GET /purchases/:id` |
| `purchases.edit` | Editar compra | ✅ | ✅ | 🔹 | `PATCH /purchases/:id` |
| `purchases.confirm` | Confirmar compra | ✅ | ✅ | 🔹 | `POST /purchases/:id/confirm` |
| `purchases.cancel` | Cancelar compra | ✅ | ✅ | | `POST /purchases/:id/cancel` |
| `purchases.delete` | Deletar compra | ✅ | ✅ | | `DELETE /purchases/:id` |

### Estoque (`stock`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `stock.list` | Listar movimentações de estoque | ✅ | ✅ | 🔹 | `GET /stock/movements` |
| `stock.create` | Criar movimentação de estoque | ✅ | ✅ | 🔹 | `POST /stock/movements` |
| `stock.read` | Ler dados da movimentação | ✅ | ✅ | 🔹 | — |
| `stock.edit` | Editar movimentação | ✅ | ✅ | 🔹 | — |
| `stock.delete` | Deletar movimentação | ✅ | ✅ | | — |

### Parceiros (`partners`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `partners.list` | Listar parceiros | ✅ | ✅ | 🔹 | `GET /partners` |
| `partners.create` | Criar parceiro | ✅ | ✅ | 🔹 | `POST /partners` |
| `partners.read` | Ler dados do parceiro | ✅ | ✅ | 🔹 | `GET /partners/:id` |
| `partners.edit` | Editar parceiro | ✅ | ✅ | 🔹 | `PATCH /partners/:id` |
| `partners.delete` | Deletar parceiro | ✅ | ✅ | 🔹 | `DELETE /partners/:id` |

### Vendas (`sales`) — legado

O módulo de vendas foi removido do código, mas os 6 códigos `sales.*` (`list`, `create`, `read`, `edit`, `confirm`, `cancel`) **permanecem** na tabela `permissions` e continuam concedidos a OWNER e ADMIN. Consequência: `GET /permissions` retorna um grupo `sales` (sem label traduzido) que o frontend deve ignorar até a limpeza ser feita por migration.

---

## Hierarquia de papéis

### Ao atribuir papel

Vale em `POST /memberships`, `POST /users`, `POST /users/:id/memberships` e `PATCH /memberships/:id/role`:

- O papel **OWNER nunca é atribuível pela API** — ele nasce com a criação da empresa (`403`)
- Ninguém pode atribuir um papel **superior ao seu** (`403`)

| Solicitante | Pode atribuir |
|-------------|---------------|
| OWNER | ADMIN, MEMBER |
| ADMIN | ADMIN, MEMBER |
| MEMBER (se um perfil conceder `users.create`) | MEMBER |

**Erros:**
- `403` Não é possível atribuir o papel OWNER a um usuário
- `403` Não é possível atribuir um papel superior ao seu

### Ao editar ou remover usuário

Vale em `PATCH /users/:id`, `DELETE /memberships/:id` e `PUT /memberships/:id/profiles`:

- Ninguém edita ou remove um usuário de papel **superior ao seu** (`403`)
- Papéis de mesmo nível podem se gerenciar (ADMIN edita/remove ADMIN)
- O OWNER continua **não removível** por ninguém (`400`)

| Solicitante | Pode editar/remover |
|-------------|---------------------|
| OWNER | ADMIN, MEMBER (e editar outro OWNER) |
| ADMIN | ADMIN, MEMBER |
| MEMBER (se um perfil conceder `users.edit`/`users.delete`) | MEMBER |

**Erros:**
- `403` Não é possível gerenciar um usuário de papel superior ao seu
- `400` Não é possível remover o OWNER da empresa

---

## Pontos de atenção conhecidos

| # | Comportamento | Impacto |
|---|---------------|---------|
| 0 | **A migration `20260728150000_empty_member_baseline` apagou o baseline do papel MEMBER de todas as empresas.** Todo MEMBER que já existia ficou **sem acesso a nada** até receber um perfil. | **Alto** — ver [Migração para o modelo de perfis](#migração-para-o-modelo-de-perfis) |
| 1 | `PATCH /companies/:id` ignora o `:id` e atualiza sempre a empresa ativa. | Baixo — enviar o ID da empresa ativa para evitar confusão |
| 2 | Permissões `sales.*` remanescentes do módulo de vendas removido continuam no catálogo e são copiadas para cada empresa nova. | Baixo — ruído em `GET /permissions`; nenhum endpoint as utiliza |
| 3 | Código de permissão inexistente devolve `404` em `PATCH /permissions/:role` e `422` nos perfis. | Baixo — tratar os dois status ao validar o formulário de permissões |

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

> Códigos de permissão **não** são um enum: são valores livres da tabela `permissions`, consultáveis em `GET /permissions`. Ver [Catálogo de permissões](#catálogo-de-permissões).

---

## Multi-tenancy — Como funciona para o frontend

1. O usuário faz login e recebe `accessToken`
2. Toda requisição deve enviar `Authorization: Bearer <accessToken>`
3. O backend identifica automaticamente a **empresa ativa** do usuário (`companyActiveId`)
4. Todos os dados retornados pertencem à empresa ativa
5. Para trocar de empresa: `PATCH /users/active-company` com o novo `companyId`
6. Após trocar de empresa, todas as próximas requisições usarão a nova empresa
7. O papel na empresa ativa vem em `user.role` (login/refresh) e em `GET /users/profile`; as permissões efetivas vêm de `GET /permissions/me` — chame-o após o login e a cada troca de empresa para montar o menu e habilitar/desabilitar ações

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

### 5. Convidar um novo usuário para a empresa
```
POST /memberships            → cria usuário + membership na empresa ativa (senha provisória interna)
   ou
POST /users                  → cria usuário + membership e devolve temporaryPassword
POST /users/:id/memberships  → vincula um usuário já existente à empresa ativa
```

### 6. Primeiro acesso do usuário criado por um administrador
```
POST /auth/login                        → resposta traz forcePasswordChange: true
POST /auth/change-password-first-login  → troca a senha; forcePasswordChange vira false
```

### 7. Dar acesso a um MEMBER (único caminho)
```
GET  /permissions                     → catálogo agrupado, para montar a seleção de códigos
POST /permission-profiles             → cria o perfil (ex: "Estoquista") com os códigos escolhidos
PUT  /memberships/:id/profiles        → vincula o perfil ao membro (apenas papel MEMBER)
GET  /memberships                     → a listagem já devolve os perfis de cada membro
```

> Enquanto o passo `PUT` não acontecer, o MEMBER não tem acesso a nada.

### 8. Montar a interface conforme as permissões
```
GET /permissions/me          → códigos efetivos do usuário na empresa ativa
                               (para MEMBER: união dos perfis vinculados, ou [] se não tiver nenhum)
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
| `422` | Referência inválida no corpo (código de permissão ou perfil inexistente) |
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
