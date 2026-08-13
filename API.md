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

> **Dados fiscais da empresa** entram pelo `PATCH /companies/:id`: `razaoSocial`,
> `nomeFantasia`, `inscricaoEstadual` (2 a 14 dígitos), `inscricaoMunicipal`, `crt`,
> `contribuinteIcms`, `codigoIbgeMunicipio` (7 dígitos), `telefoneFiscal` e `emailFiscal`.
> O endereço fiscal do emitente vem do estabelecimento (`cep`, `street`, `number`,
> `neighborhood`, `city`, `state` e `ibgeCode`). O backend deriva `fiscalConfigComplete`;
> enquanto for falso a emissão é bloqueada.

---

### GET /companies — Listar empresas do usuário

> Requer apenas JWT

**Resposta 200:** array de empresas onde o usuário tem membership (inclui `businessSegment`)

---

### GET /companies/:id — Buscar empresa por ID

> **Permissão:** `company.read` · requer empresa ativa

**Resposta 200:** dados da empresa, com `establishments[]` e mais dois campos derivados:

| Campo | Origem |
|---|---|
| `stateRegistration` | IE do estabelecimento MATRIZ — **é a IE do emitente da NFC-e**. `null` se a empresa ainda não tem matriz. Ver [As duas Inscrições Estaduais](#as-duas-inscrições-estaduais) |
| `fiscalConfigComplete` | derivado dos dados fiscais da empresa |

**Erros:** `404` Empresa não encontrada · `403` Acesso negado

---

### PATCH /companies/:id — Atualizar empresa

> **Permissão:** `company.edit` (por padrão OWNER e ADMIN) · requer empresa ativa
>
> ⚠️ O `:id` da URL é **ignorado**: a atualização é sempre aplicada à **empresa ativa** do usuário.

Permite atualizar dados da empresa: nome, tipo, CNPJ, inscrição estadual, telefone, regime tributário
e a política de fechamento de caixa.

**Body:** (todos os campos são opcionais)
```json
{
  "name": "string (min 2 chars)",
  "type": "MEI | ME | EPP | LTDA | SA | EIRELI | SLU",
  "cnpj": "string (formato: XX.XXX.XXX/XXXX-XX)",
  "stateRegistration": "string (Inscrição Estadual, min 11 dígitos)",
  "phone": "string (formato: (XX) XXXXX-XXXX)",
  "taxRegime": "SIMPLES_NACIONAL | LUCRO_PRESUMIDO | LUCRO_REAL | MEI",
  "cashBlindClose": "boolean — fechamento de caixa às cegas (default false)"
}
```

**Validações:**
- `name`: mínimo 2 caracteres
- `type`: enum válido (MEI, ME, EPP, LTDA, SA, EIRELI, SLU)
- `cnpj`: formato brasileiro XX.XXX.XXX/XXXX-XX (validação de dígitos)
- `stateRegistration`: mínimo 11 dígitos (padrão estadual brasileiro)
- `phone`: formato (XX) XXXXX-XXXX ou variações
- `taxRegime`: enum válido (SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL, MEI)
- `cashBlindClose`: liga o [fechamento às cegas](#fechamento-às-cegas) para toda a empresa

##### As duas Inscrições Estaduais

Existem dois campos de IE, e eles **não são a mesma coisa**:

| Campo | Onde grava | Papel na emissão |
|---|---|---|
| `stateRegistration` | estabelecimento **MATRIZ** | **É a IE do emitente da NFC-e** |
| `inscricaoEstadual` | própria empresa | Fallback, usado só se a matriz não tiver IE |

A precedência é aplicada por `montarEmitente`:
`establishment.inscricaoEstadual ?? company.inscricaoEstadual`. Por isso a **matriz é a fonte
da verdade** — a IE é atribuída por estabelecimento, e uma filial em outra UF tem a sua.

`stateRegistration` é **read-write**: o que o PATCH aceita, o GET e a própria resposta do PATCH
devolvem, derivado da matriz. Empresa sem matriz devolve `null`, sem erro.

Enviar `inscricaoEstadual` e `stateRegistration` **com valores diferentes na mesma requisição**
é recusado com `400` — aceitar os dois faria a nota sair com uma IE e a tela mostrar outra, em
silêncio.

**Resposta 200:**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "string",
  "cnpj": "string",
  "stateRegistration": "string | null — IE da matriz (derivado)",
  "taxRegime": "string",
  "phone": "string",
  "isOnboarded": "boolean",
  "cashBlindClose": "boolean",
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

**Remove o vínculo, não a conta.** O usuário continua existindo e consegue fazer login — ele apenas
deixa de ser membro da empresa. Junto com o soft delete do membership, a rota:

- aponta a empresa ativa do usuário para outra empresa dele, se houver
- ou zera a empresa ativa **e o refresh token** quando aquela era a última empresa, encerrando a sessão

Assim o removido cai no estado "sem empresa" em vez de receber `403 Not a member of active company`
em toda requisição.

> Para readmitir alguém removido, use `POST /users/:id/memberships` com o `id` do usuário.
> `POST /memberships` devolveria `409 E-mail já cadastrado`, porque a conta nunca foi apagada.

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
  "ncm": "string 8 dígitos (opcional)",
  "cest": "string 7 dígitos (opcional)",
  "cfop": "string 4 dígitos iniciando em 5 (opcional)",
  "origin": "number 0-8 (opcional)",
  "csosn": "101 | 102 | 103 | 201 | 202 | 203 | 300 | 400 | 500 | 900 — emitente do Simples (opcional)",
  "cstIcms": "00 | 10 | 20 | 30 | 40 | 41 | 50 | 51 | 60 | 70 | 90 — emitente do Regime Normal (opcional)",
  "cstPis": "CST de PIS, 2 dígitos — exigido para fiscalComplete",
  "cstCofins": "CST de COFINS, 2 dígitos — exigido para fiscalComplete",
  "aliquotaIcms": "number >= 0 (opcional)",
  "aliquotaPis": "number >= 0 (opcional)",
  "aliquotaCofins": "number >= 0 (opcional)",
  "technicalAttributes": "{ ... } objeto JSON com atributos técnicos (opcional)"
}
```

O backend deriva **`fiscalComplete`** na gravação, com as mesmas regras do motor fiscal: NCM
de 8 dígitos, CFOP começando com 5, origem de 0 a 8, situação tributária de ICMS dentro do
conjunto aceito (CSOSN para o Simples, CST de ICMS para o Regime Normal) e **CST de PIS e de
COFINS**. Produto incompleto bloqueia a emissão da NFC-e da venda que o contém.

> **Os CST de PIS e COFINS passaram a ser exigidos.** O motor deixou de completá-los com CST
> 07 fixo — o código agora vem do cadastro. Quando o CST é tributado por percentual (`01`,
> `02`), a alíquota correspondente também é exigida; situação não tributada (`04` a `09`) não
> comporta alíquota nenhuma.

> **O conjunto de situações de ICMS aumentou.** A lista antiga era "as que se resolvem sem
> valores"; agora vale toda situação para a qual exista grupo no XML. Situações que exigem
> substituição tributária, redução de base ou crédito do Simples são aceitas no cadastro, mas
> a emissão ainda as recusa — esses valores dependem da matriz tributária por operação, que é
> a etapa 2 do roteiro fiscal.

**Erros:** `409` SKU ou código de barras já cadastrado

---

### GET /products/fiscal-pending — Produtos com pendência fiscal

> **Permissão:** `products.list`

Produtos que bloqueariam a emissão, com o motivo de cada pendência.

**Query params:** `page`, `limit`, `search`

**Resposta 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Refrigerante Lata 350ml",
      "sku": "REF350",
      "ncm": "2202",
      "cfop": "5102",
      "origin": 0,
      "csosn": "102",
      "cstIcms": null,
      "pendencias": ["NCM ausente ou fora do formato de 8 dígitos"]
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

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
  "state": "string (2 chars, opcional)",
  "ibgeCode": "string (7 dígitos, opcional)",
  "indIeDest": "1 | 2 | 9 (opcional)"
}
```

**`ibgeCode` e `indIeDest` existem para a NF-e.** São opcionais no cadastro e
obrigatórios na emissão: cliente sem eles é recusado nomeando o campo, em vez de
bloquear o cadastro de quem nunca vai receber NF-e.

- `ibgeCode` — código IBGE do município, o `cMun` do destinatário.
- `indIeDest` — `1` contribuinte, `2` isento de inscrição, `9` não contribuinte.
  **Não se deduz do tipo de pessoa:** prestadora de serviço é pessoa jurídica e
  não é contribuinte de ICMS. Quando `1`, o `rgIe` passa a ser lido como
  inscrição estadual e é obrigatório; nos outros dois casos ele não é enviado.

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
  "paymentCondition": "A_VISTA | A_PRAZO (opcional, default A_VISTA)",
  "installments": "int >= 1 (opcional, default 1) — só usado em A_PRAZO",
  "firstDueDate": "ISO8601 (opcional) — default: hoje + intervalDays",
  "intervalDays": "int >= 1 (opcional, default 30)",
  "notes": "string (opcional)",
  "purchaseDate": "ISO8601 (opcional)"
}
```

A condição de pagamento é **gravada na compra**, não só usada na hora. A compra nasce em RASCUNHO e é
confirmada depois, possivelmente por outra pessoa — sem persistir, o plano de parcelas escolhido aqui
se perderia no caminho.

---

### GET /purchases — Listar compras

> **Permissão:** `purchases.list`

**Query params:** `page`, `limit`, `status`, `supplierId`, `startDate`, `endDate`

---

### GET /purchases/:id · PATCH /purchases/:id

> **Permissões:** `purchases.read` · `purchases.edit`
> Apenas compras em **RASCUNHO** podem ser editadas.

O `PATCH` também aceita `paymentCondition`, `installments`, `firstDueDate` e `intervalDays` — é a
janela para corrigir o plano de parcelas antes de confirmar.

---

### POST /purchases/:id/confirm — Confirmar compra

> **Permissão:** `purchases.confirm` · dá entrada no estoque de cada item.

Quando a compra é `A_PRAZO`, a mesma transação gera **um título a pagar por parcela**
(`financial_entries` do tipo `PAGAR`, status `ABERTO`), com `description` no formato
`Compra #<numero> (i/N)` e vencimentos espaçados por `intervalDays`. Em `A_VISTA` **nenhum título é
gerado** — a compra foi paga no ato, e contas a pagar é só o que fica em aberto.

