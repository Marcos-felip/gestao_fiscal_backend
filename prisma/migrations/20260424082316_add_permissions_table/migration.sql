-- CreateTable permissions
CREATE TABLE "permissions" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable role_permissions
CREATE TABLE "role_permissions" (
    "role" "MembershipRole" NOT NULL,
    "permission_code" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role", "permission_code"),
    CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "permissions" ("code") ON DELETE CASCADE
);

-- Insert permissions
INSERT INTO "permissions" ("code", "description") VALUES
-- Company permissions
('company.read', 'Ler dados da empresa'),
('company.edit', 'Editar dados da empresa'),

-- Users permissions
('users.list', 'Listar usuários'),
('users.create', 'Criar novo usuário'),
('users.read', 'Ler dados do usuário'),
('users.edit', 'Editar dados do usuário'),
('users.delete', 'Deletar usuário'),

-- Products permissions
('products.list', 'Listar produtos'),
('products.create', 'Criar produto'),
('products.read', 'Ler dados do produto'),
('products.edit', 'Editar produto'),
('products.delete', 'Deletar produto'),

-- Sales permissions
('sales.list', 'Listar vendas'),
('sales.create', 'Criar venda'),
('sales.read', 'Ler dados da venda'),
('sales.edit', 'Editar venda'),
('sales.confirm', 'Confirmar venda'),
('sales.cancel', 'Cancelar venda'),

-- Purchases permissions
('purchases.list', 'Listar compras'),
('purchases.create', 'Criar compra'),
('purchases.read', 'Ler dados da compra'),
('purchases.edit', 'Editar compra'),
('purchases.confirm', 'Confirmar compra'),
('purchases.cancel', 'Cancelar compra'),

-- Stock permissions
('stock.list', 'Listar movimentações de estoque'),
('stock.create', 'Criar movimentação de estoque'),
('stock.read', 'Ler dados da movimentação'),
('stock.edit', 'Editar movimentação'),
('stock.delete', 'Deletar movimentação'),

-- Partners permissions
('partners.list', 'Listar parceiros'),
('partners.create', 'Criar parceiro'),
('partners.read', 'Ler dados do parceiro'),
('partners.edit', 'Editar parceiro'),
('partners.delete', 'Deletar parceiro');

-- Insert OWNER permissions (all)
INSERT INTO "role_permissions" ("role", "permission_code")
SELECT 'OWNER', "code" FROM "permissions";

-- Insert ADMIN permissions
INSERT INTO "role_permissions" ("role", "permission_code")
SELECT 'ADMIN', "code" FROM "permissions"
WHERE "code" IN (
    'company.read', 'company.edit',
    'users.list', 'users.read', 'users.edit', 'users.delete',
    'products.list', 'products.create', 'products.read', 'products.edit', 'products.delete',
    'sales.list', 'sales.create', 'sales.read', 'sales.edit', 'sales.confirm', 'sales.cancel',
    'purchases.list', 'purchases.create', 'purchases.read', 'purchases.edit', 'purchases.confirm', 'purchases.cancel',
    'stock.list', 'stock.create', 'stock.read', 'stock.edit', 'stock.delete',
    'partners.list', 'partners.create', 'partners.read', 'partners.edit', 'partners.delete'
);

-- Insert MEMBER permissions
INSERT INTO "role_permissions" ("role", "permission_code")
SELECT 'MEMBER', "code" FROM "permissions"
WHERE "code" IN (
    'company.read',
    'users.list',
    'products.list', 'products.create', 'products.read', 'products.edit', 'products.delete',
    'sales.list', 'sales.create', 'sales.read', 'sales.edit', 'sales.confirm',
    'purchases.list', 'purchases.create', 'purchases.read', 'purchases.edit', 'purchases.confirm',
    'stock.list', 'stock.create', 'stock.read', 'stock.edit',
    'partners.list', 'partners.create', 'partners.read', 'partners.edit', 'partners.delete'
);
