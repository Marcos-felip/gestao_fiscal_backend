# Gestão Fiscal Backend

API backend do sistema SaaS de gestão fiscal e operacional para empresas brasileiras. Construído com NestJS, Prisma 7 e PostgreSQL, com suporte a multi-tenancy, controle de estoque, vendas e compras.

## Tecnologias

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| Node.js | 20+ | Runtime |
| NestJS | 10 | Framework backend |
| Prisma | 7 | ORM |
| PostgreSQL | 16 | Banco de dados |
| Passport / JWT | — | Autenticação |
| Docker | — | Ambiente de desenvolvimento |

## Pré-requisitos

- Node.js 20+
- npm 10+
- Docker e Docker Compose

## Como configurar e rodar

### 1. Clonar o repositório

```bash
git clone https://github.com/Marcos-felip/gestao_fiscal_backend.git
cd gestao_fiscal_backend
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com os valores corretos (veja a tabela abaixo).

### 3. Subir o banco de dados

```bash
docker compose up -d
```

Isso sobe o PostgreSQL na porta `5432` e o pgAdmin na porta `5050`.

### 4. Instalar dependências

```bash
npm install
```

### 5. Executar as migrations

```bash
npx prisma migrate dev
```

### 6. Iniciar o servidor em modo desenvolvimento

```bash
npm run start:dev
```

A API estará disponível em `http://localhost:3000/api/v1`.
A documentação Swagger estará em `http://localhost:3000/api/v1/docs`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `DATABASE_URL` | Sim | URL de conexão com o PostgreSQL | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | Sim | Segredo para assinar os access tokens | `meu-segredo-super-secreto` |
| `JWT_REFRESH_SECRET` | Sim | Segredo para assinar os refresh tokens | `outro-segredo-refresh` |
| `JWT_ACCESS_EXPIRATION` | Sim | Expiração do access token | `15m` |
| `JWT_REFRESH_EXPIRATION` | Sim | Expiração do refresh token | `7d` |
| `PORT` | Não | Porta do servidor (padrão: 3000) | `3000` |

## Como rodar os testes

```bash
# Testes unitários
npm test

# Testes com cobertura
npm run test:cov

# Testes de integração (e2e)
npm run test:e2e
```

## Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run start:dev` | Inicia em modo desenvolvimento com hot-reload |
| `npm run build` | Compila o projeto TypeScript |
| `npm run start:prod` | Inicia a versão compilada em produção |
| `npm test` | Executa os testes unitários com Jest |
| `npm run test:cov` | Testes unitários com relatório de cobertura |
| `npm run test:e2e` | Executa os testes de integração |
| `npx prisma migrate dev` | Cria e aplica novas migrations |
| `npx prisma generate` | Regenera o Prisma Client |
| `npx prisma studio` | Abre o Prisma Studio (interface visual do banco) |
| `docker compose up -d` | Sobe PostgreSQL e pgAdmin via Docker |

## Estrutura de pastas

```
src/
├── auth/              # Autenticação JWT (access + refresh token)
├── users/             # Perfil do usuário
├── companies/         # Empresas (tenant principal)
├── memberships/       # Vínculo usuário-empresa com papéis
├── establishments/    # Estabelecimentos (matriz e filiais)
├── products/          # Cadastro de produtos
├── partners/          # Clientes e fornecedores
├── stock/             # Movimentações de estoque
├── sales/             # Pedidos de venda
├── purchases/         # Pedidos de compra
├── prisma/            # Serviço global do Prisma ORM
└── common/            # Guards, decorators, filtros, validators
```

## Documentação da API

Acesse a documentação interativa (Swagger) em:
`http://localhost:3000/api/v1/docs`

Para mais detalhes sobre contratos de API, consulte o arquivo [API.md](./API.md) na raiz do projeto.

## Regras de negócio

Consulte o arquivo [REGRAS_DE_NEGOCIO.md](./REGRAS_DE_NEGOCIO.md) para entender as regras que regem o comportamento do sistema.

## Modelagem do banco de dados

Consulte o arquivo [BANCO_DE_DADOS.md](./BANCO_DE_DADOS.md) para a documentação completa da modelagem.

## pgAdmin

Acesse o pgAdmin em `http://localhost:5050` com:
- **E-mail:** admin@admin.com
- **Senha:** admin