Os títulos só nascem aqui, nunca na criação: a compra em RASCUNHO ainda pode ser editada ou excluída,
e o financeiro não deve enxergar dívida que talvez não exista.

**Erros:** `400` Apenas compras em RASCUNHO podem ser confirmadas

---

### POST /purchases/:id/cancel — Cancelar compra

> **Permissão:** `purchases.cancel` (por padrão OWNER e ADMIN)
> Se confirmada: estorna o estoque (movimentação SAIDA).

Os títulos a pagar da compra que ainda não foram cancelados passam a `CANCELADO` na mesma transação.

**Se alguma parcela já tiver pagamento, o cancelamento é recusado** com
`400 Compra possui parcelas pagas; estorne o financeiro antes`. Estornar em silêncio apagaria histórico
de caixa. A checagem acontece **antes** da devolução do estoque, então nada é revertido pela metade.

---

### DELETE /purchases/:id — Excluir compra

> **Permissão:** `purchases.delete` (por padrão OWNER e ADMIN) · **Resposta 204** sem corpo

---

## Vendas (PDV)

Uma venda tem **três eixos de status independentes**. Só o primeiro é movido por este módulo:

| Campo | Valores | Quem move |
|-------|---------|-----------|
| `status` | `ORCAMENTO`, `EM_ABERTO`, `CONCLUIDA`, `CANCELADA` | este módulo |
| `paymentStatus` | `PENDENTE`, `APROVADO`, `RECUSADO`, `ESTORNADO` | módulo financeiro (nasce `PENDENTE`) |
| `fiscalStatus` | `NAO_EMITIDO`, `PROCESSANDO`, `AUTORIZADO`, `REJEITADO`, `CANCELADO` | módulo fiscal (nasce `NAO_EMITIDO`) |

A única exceção: **cancelar uma venda com `paymentStatus: APROVADO` muda o pagamento para `ESTORNADO`**.

**A venda nasce como `ORCAMENTO` e não toca no estoque.** A baixa acontece só na finalização —
um orçamento pode ficar dias parado e o estoque mudar nesse meio-tempo, então a validação de saldo
roda no `confirm`, nunca na criação.

---

### GET /sales/context — Dados para montar a venda

> **Permissão:** `sales.create`

Devolve, numa chamada só, tudo que a tela do PDV precisa para montar uma venda: estabelecimentos,
clientes e o catálogo de produtos ativos.

**Existe para que o vendedor precise apenas de `sales.*`.** Sem ele, a tela de venda dependeria de
`establishments.list`, `partners.list` e `products.list` — e conceder essas três permissões abriria os
menus de Estabelecimentos, Parceiros e Produtos na sidebar. Aquelas rotas continuam gated em `.list`.

**Resposta 200:**
```json
{
  "establishments": [
    { "id": "uuid", "name": "Matriz" }
  ],
  "customers": [
    { "id": "uuid", "name": "João da Silva" }
  ],
  "products": [
    {
      "id": "uuid",
      "name": "Caneta azul",
      "sku": "CAN-001",
      "barcode": "7891234567890",
      "unit": "UN",
      "salePrice": "9.9",
      "currentStock": "12"
    }
  ]
}
```

- **Sem paginação** — é catálogo para busca client-side no balcão. Se crescer demais, o passo natural
  é um `?search=`, não paginar
- `customers` traz os parceiros de tipo `CLIENT` e `BOTH`; quem é só `SUPPLIER` fica de fora
- `products` traz apenas os ativos (`isActive: true`)
- `salePrice` e `currentStock` são `Decimal` e vêm como **string** (padrão do Prisma). A string **não
  é zero-padded**: um preço de 9,90 chega como `"9.9"`, não `"9.90"` — formate no frontend. `salePrice`
  pode ser `null` quando o produto não tem preço cadastrado
- Tudo escopado na empresa ativa e ordenado por `name`

---

### POST /sales — Criar venda

> **Permissão:** `sales.create`

**Body:**
```json
{
  "establishmentId": "uuid (obrigatório)",
  "customerId": "uuid (opcional)",
  "items": [
    {
      "productId": "uuid",
      "quantity": "number > 0",
      "unitPrice": "number > 0"
    }
  ],
  "discount": "number >= 0 (opcional, default 0)",
  "paymentMethod": "DINHEIRO | CARTAO_CREDITO | CARTAO_DEBITO | PIX | BOLETO | OUTRO (opcional)",
  "paymentCondition": "A_VISTA | A_PRAZO (opcional, default A_VISTA)",
  "payments": [
    {
      "method": "DINHEIRO | CARTAO_CREDITO | CARTAO_DEBITO | PIX | BOLETO | OUTRO",
      "amount": "number > 0",
      "amountReceived": "number > 0 (opcional) — só DINHEIRO, para calcular o troco"
    }
  ],
  "installments": "int >= 1 (opcional, default 1) — só usado em A_PRAZO",
  "firstDueDate": "ISO8601 (opcional) — default: hoje + intervalDays",
  "intervalDays": "int >= 1 (opcional, default 30) — dias entre parcelas",
  "notes": "string (opcional)",
  "saleDate": "ISO8601 (opcional)",
  "confirm": "boolean (opcional, default false)"
}
```

- `subtotal` = soma de `quantity × unitPrice` dos itens; `totalAmount` = `subtotal - discount`
- **`confirm: true` finaliza a venda na mesma chamada** — é o caminho do PDV: cria, dá baixa no
  estoque e devolve a venda já `CONCLUIDA`. Se faltar estoque, **nada é gravado** (tudo roda numa
  transação única)
- ⚠️ **`payments` é obrigatório ao finalizar uma venda `A_VISTA`** (`confirm: true`). O orçamento
  (`confirm: false`) não exige — as formas são definidas ao fechar. Ver
  [Pagamentos da venda](#pagamentos-da-venda)
- `saleNumber` é sequencial **por empresa**
- `paymentCondition`, `installments`, `firstDueDate` e `intervalDays` ficam **gravados na venda** e são
  usados na finalização — inclusive quando ela acontece depois, por `POST /sales/:id/confirm`

**Erros:**
- `404` Estabelecimento não encontrado · Cliente não encontrado · Produto não encontrado: `<id>`
- `400` O desconto não pode ser maior que o subtotal da venda
- `400` Estoque insuficiente para o produto `<nome>` (só com `confirm: true`)
- `400` Informe as formas de pagamento para finalizar uma venda à vista
- `400` Os pagamentos devem somar o total da venda
- `400` O valor recebido em dinheiro não pode ser menor que o valor do pagamento
- `400` Abra um caixa para registrar vendas em dinheiro (só com `confirm: true` em `A_VISTA`)

---

### Pagamentos da venda

Uma venda à vista pode ser paga em **várias formas ao mesmo tempo** — parte no PIX, parte em dinheiro.
Cada forma vira uma linha em `sale_payments`, e é esse conjunto que passa a ser a **fonte de verdade**
do pagamento. A coluna `paymentMethod` da venda continua existindo, mas apenas como **forma
predominante** (a de maior `amount`), para exibição em lista e relatório.

**Quando é exigido:** ao finalizar uma venda `A_VISTA` — seja por `POST /sales { confirm: true }` ou
por `POST /sales/:id/confirm`. A mesma finalização exige que o operador tenha um
[caixa aberto](#bloqueio-da-venda), e carimba a venda com `cashSessionId`.

| Situação | `payments` |
|----------|------------|
| Orçamento (`confirm: false`) | Não exigido — as formas são definidas ao fechar |
| Finalização `A_VISTA` | **Obrigatório**; a soma dos `amount` deve fechar o `totalAmount` |
| Finalização `A_PRAZO` | **Ignorado** — o que fica em aberto vira título em contas a receber |

**Regras:**

- Cada `amount` deve ser maior que zero
- A soma dos `amount` tem que bater com o `totalAmount`, com **tolerância de um centavo** — o
  arredondamento de um rateio no caixa não pode travar a venda, mas diferença maior é erro de digitação
- `amountReceived` só faz sentido em `DINHEIRO`: quando informado, precisa ser **maior ou igual** ao
  `amount`, e o backend grava `changeGiven = amountReceived - amount` (o troco). Nas demais formas o
  campo é **ignorado** e volta como `null`
- Pagamento inválido **derruba a venda inteira antes de tocar no estoque** — não existe venda
  finalizada com pagamento pela metade
- Ao cancelar a venda, os pagamentos **permanecem registrados**: são histórico de caixa

**Exemplo — R$ 100,00 pagos em PIX e dinheiro, com troco:**
```json
{
  "payments": [
    { "method": "PIX", "amount": 60 },
    { "method": "DINHEIRO", "amount": 40, "amountReceived": 50 }
  ]
}
```

A venda volta com `paymentStatus: "APROVADO"`, `paymentMethod: "PIX"` (a maior) e:
```json
{
  "payments": [
    { "id": "uuid", "method": "PIX", "amount": "60", "amountReceived": null, "changeGiven": null },
    { "id": "uuid", "method": "DINHEIRO", "amount": "40", "amountReceived": "50", "changeGiven": "10" }
  ]
}
```

> Ainda **não** existe pagamento misto à vista + a prazo (entrada). Uma venda é inteira `A_VISTA` ou
> inteira `A_PRAZO`.

---

### GET /sales — Listar vendas

> **Permissão:** `sales.list`

**Query params:** `page`, `limit`, `status`, `paymentStatus`, `fiscalStatus`, `customerId`, `establishmentId`, `startDate`, `endDate`

---

### GET /sales/:id — Detalhar venda

> **Permissão:** `sales.read` · retorna itens (com produto), pagamentos, estabelecimento e cliente.

---

### PATCH /sales/:id — Atualizar venda

> **Permissão:** `sales.edit`
> Apenas vendas em **ORCAMENTO** ou **EM_ABERTO** podem ser editadas.

**Body (todos opcionais):**
```json
{
  "customerId": "uuid",
  "items": [{ "productId": "uuid", "quantity": 2, "unitPrice": 10.5 }],
  "discount": 5,
  "paymentMethod": "PIX",
  "notes": "string",
  "saleDate": "ISO8601",
  "status": "ORCAMENTO | EM_ABERTO"
}
```

- Enviar `items` **substitui a lista inteira** e recalcula os totais
- `status` aqui só promove o orçamento a venda em aberto (ou volta atrás). Finalizar e cancelar têm rotas próprias

**Erros:** `400` Apenas vendas em ORCAMENTO ou EM_ABERTO podem ser editadas

---

### POST /sales/:id/confirm — Finalizar venda

> **Permissão:** `sales.confirm` · dá **saída** no estoque de cada item.

**Body (opcional em A_PRAZO, obrigatório em A_VISTA):**
```json
{
  "payments": [
    { "method": "DINHEIRO", "amount": 100, "amountReceived": 150 }
  ]
}
```

Em transação única: valida os pagamentos, valida o saldo de cada produto, cria as movimentações
`SAIDA`, desconta o `currentStock`, marca a venda como `CONCLUIDA` e faz o **desdobramento
financeiro**. Não mexe em `fiscalStatus`.

| `paymentCondition` | `payments` | `paymentStatus` resultante | Títulos gerados |
|--------------------|------------|----------------------------|-----------------|
| `A_VISTA` | **obrigatório**, somando o total | `APROVADO` | **nenhum** — quitada no balcão |
| `A_PRAZO` | ignorado | `PENDENTE` | `installments` títulos `RECEBER` em [Contas a receber](#contas-a-receber) |

Regras completas em [Pagamentos da venda](#pagamentos-da-venda).

Nas vendas a prazo, cada parcela vira uma linha com `description` `"Venda #<n> (i/N)"`, `dueDate`
= `firstDueDate + intervalDays × (i-1)`, `partnerId` = cliente da venda e `status` `ABERTO`.
O resto dos centavos vai **todo na última parcela**: R$ 100,00 em 3× gera 33,33 + 33,33 + **33,34**,
para o somatório fechar com o total da venda.

**Erros:**
- `400` Venda já finalizada
- `400` Não é possível finalizar uma venda cancelada
- `400` Estoque insuficiente para o produto `<nome>`
- `400` Informe as formas de pagamento para finalizar uma venda à vista
- `400` Os pagamentos devem somar o total da venda
- `400` O valor recebido em dinheiro não pode ser menor que o valor do pagamento
- `400` Abra um caixa para registrar vendas em dinheiro (só em `A_VISTA`)

---

### POST /sales/:id/cancel — Cancelar venda

> **Permissão:** `sales.cancel` (por padrão OWNER e ADMIN)

- Se a venda estava **CONCLUIDA**: estorna o estoque (movimentação `ENTRADA`) na mesma transação
- Se `paymentStatus` era `APROVADO`: passa a `ESTORNADO`
- Os títulos gerados pela venda passam a `CANCELADO`
- Os `payments` **permanecem registrados** — são histórico de caixa, não some nada
- Orçamento cancelado não mexe em estoque (nunca deu baixa)

**Erros:**
- `400` Venda já cancelada
- `400` Venda possui parcelas recebidas; estorne o financeiro antes

> O segundo erro é **proposital**: se alguma parcela já teve baixa, o cancelamento é bloqueado em vez
> de estornar sozinho — apagar um recebimento em silêncio perderia histórico de caixa. Cancele ou
> estorne os títulos primeiro, depois cancele a venda.

---

### DELETE /sales/:id — Excluir venda

> **Permissão:** `sales.delete` (por padrão OWNER e ADMIN) · **Resposta 204** sem corpo
> Só vendas em **ORCAMENTO** ou **CANCELADA**. Soft delete.

**Erros:** `400` Apenas vendas em ORCAMENTO ou CANCELADAS podem ser excluídas

---

## Contas a receber

Opera sobre `financial_entries` do tipo `RECEBER` e suas baixas em `financial_payments`. Os títulos
chegam aqui por dois caminhos: **automático** (finalização de venda `A_PRAZO`) e **manual**
(`POST /receivables`).

### Status do título

| Status | Significado |
|--------|-------------|
| `ABERTO` | Nenhuma baixa registrada |
| `PARCIAL` | Recebido em parte (`0 < paidAmount < amount`) |
| `PAGO` | Quitado (`paidAmount >= amount`) |
| `CANCELADO` | Cancelado manualmente ou pelo cancelamento da venda |

**`VENCIDO` não é gravado** — é derivado na leitura. Todo título traz `isOverdue: boolean`, verdadeiro
quando `dueDate` já passou e o status é `ABERTO` ou `PARCIAL`. Não há job noturno: gravar o status
exigiria um e deixaria a tabela mentindo entre duas execuções.

---

### GET /receivables — Listar títulos

> **Permissão:** `receivables.list`

**Query params:** `page`, `limit`, `status`, `customerId`, `saleId`, `overdue`, `startDate`, `endDate`

- `startDate` / `endDate` filtram por **vencimento**
- `overdue=true` aplica o mesmo critério do `isOverdue` no banco (vencimento passado + status em aberto),
  para a paginação bater com o que a tela mostra
- Ordenado por `dueDate` crescente — o mais urgente primeiro
- Cada item traz `partner` (cliente) e `sale` (venda de origem, quando houver)

---

### GET /receivables/:id — Detalhar título

> **Permissão:** `receivables.read` · retorna o título, o cliente, a venda de origem e a lista de `payments`.

---

### POST /receivables — Criar título manual

> **Permissão:** `receivables.create`

**Body:**
```json
{
  "customerId": "uuid (opcional)",
  "description": "string (obrigatório)",
  "totalAmount": "number > 0 (obrigatório)",
  "dueDate": "ISO8601 (obrigatório) — vencimento da 1ª parcela",
  "installments": "int >= 1 (opcional, default 1)",
  "intervalDays": "int >= 1 (opcional, default 30)",
  "category": "string (opcional) — agrupador para relatórios"
}
```

**Resposta 201:** um **array** com os títulos criados (uma linha por parcela).

- `totalAmount` é o valor **total**, dividido entre as parcelas; o resto dos centavos vai na última
- Com `installments > 1`, a `description` recebe o sufixo `(i/N)`
- **Erros:** `404` Cliente não encontrado

---

### POST /receivables/:id/pay — Registrar baixa

> **Permissão:** `receivables.pay`

**Body:**
```json
{
  "amount": "number > 0 (obrigatório)",
  "paidAt": "ISO8601 (opcional, default agora)",
  "method": "DINHEIRO | CARTAO_CREDITO | CARTAO_DEBITO | PIX | BOLETO | OUTRO (opcional)",
  "notes": "string (opcional)"
}
```

Em transação: cria o `FinancialPayment`, soma em `paidAmount` e recalcula o status
(`PAGO` se quitou, senão `PARCIAL`). **Baixa parcial é suportada** — basta chamar de novo com o resto.

**Erros:**
- `400` Valor excede o saldo do título (saldo: `<valor>`)
- `400` Não é possível baixar um título cancelado
- `400` Título já quitado

---

### POST /receivables/:id/cancel — Cancelar título

> **Permissão:** `receivables.cancel` (por padrão OWNER e ADMIN)

**Erros:**
- `400` Título já cancelado
- `400` Não é possível cancelar um título já quitado

---

## Contas a pagar

Espelho de contas a receber sobre as **mesmas tabelas**: `financial_entries` do tipo `PAGAR` e suas
baixas em `financial_payments`. Os títulos chegam por dois caminhos: **automático** (confirmação de
compra `A_PRAZO`) e **manual** (`POST /payables`).

Os status, o cálculo de `isOverdue` e as regras de baixa são **idênticos aos de contas a receber** —
inclusive as mensagens de erro. O que muda é o tipo do título, o vínculo (`purchase` em vez de `sale`,
fornecedor em vez de cliente) e o conjunto de permissões.

### Status do título

| Status | Significado |
|--------|-------------|
| `ABERTO` | Nenhuma baixa registrada |
| `PARCIAL` | Pago em parte (`0 < paidAmount < amount`) |
| `PAGO` | Quitado (`paidAmount >= amount`) |
| `CANCELADO` | Cancelado manualmente ou pelo cancelamento da compra |

**`VENCIDO` não é gravado** — vale aqui a mesma regra de contas a receber: `isOverdue` é derivado na
leitura, sem job noturno.

---

### GET /payables — Listar títulos

> **Permissão:** `payables.list`

**Query params:** `page`, `limit`, `status`, `supplierId`, `purchaseId`, `overdue`, `startDate`, `endDate`

- `startDate` / `endDate` filtram por **vencimento**
- `overdue=true` aplica o mesmo critério do `isOverdue` no banco, para a paginação bater com a tela
- Ordenado por `dueDate` crescente — o mais urgente primeiro
- Cada item traz `partner` (fornecedor) e `purchase` (compra de origem, quando houver)

**Resposta 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "PAGAR",
      "status": "ABERTO",
      "description": "Compra #7 (1/3)",
      "amount": "33.33",
      "paidAmount": "0",
      "dueDate": "2026-09-10T00:00:00.000Z",
      "installmentNumber": 1,
      "installmentTotal": 3,
      "isOverdue": false,
      "partner": { "id": "uuid", "name": "Distribuidora XYZ" },
      "purchase": { "id": "uuid", "purchaseNumber": 7 }
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

> Os valores monetários vêm como **string** (`Decimal` do Prisma) e **sem zeros à direita** — `"33.3"`,
> não `"33.30"`. Formate na exibição.

---

### GET /payables/:id — Detalhar título

> **Permissão:** `payables.read` · retorna o título, o fornecedor, a compra de origem e a lista de `payments`.

**Erros:** `404` Conta a pagar não encontrada

---

### POST /payables — Criar título manual

> **Permissão:** `payables.create`

**Body:**
```json
{
  "supplierId": "uuid (opcional)",
  "description": "string (obrigatório)",
  "totalAmount": "number > 0 (obrigatório)",
  "dueDate": "ISO8601 (obrigatório) — vencimento da 1ª parcela",
  "installments": "int >= 1 (opcional, default 1)",
  "intervalDays": "int >= 1 (opcional, default 30)",
  "category": "string (opcional) — agrupador para relatórios"
}
```

**Resposta 201:** um **array** com os títulos criados (uma linha por parcela).

- `totalAmount` é o valor **total**, dividido entre as parcelas; o resto dos centavos vai na última
- Com `installments > 1`, a `description` recebe o sufixo `(i/N)`
- É por aqui que entram as despesas sem compra: aluguel, energia, salários
- **Erros:** `404` Fornecedor não encontrado

---

### POST /payables/:id/pay — Registrar baixa

> **Permissão:** `payables.pay`

**Body:**
```json
{
  "amount": "number > 0 (obrigatório)",
  "paidAt": "ISO8601 (opcional, default agora)",
  "method": "DINHEIRO | CARTAO_CREDITO | CARTAO_DEBITO | PIX | BOLETO | OUTRO (opcional)",
  "notes": "string (opcional)"
}
```

Em transação: cria o `FinancialPayment`, soma em `paidAmount` e recalcula o status
(`PAGO` se quitou, senão `PARCIAL`). **Baixa parcial é suportada** — basta chamar de novo com o resto.

**Erros:**
- `400` Valor excede o saldo do título (saldo: `<valor>`)
- `400` Não é possível baixar um título cancelado
- `400` Título já quitado

---

### POST /payables/:id/cancel — Cancelar título

> **Permissão:** `payables.cancel` (por padrão OWNER e ADMIN) · sem corpo

**Erros:**
- `400` Título já cancelado
- `400` Não é possível cancelar um título já quitado

---

## Caixa

Dois cadastros e um turno:

- **Terminal** (`/cash-registers`) — a gaveta física, cadastrada uma vez por estabelecimento
- **Sessão** (`/cash-sessions`) — o turno de um operador naquele terminal, da abertura ao fechamento

Enquanto a sessão está `ABERTA` ela recolhe as vendas do operador, as sangrias e os suprimentos.
No fechamento o operador conta o dinheiro e o backend confronta com o esperado.

**A conferência é só de dinheiro.** Cartão e PIX aparecem no resumo como informação, mas não entram
no valor esperado em gaveta — esse dinheiro nunca passou por ela.

**Vender à vista exige caixa aberto.** Ver [Bloqueio da venda](#bloqueio-da-venda).

---

### GET /cash-registers — Listar terminais

> **Permissão:** `cash-registers.list`

**Query params:** `establishmentId`, `isActive`

Ordenado por `name`. Cada item traz `establishment { id, name }`. **Não é paginado** — a lista de
terminais de uma empresa é curta por natureza.

---

### POST /cash-registers — Cadastrar terminal

> **Permissão:** `cash-registers.create`

**Body:**
```json
{
  "establishmentId": "uuid (obrigatório)",
  "name": "string (obrigatório) — ex: Caixa 01",
  "isActive": "boolean (opcional, default true)"
}
```

**Erros:**
- `404` Estabelecimento não encontrado
- `409` Nome já usado por outro terminal do mesmo estabelecimento

---

### GET /cash-registers/:id · PATCH /cash-registers/:id · DELETE /cash-registers/:id

> **Permissões:** `cash-registers.read`, `cash-registers.edit`, `cash-registers.delete`

O `PATCH` aceita `name` e `isActive`. O `DELETE` é soft delete e devolve `204`.

**Erros:**
- `404` Caixa não encontrado
- `400` Não é possível desativar um caixa com sessão aberta
- `400` Não é possível excluir um caixa com sessão aberta

> Terminal inativo continua listado (com `isActive: false`) e não aceita nova abertura.

---

### POST /cash-sessions/open — Abrir o caixa

> **Permissão:** `cash.open`

**Body:**
```json
{
  "cashRegisterId": "uuid (obrigatório)",
  "openingAmount": "number >= 0 (obrigatório) — fundo de troco em gaveta"
}
```

O operador é sempre o usuário do token — não há como abrir caixa em nome de outro.

**Resposta 201:** a sessão criada com `summary` (ver [Resumo da sessão](#resumo-da-sessão)).

**Erros:**
- `404` Caixa não encontrado
- `400` Este caixa está inativo
- `400` Este caixa já tem uma sessão aberta
- `400` Você já tem um caixa aberto

> As duas últimas são regras distintas: um terminal aceita **um** turno por vez, e um operador só
> pode estar em **um** terminal por vez — senão ficaria ambíguo em qual gaveta a venda dele entra.

---

### GET /cash-sessions/current — Sessão aberta do operador

> **Permissão:** `cash.read`

Devolve a sessão `ABERTA` do usuário do token, com `movements[]` e `summary`, ou **`null`** quando não
há nenhuma. É o endpoint que o PDV consulta ao carregar a tela para saber se pode vender.

---

### GET /cash-sessions — Histórico de sessões

> **Permissão:** `cash.list`

**Query params:** `page`, `limit`, `status`, `cashRegisterId`, `startDate`, `endDate`

- `startDate` / `endDate` filtram pela **abertura** (`openedAt`)
- Ordenado por `openedAt` decrescente — o turno mais recente primeiro
- Cada item traz `cashRegister { id, name }` e `operator { id, name }`; **sem** `summary`

**Resposta 200:** `{ data, total, page, limit }`

---

### GET /cash-sessions/:id — Detalhar sessão

> **Permissão:** `cash.read`

**Resposta 200:**
```json
{
  "id": "uuid",
  "cashRegisterId": "uuid",
  "operatorId": "uuid",
  "status": "ABERTA | FECHADA",
  "openingAmount": "100.00",
  "openedAt": "ISO8601",
  "closedAt": "ISO8601 | null",
  "expectedCash": "220.00 | null",
  "countedCash": "210.00 | null",
  "difference": "-10.00 | null",
  "closingNotes": "string | null",
  "cashRegister": { "id": "uuid", "name": "Caixa 01" },
  "operator": { "id": "uuid", "name": "string" },
  "movements": [
    { "id": "uuid", "type": "SANGRIA", "amount": "30.00", "reason": "Depósito", "createdById": "uuid", "createdAt": "ISO8601" }
  ],
  "summary": {}
}
```

As colunas `expectedCash`, `countedCash`, `difference` e `closingNotes` só são gravadas no fechamento —
numa sessão aberta vêm `null`. Os números do turno em andamento estão em `summary`.

**Erros:** `404` Sessão de caixa não encontrada

---

### Resumo da sessão

O objeto `summary` acompanha `open`, `current`, `GET /cash-sessions/:id` e `close`:

| Campo | Significado |
|-------|-------------|
| `openingAmount` | Fundo de troco da abertura |
| `cashSales` | Soma dos pagamentos em `DINHEIRO` das vendas `CONCLUIDA` da sessão |
| `supplies` | Soma dos suprimentos |
| `withdrawals` | Soma das sangrias |
| `expectedCash` | `openingAmount + cashSales + supplies - withdrawals` |
| `countedCash` | Dinheiro contado no fechamento (`null` enquanto aberta) |
| `difference` | `countedCash - expectedCash` — negativo é falta, positivo é sobra |
| `salesCount` | Quantidade de vendas `CONCLUIDA` da sessão |
| `salesTotal` | Valor total dessas vendas, em qualquer forma de pagamento |
| `paymentBreakdown` | `[{ method, amount }]` por forma de pagamento, do maior para o menor |
| `creditTotal` | Total a prazo do turno (títulos a receber não cancelados das vendas da sessão) |
| `blind` | `true` quando o [fechamento às cegas](#fechamento-às-cegas) está escondendo números |

> `salesTotal` e `cashSales` respondem perguntas diferentes: o primeiro é quanto o operador vendeu, o
> segundo é quanto disso tem que estar na gaveta.

---

### POST /cash-sessions/:id/movements — Sangria e suprimento

> **Permissão:** `cash.movement`

**Body:**
```json
{
  "type": "SANGRIA | SUPRIMENTO (obrigatório)",
  "amount": "number > 0 (obrigatório)",
  "reason": "string (opcional) — ex: Depósito bancário"
}
```

`SANGRIA` tira dinheiro da gaveta (e **diminui** o esperado); `SUPRIMENTO` coloca (e **aumenta**).
O `amount` é sempre positivo — o sinal vem do `type`.

**Erros:**
- `404` Sessão de caixa não encontrada
- `400` Não é possível movimentar uma sessão fechada

---

### POST /cash-sessions/:id/close — Fechar o caixa

> **Permissão:** `cash.close`

**Body:**
```json
{
  "countedCash": "number >= 0 (obrigatório) — dinheiro contado na gaveta",
  "notes": "string (opcional; obrigatório quando há diferença)"
}
```

O backend calcula `expectedCash`, grava `countedCash` e a `difference`, e fecha a sessão.

**O caixa fecha sempre** — quebra é fato a registrar, não motivo para travar o turno. O que se exige é
a justificativa: diferença acima de **1 centavo** sem `notes` devolve `400`.

**Erros:**
- `404` Sessão de caixa não encontrada
- `400` Esta sessão já está fechada
- `400` Informe uma observação para a diferença de caixa

---

### Fechamento às cegas

Ligado por empresa em `PATCH /companies/:id` com `cashBlindClose: true`. Serve para o operador contar a
gaveta sem saber o alvo.

Com a política ligada e a sessão ainda **ABERTA**, o `summary` devolve `null` em `expectedCash`,
`cashSales`, `salesTotal`, `paymentBreakdown` e `creditTotal`, e `blind: true`. Continuam visíveis
`openingAmount`, `supplies`, `withdrawals` e `salesCount` — o operador já os conhece.

> Esconder só o `expectedCash` não serviria: o operador somaria abertura + dinheiro + suprimentos −
> sangrias e chegaria ao mesmo número. Por isso o bloqueio é do conjunto.

Depois do `close` a sessão devolve **tudo**, inclusive para quem fechou — a cegueira vale até a
contagem, não depois dela. Com `cashBlindClose: false` (padrão) nada é escondido em momento algum.

---

### Bloqueio da venda

Finalizar uma venda **`A_VISTA`** (`POST /sales { confirm: true }` ou `POST /sales/:id/confirm`) exige
que o operador tenha uma sessão aberta. Sem ela: `400` **"Abra um caixa para registrar vendas em dinheiro"**.

- Venda **`A_PRAZO`** não exige caixa — não entra dinheiro na gaveta, entra título a receber
- **Orçamento** (`POST /sales` sem `confirm`) não exige caixa
- Toda venda finalizada com sessão aberta é carimbada com `cashSessionId`, inclusive a prazo — é assim
  que o resumo consegue mostrar o `creditTotal` do turno
- Cancelar uma venda **não** a desvincula da sessão; ela sai do resumo porque deixa de ser `CONCLUIDA`

---

## Fiscal (NFC-e)

> Todos requerem empresa ativa. Detalhes de arquitetura e do contrato com o motor .NET em
> [FISCAL.md](./FISCAL.md).

A emissão é **assíncrona**: finalizar uma venda dispara o evento interno `sale.confirmed`, o
backend valida as pré-condições, reserva a numeração, cria o documento em `PENDENTE` e
enfileira. O frontend acompanha por `GET /fiscal/documents/sale/:saleId` ou pelo
`fiscalStatus` da venda.

**Configuração por ambiente.** Cada estabelecimento tem uma configuração de `HOMOLOGACAO` e
outra de `PRODUCAO`, com série, numeração, CSC e certificado próprios. A que está `ativo` é a
em uso — as rotas sem `?ambiente=` operam nela.

### Configuração fiscal

#### POST /fiscal/settings — Criar configuração de um ambiente

> **Permissão:** `fiscal.settings.edit`

**Body:**
```json
{
  "establishmentId": "uuid (obrigatório)",
  "ambiente": "HOMOLOGACAO | PRODUCAO (default: HOMOLOGACAO)",
  "serieNfce": "number 1-999 (default: 1)",
  "codigoCsc": "string 16-64 alfanuméricos (opcional)",
  "idCsc": "string 1-6 dígitos (opcional)"
}
```

A primeira configuração do estabelecimento já nasce em uso; as seguintes entram em uso pela
rota de ativação.

##### Formato do CSC e do idCSC

O par vem do portal da SEFAZ da UF, na área de credenciamento de NFC-e, e é **específico do
ambiente**: o par de homologação não vale em produção.

| Campo | Formato | Observação |
|---|---|---|
| `codigoCsc` | 16 a 64 caracteres alfanuméricos | O mínimo é 16, e não 32, porque o tamanho varia por UF — MG emite 32 hexadecimais, outras emitem 36. Travar em um tamanho recusaria o CSC legítimo das demais. |
| `idCsc` | 1 a 6 dígitos | É o `cIdToken` do QR Code, que ocupa 6 posições com zeros à esquerda. |

O CSC **nunca** é devolvido em log, mensagem de erro ou evento de auditoria.

Um CSC fora do formato não falha de maneira legível mais adiante: ele produz um QR Code com
hash inválido e volta da SEFAZ como **rejeição 464**, já com a numeração da nota consumida e
com uma mensagem que não menciona o CSC. Por isso o formato é conferido no cadastro **e** como
pré-condição de emissão.

**Erros:** `400` Já existe configuração desse ambiente · `400` CSC ou idCSC fora do formato ·
`404` Estabelecimento não encontrado

---

#### GET /fiscal/settings — Listar as configurações da empresa

> **Permissão:** `fiscal.settings.read`

---

#### GET /fiscal/settings/:establishmentId — Configuração em uso

> **Permissão:** `fiscal.settings.read`

---

#### GET /fiscal/settings/:establishmentId/ambientes — Uma linha por ambiente

> **Permissão:** `fiscal.settings.read`

Devolve as configurações de homologação e de produção, com `ativo` marcando a em uso.

---

#### PATCH /fiscal/settings/:establishmentId — Atualizar a configuração em uso

> **Permissão:** `fiscal.settings.edit`

**Body:** `serieNfce`, `proximoNumeroNfce`, `codigoCsc`, `idCsc`, `ativo`

`codigoCsc` e `idCsc` seguem o mesmo formato do POST (ver acima) e são recusados com `400`
quando fora dele.

Trocar `ambiente` por aqui é recusado com `400` — use a rota de ativação. Alterações de série
e de CSC ficam registradas na auditoria.

**Erros:** `400` CSC ou idCSC fora do formato · `400` Troca de ambiente

---

#### POST /fiscal/settings/:establishmentId/ambientes/:ambiente/ativar — Trocar de ambiente

> **Permissão:** `fiscal.settings.edit`

**Erros:** `400` Produção ainda não liberada · `404` Configuração daquele ambiente não existe

---

#### GET /fiscal/settings/:establishmentId/history — Auditoria da configuração

> **Permissão:** `fiscal.settings.read`

Trocas de série, de CSC, de ambiente e liberação/revogação de produção. O valor do CSC nunca
é gravado — só o idCSC.

---

### Certificado digital A1

#### POST /fiscal/settings/:establishmentId/certificate — Enviar ou substituir

> **Permissão:** `fiscal.settings.edit` · **`multipart/form-data`**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `certificado` | file | Arquivo `.pfx`/`.p12`, até 512 KB |
| `senha` | string | Senha do certificado |

**Query param opcional:** `ambiente` — envia o certificado para a configuração daquele
ambiente. É como se prepara a produção sem sair da homologação.

**Resposta 201:**
```json
{
  "configurado": true,
  "titular": "EMPRESA TESTE LTDA:11222333000181",
  "subject": "CN=...",
  "validoAte": "2027-08-04T12:00:00.000Z",
  "diasParaVencer": 365,
  "vencido": false
}
```

O arquivo e a senha ficam cifrados (AES-256-GCM) e **nunca** voltam em resposta nem em log.

**Erros:** `400` Arquivo inválido, senha incorreta, certificado vencido ou cofre não configurado

---

#### GET /fiscal/settings/:establishmentId/certificate — Situação do certificado

> **Permissão:** `fiscal.settings.read` · aceita `?ambiente=`

Use `diasParaVencer` para alertar o usuário a partir de 30 dias.

---

#### GET /fiscal/settings/:establishmentId/certificate/history — Auditoria do certificado

> **Permissão:** `fiscal.settings.read` · aceita `?ambiente=`

---

#### POST /fiscal/settings/:establishmentId/sefaz-status — Testar comunicação com a SEFAZ

> **Permissão:** `fiscal.settings.read`

**Resposta 201:** `{ "disponivel": true, "mensagem": "Serviço em Operação", "tempoMedioResposta": 1 }`

---

#### GET /fiscal/engine/health — Motor fiscal está no ar?

> **Permissão:** `fiscal.settings.read`

Sonda o microserviço, sem certificado e sem SEFAZ. Nunca falha: motor fora do ar responde
`{ "disponivel": false, "mensagem": "...", "latenciaMs": 5000 }`.

---

### Ativação da produção

#### GET /fiscal/settings/:establishmentId/producao/checklist

> **Permissão:** `fiscal.settings.read`

**Resposta 200:**
```json
{
  "liberada": false,
  "liberadaEm": null,
  "itens": [
    { "item": "Certificado digital A1 enviado", "ok": true, "detalhe": "04/08/2027" },
    { "item": "Certificado dentro da validade", "ok": true },
    { "item": "CSC e ID do CSC de produção configurados", "ok": false, "detalhe": "..." },
    { "item": "Série entre 1 e 999", "ok": true, "detalhe": "série atual: 1" },
    { "item": "Próximo número entre 1 e 999999999", "ok": true, "detalhe": "próximo número: 1" }
  ]
}
```

---

#### POST /fiscal/settings/:establishmentId/producao/liberar

> **Permissão:** `fiscal.settings.edit`

**Erros:** `400` com a lista do que falta · `404` Configuração de produção não existe

---

#### POST /fiscal/settings/:establishmentId/producao/revogar

> **Permissão:** `fiscal.settings.edit`

Revoga a liberação e devolve o estabelecimento à homologação.

---

### Documentos fiscais

#### GET /fiscal/documents — Listar

> **Permissão:** `fiscal.read`

**Query params:** `page`, `limit`, `status`, `modelo`, `saleId`, `establishmentId`,
`startDate`, `endDate`

---

#### GET /fiscal/documents/:id — Detalhar

> **Permissão:** `fiscal.read`

Traz o documento com `statusHistory`, `events`, `chaveAcesso`, `protocolo`, `qrCode`,
`rejeicaoCodigo`/`rejeicaoMensagem` e o `snapshot` da venda.

---

#### GET /fiscal/documents/sale/:saleId — Documento de uma venda

> **Permissão:** `fiscal.read` — é o endpoint de acompanhamento pós-venda

---

#### POST /fiscal/documents/nfce — Emitir manualmente

> **Permissão:** `fiscal.emit`

**Body:** `{ "saleId": "uuid", "establishmentId": "uuid (opcional)" }`

**Resposta 201:** o documento em `PENDENTE`, já enfileirado.

**Erros:** `400` Venda já possui documento ativo, configuração incompleta, produto sem dado
fiscal, certificado vencido ou produção não liberada — a mensagem lista todas as pendências
de uma vez

---

#### POST /fiscal/documents/nfe — Emitir NF-e modelo 55

> **Permissão:** `fiscal.nfe.emit` — separada da NFC-e: quem opera o caixa não
> necessariamente emite NF-e

**Recorte vigente (13/08/2026):** venda **interna** (mesma UF), **saída**,
finalidade **normal**, destinatário **pessoa jurídica**. Pessoa física continua
sendo atendida pela NFC-e.

```jsonc
{
  "saleId": "uuid",
  "establishmentId": "uuid",        // opcional; padrão: o da venda
  "consumidorFinal": false,          // obrigatório — ver abaixo
  "naturezaOperacao": "VENDA DE MERCADORIA",  // opcional
  "presenca": 1,                     // opcional; padrão 1 (presencial)

  "transporte": {                    // opcional; ausente = sem frete
    "modalidade": 0,                 // 0,1,2,3,4 ou 9
    "transportadora": { "cpfCnpj": "...", "nome": "...", "uf": "MG" },
    "veiculo": { "placa": "HAB1234", "uf": "MG", "rntc": "12345" },
    "volumes": [{ "quantidade": 3, "especie": "CAIXA", "pesoBruto": 13.2 }]
  },

  "cobranca": {                      // opcional; presente na venda a prazo
    "numeroFatura": "001",
    "valorLiquido": 100.00,
    "duplicatas": [
      { "numero": "001/1", "vencimento": "2026-09-13", "valor": 50.00 }
    ]
  }
}
```

**`consumidorFinal` não tem padrão de propósito.** Ele distingue venda para
revenda (`false`) de venda para consumo (`true`), e o mesmo produto muda
conforme o destino da mercadoria — quem sabe é quem lançou a venda, não o
sistema.

**Resposta 201:** o documento em `PENDENTE`, já enfileirado. Numeração e série
são as da NF-e, independentes das da NFC-e.

**Erros `400`** — todos antes de reservar numeração, e todos nomeando o campo:

| Situação | Mensagem |
|---|---|
| Venda sem cliente | "a NF-e exige destinatário identificado — informe o cliente na venda" |
| Cliente pessoa física | "o cliente … não é pessoa jurídica — a NF-e exige CNPJ; para pessoa física, emita NFC-e" |
| Cliente em outra UF | "operação interestadual está fora do escopo atual: emitente em MG, cliente em SP" |
| Sem `indIeDest` | "informe o indicador de inscrição estadual do cliente …" |
| Contribuinte sem IE | "o cliente … está declarado como contribuinte — informe a inscrição estadual dele" |
| Sem código IBGE | "informe o código IBGE (7 dígitos) do município do cliente" |
| Endereço incompleto | nomeia cada campo faltante de uma vez |

**O DANFE da NF-e é HTML, não PDF.** O layout retrato pronto depende de uma
biblioteca Windows-only e o motor roda em contêiner Linux; o arquivo é gravado
com extensão `.html` e servido com `text/html`. `GET /fiscal/documents/:id/danfe`
responde conforme o modelo do documento — não assuma PDF.

---

#### GET /fiscal/documents/:id/history — Histórico de status

> **Permissão:** `fiscal.read` — cada transição com motivo, usuário e data

---

#### GET /fiscal/documents/:id/events — Eventos do documento

> **Permissão:** `fiscal.read`

---

#### GET /fiscal/documents/:id/danfe — Baixar o DANFE

> **Permissão:** `fiscal.read`

**O formato varia por modelo:** NFC-e responde `application/pdf`, NF-e responde
`text/html; charset=utf-8`. O `Content-Disposition` acompanha, com `.pdf` ou
`.html`. **Não assuma PDF** — servir HTML declarando PDF entrega um arquivo que
o navegador se recusa a renderizar.

---

#### GET /fiscal/documents/:id/xml/:tipo — Baixar o XML

> **Permissão:** `fiscal.read` · `tipo`: `enviado`, `autorizado` ou `cancelamento`

---

#### GET /fiscal/documents/xml/export — Exportar os XMLs de um período

> **Permissão:** `fiscal.read` · responde `application/zip` em stream

Entrega o pacote que o contador usa para escriturar o período. É o mesmo XML do download
individual, em lote e com uma relação para conferência.

**Query**

| Campo | Obrigatório | Observação |
|---|---|---|
| `dataInicio` | ✅ | ISO 8601 (`2026-08-01`) |
| `dataFim` | ✅ | ISO 8601. **Sem hora, vale o dia inteiro** — `2026-08-31` inclui as notas do dia 31 |
| `establishmentId` | | UUID |
| `modelo` | | `NFE` ou `NFCE` |
| `ambiente` | | `PRODUCAO` (padrão) ou `HOMOLOGACAO` |

**O que entra no ZIP**

Somente documentos `AUTORIZADO` e `CANCELADO` — são os que existem para o fisco.
`REJEITADO`, `ERRO` e `PENDENTE` ficam de fora e não aparecem nem no manifesto.

```
xmls-<empresa>-2026-08-01-a-2026-08-31.zip
├── _relacao.csv
├── <chave>-nfe.xml
├── <chave>-cancelamento.xml     ← só para documentos CANCELADO
└── …
```

Documento cancelado leva **os dois** arquivos: sem o XML do evento, o contador escritura a
nota como se ela ainda valesse.

**Manifesto `_relacao.csv`** — CSV separado por `;`, com BOM e vírgula decimal (abre direto
no Excel em português). Colunas: chave de acesso, número, série, modelo, data de
autorização, status, valor total e **arquivos ausentes**. É por ele que se confere se veio
tudo.

XML que não volta do storage **não derruba a exportação**: o documento entra no manifesto
com a coluna de ausentes preenchida (`nfe`, `cancelamento`) e o restante do lote segue
normalmente, com `200`.

**Ambiente** — sem `ambiente`, exporta produção. Homologação exige pedido explícito e o
nome do arquivo sai marcado com `HOMOLOGACAO-SEM-VALOR-FISCAL`: o ZIP circula por e-mail
longe desta tela, e XML de teste escriturado como real é problema fiscal.

**Limites** — `400` acima de **92 dias** de período ou **5.000 documentos** por exportação,
com mensagem em PT-BR orientando a fatiar por estabelecimento ou por intervalo menor.

**Período vazio** devolve `200` com um ZIP contendo só o manifesto — não é erro.

---

### Consulta, cancelamento e rejeições

#### POST /fiscal/documents/:id/consulta — Consultar a situação na SEFAZ

> **Permissão:** `fiscal.read`

Reconcilia o status local. Resolve o caso de timeout com a nota autorizada do outro lado.

**Resposta 201:** `{ "situacao": "...", "protocolo": "...", "status": "AUTORIZADO", "atualizado": true }`

---

#### POST /fiscal/documents/:id/cancel — Cancelar

> **Permissão:** `fiscal.cancel`

**Body:** `{ "justificativa": "string de 15 a 255 caracteres" }`

**Erros:** `400` Documento não autorizado, já cancelado ou cancelamento recusado pela SEFAZ

---

#### POST /fiscal/documents/:id/retry — Reprocessar

> **Permissão:** `fiscal.emit`

Reenfileira mantendo série, número e documento — não duplica a nota. Aceita `ERRO`,
`REJEITADO` e `PENDENTE`.

---

> **`GET /fiscal/rejections` foi removido em 13/08/2026.** A central de rejeições
> era um filtro promovido a endpoint e a tela: `GET /fiscal/documents` já filtra
> por `status=REJEITADO` ou `ERRO`, e o reprocessamento sempre morou no detalhe
> do documento (`POST /fiscal/documents/:id/retry`). Manter as duas rotas
> significava dois lugares para a mesma lista divergirem.

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

### Contas a receber (`receivables`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `receivables.list` | Listar contas a receber | ✅ | ✅ | | `GET /receivables` |
| `receivables.create` | Criar conta a receber | ✅ | ✅ | | `POST /receivables` |
| `receivables.read` | Ler dados da conta a receber | ✅ | ✅ | | `GET /receivables/:id` |
| `receivables.pay` | Registrar baixa em conta a receber | ✅ | ✅ | | `POST /receivables/:id/pay` |
| `receivables.cancel` | Cancelar conta a receber | ✅ | ✅ | | `POST /receivables/:id/cancel` |

> Módulo novo, sem coluna 🔹: não havia padrão de MEMBER para herdar. Um perfil de financeiro costuma
> levar `list` + `read` + `pay`; `create` e `cancel` são os que mexem no que a empresa tem a receber.
> Vender **não** exige nada daqui — a venda a prazo gera os títulos sozinha, sob `sales.confirm`.

### Contas a pagar (`payables`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `payables.list` | Listar contas a pagar | ✅ | ✅ | | `GET /payables` |
| `payables.create` | Criar conta a pagar | ✅ | ✅ | | `POST /payables` |
| `payables.read` | Ler dados da conta a pagar | ✅ | ✅ | | `GET /payables/:id` |
| `payables.pay` | Registrar baixa em conta a pagar | ✅ | ✅ | | `POST /payables/:id/pay` |
| `payables.cancel` | Cancelar conta a pagar | ✅ | ✅ | | `POST /payables/:id/cancel` |

> Mesma lógica de contas a receber: sem coluna 🔹, e comprar **não** exige nada daqui — a compra a prazo
> gera os títulos sozinha, sob `purchases.confirm`. Vale separar quem lança despesa (`create`) de quem
> dá baixa (`pay`): são as duas pontas que costumam pedir alçadas diferentes.

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

### Fiscal (`fiscal`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `fiscal.read` | Ler documentos fiscais, XML e DANFE | ✅ | ✅ | 🔹 | `GET /fiscal/documents*`, `POST /fiscal/documents/:id/consulta` |
| `fiscal.emit` | Emitir e reprocessar NFC-e | ✅ | ✅ | 🔹 | `POST /fiscal/documents/nfce`, `POST /fiscal/documents/:id/retry` |
| `fiscal.cancel` | Cancelar documento autorizado | ✅ | ✅ | | `POST /fiscal/documents/:id/cancel` |
| `fiscal.nfe.emit` | Emitir NF-e modelo 55 | ✅ | ✅ | | `POST /fiscal/documents/nfe` |
| `fiscal.nfe.cancel` | Cancelar NF-e modelo 55 | ✅ | ✅ | | reservada — o cancelamento hoje passa por `fiscal.cancel` |
| `fiscal.settings.read` | Ler configuração fiscal, certificado e checklist | ✅ | ✅ | 🔹 | `GET /fiscal/settings*`, `GET /fiscal/engine/health` |
| `fiscal.settings.edit` | Editar configuração, certificado e ambientes | ✅ | ✅ | | `POST/PATCH /fiscal/settings*` |

### Vendas (`sales`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `sales.list` | Listar vendas | ✅ | ✅ | 🔹 | `GET /sales` |
| `sales.create` | Criar venda | ✅ | ✅ | 🔹 | `POST /sales`, `GET /sales/context` |
| `sales.read` | Ler dados da venda | ✅ | ✅ | 🔹 | `GET /sales/:id` |
| `sales.edit` | Editar venda | ✅ | ✅ | 🔹 | `PATCH /sales/:id` |
| `sales.confirm` | Confirmar venda | ✅ | ✅ | 🔹 | `POST /sales/:id/confirm` |
| `sales.cancel` | Cancelar venda | ✅ | ✅ | | `POST /sales/:id/cancel` |
| `sales.delete` | Deletar venda | ✅ | ✅ | | `DELETE /sales/:id` |

> Um perfil de **caixa** fecha com `sales.create` sozinho: ele já cobre `GET /sales/context` (montar a
> tela) e `POST /sales` com `confirm: true` (finalizar). Acrescente `sales.list` e `sales.read` se o
> vendedor precisar consultar vendas anteriores, e `sales.edit` + `sales.confirm` se ele trabalhar com
> orçamento antes de fechar. Cancelar e excluir ficam de fora de propósito — são as duas ações que
> desfazem movimento de estoque.

### Caixa — terminais (`cash-registers`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `cash-registers.list` | Listar caixas | ✅ | ✅ | | `GET /cash-registers` |
| `cash-registers.create` | Criar caixa | ✅ | ✅ | | `POST /cash-registers` |
| `cash-registers.read` | Ler dados do caixa | ✅ | ✅ | | `GET /cash-registers/:id` |
| `cash-registers.edit` | Editar caixa | ✅ | ✅ | | `PATCH /cash-registers/:id` |
| `cash-registers.delete` | Excluir caixa | ✅ | ✅ | | `DELETE /cash-registers/:id` |

### Caixa — operação (`cash`)

| Código | Descrição | OWNER | ADMIN | Perfil sugerido | Endpoint |
|--------|-----------|:-----:|:-----:|:---------------:|----------|
| `cash.open` | Abrir sessão de caixa | ✅ | ✅ | | `POST /cash-sessions/open` |
| `cash.close` | Fechar sessão de caixa | ✅ | ✅ | | `POST /cash-sessions/:id/close` |
| `cash.movement` | Registrar sangria ou suprimento | ✅ | ✅ | | `POST /cash-sessions/:id/movements` |
| `cash.list` | Listar sessões de caixa | ✅ | ✅ | | `GET /cash-sessions` |
| `cash.read` | Ler dados da sessão de caixa | ✅ | ✅ | | `GET /cash-sessions/current`, `GET /cash-sessions/:id` |

> Os dois domínios são separados de propósito: **cadastrar terminal** é tarefa de administração,
> **operar o turno** é tarefa de balcão. O perfil do operador leva `cash.open` + `cash.close` +
> `cash.movement` + `cash.read` e **nenhum** `cash-registers.*`; sem `cash.open` ele não consegue
> vender à vista, porque a venda exige caixa aberto. `cash.list` é de supervisão — dá acesso ao
> histórico de todos os operadores.

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
| 2 | `POST /sales` com `confirm: true` exige apenas `sales.create` — quem pode criar a venda pode finalizá-la pelo caminho do PDV, mesmo sem `sales.confirm`. | Médio — se quiser separar quem lança de quem finaliza, não conceda `sales.create` a esse perfil |
| 3 | Cancelar uma venda ou compra **a prazo** é bloqueado se alguma parcela já foi baixada. | Médio — estorne o título antes (`POST /receivables/:id/cancel` ou `/payables/:id/cancel`) e só então cancele o documento |
| 4 | Código de permissão inexistente devolve `404` em `PATCH /permissions/:role` e `422` nos perfis. | Baixo — tratar os dois status ao validar o formulário de permissões |
| 5 | **Finalizar venda `A_VISTA` passou a exigir `payments`.** Chamadas que antes funcionavam sem o campo agora recebem `400`. | **Alto** — o PDV precisa enviar as formas de pagamento em `POST /sales { confirm: true }` e em `POST /sales/:id/confirm` |
| 6 | Não existe pagamento misto à vista + a prazo (entrada). A venda é inteira `A_VISTA` ou inteira `A_PRAZO`. | Baixo — entra em entrega própria |
| 7 | **Finalizar venda `A_VISTA` passou a exigir caixa aberto.** Sem sessão do operador: `400` "Abra um caixa para registrar vendas em dinheiro". | **Alto** — o PDV precisa chamar `GET /cash-sessions/current` ao abrir a tela e oferecer a abertura de caixa antes de vender |
| 8 | Toda venda finalizada com sessão aberta recebe `cashSessionId`, inclusive a **a prazo**. | Baixo — é o que permite o `creditTotal` do turno; não significa que entrou dinheiro na gaveta |
| 9 | O histórico `GET /cash-sessions` não traz `summary` — só o detalhe traz. | Baixo — buscar `GET /cash-sessions/:id` para exibir os números de um turno |

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
| `SaleStatus` | `ORCAMENTO`, `EM_ABERTO`, `CONCLUIDA`, `CANCELADA` |
| `PaymentStatus` | `PENDENTE`, `APROVADO`, `RECUSADO`, `ESTORNADO` |
| `FiscalStatus` | `NAO_EMITIDO`, `PROCESSANDO`, `AUTORIZADO`, `REJEITADO`, `CANCELADO` |
| `PaymentMethod` | `DINHEIRO`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `PIX`, `BOLETO`, `OUTRO` |
| `PaymentCondition` | `A_VISTA`, `A_PRAZO` |
| `CashSessionStatus` | `ABERTA`, `FECHADA` |
| `CashMovementType` | `SANGRIA` (tira da gaveta), `SUPRIMENTO` (coloca) |
| `FinancialType` | `RECEBER` (`/receivables`), `PAGAR` (`/payables`) |
| `FinancialStatus` | `ABERTO`, `PARCIAL`, `PAGO`, `VENCIDO`, `CANCELADO` |
| `FiscalDocumentModel` | `NFE` (55), `NFCE` (65) — o MVP emite NFC-e |
| `FiscalEnvironment` | `HOMOLOGACAO`, `PRODUCAO` |
| `FiscalDocumentStatus` | `NAO_EMITIDO`, `PENDENTE`, `PROCESSANDO`, `AUTORIZADO`, `REJEITADO`, `ERRO`, `CONTINGENCIA`, `CANCELAMENTO_PENDENTE`, `CANCELADO`, `INUTILIZADO` |
| `TaxRegimeCode` (CRT) | `SIMPLES_NACIONAL` (1), `SIMPLES_EXCESSO` (2), `REGIME_NORMAL` (3), `SIMPLES_MEI` (4) |

> `FinancialStatus.VENCIDO` existe no enum mas **nunca é gravado** — o vencimento é derivado na
> leitura via `isOverdue`. Ver [Contas a receber](#contas-a-receber) e [Contas a pagar](#contas-a-pagar).

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

### 3.0. Abertura do caixa (antes de qualquer venda à vista)
```
GET  /cash-sessions/current  → null? é preciso abrir
GET  /cash-registers         → escolher o terminal
POST /cash-sessions/open     → { cashRegisterId, openingAmount } com o fundo de troco
```

### 3.1. Fluxo de venda — balcão (PDV, uma chamada)
```
POST /sales { confirm: true, payments: [{ method: "DINHEIRO", amount: 100, amountReceived: 150 }] }
                             → cria e finaliza (estoque diminui na hora, troco de 50 calculado)
```

### 3.2. Fluxo de venda — orçamento que vira venda
```
POST /sales                  → criar orçamento (não mexe no estoque, não exige payments)
PATCH /sales/:id             → ajustar itens/desconto enquanto negocia
POST /sales/:id/confirm { payments: [...] }
                             → finalizar (valida pagamentos, saldo e dá baixa no estoque)
POST /sales/:id/cancel       → cancelar (estorna o estoque se já estava CONCLUIDA)
```

### 3.3. Fluxo de venda a prazo → contas a receber
```
POST /sales { paymentCondition: "A_PRAZO", installments: 3, firstDueDate, confirm: true }
                             → venda CONCLUIDA, paymentStatus PENDENTE, 3 títulos ABERTO
GET  /receivables?overdue=true   → o que está vencido
POST /receivables/:id/pay        → baixa parcial ou total
```

### 3.4. Fluxo de compra a prazo → contas a pagar
```
POST /purchases { paymentCondition: "A_PRAZO", installments: 3, firstDueDate }
                             → compra em RASCUNHO com o plano de parcelas gravado
POST /purchases/:id/confirm  → estoque aumenta e nascem os 3 títulos ABERTO
GET  /payables?overdue=true      → o que está vencendo
POST /payables/:id/pay           → baixa parcial ou total
```

### 3.5. Despesa sem compra (aluguel, energia, salários)
```
POST /payables { description, totalAmount, dueDate, installments }
                             → títulos manuais, sem vínculo com compra
```

### 3.6. Fechamento do caixa
```
POST /cash-sessions/:id/movements → sangrias e suprimentos ao longo do turno
GET  /cash-sessions/:id           → resumo (esperado em gaveta, formas de pagamento, total a prazo)
POST /cash-sessions/:id/close     → { countedCash, notes } — notes obrigatório se houver diferença
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
