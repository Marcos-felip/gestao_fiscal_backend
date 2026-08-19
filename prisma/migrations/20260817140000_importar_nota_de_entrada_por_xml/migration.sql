-- Importação de NF-e de entrada a partir do XML.
--
-- Motivação medida na base: 0 compras contra 49 movimentações de estoque, 34
-- sem documento nenhum. O módulo de compras existe e não é usado porque exige
-- redigitar o que o XML do fornecedor já traz pronto.

-- ──────────────────────────────────────────────
-- 1. Situação da importação e do casamento de cada item
-- ──────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "NfeImportStatus" AS ENUM ('PENDING', 'READY', 'IMPORTED', 'DISCARDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "NfeImportMatch" AS ENUM ('UNMATCHED', 'GTIN', 'SUPPLIER_CODE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────
-- 2. A importação
--
-- Tabela própria, e não um campo em `purchases`: a importação **pode não virar
-- compra**. Item sem casar, arquivo recusado, decisão adiada. Se o registro só
-- nascesse ao final, a importação interrompida sumiria e o usuário reimportaria
-- o arquivo só para descobrir o que faltava.
--
-- Nomes em inglês, como o resto do domínio: ficam em português só os termos
-- do leiaute fiscal (`chave_acesso`, `cfop`, `ncm`, `duplicatas`).
--
-- `chave_acesso` é única por empresa: importar o mesmo XML duas vezes dobraria
-- estoque e contas a pagar da mesma mercadoria, e o erro só apareceria no
-- inventário, meses depois. Por empresa, não global — a mesma nota pode ser
-- destinada a empresas diferentes da plataforma.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "nfe_imports" (
    "id"               TEXT NOT NULL,
    "company_id"       TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "supplier_id"      TEXT,
    "status"           "NfeImportStatus" NOT NULL DEFAULT 'PENDING',
    "chave_acesso"     TEXT NOT NULL,
    "number"           INTEGER NOT NULL,
    "series"           INTEGER NOT NULL,
    "issued_at"        TIMESTAMP(3) NOT NULL,
    "issuer_cnpj"      TEXT NOT NULL,
    "issuer_name"      TEXT NOT NULL,
    "total_amount"     DECIMAL(12,2) NOT NULL,
    "xml_key"          TEXT,
    "duplicatas"       JSONB,
    "reason"           TEXT,
    "purchase_id"      TEXT,
    "user_id"          TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    "deleted_at"       TIMESTAMP(3),

    CONSTRAINT "nfe_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nfe_imports_company_chave_key"
    ON "nfe_imports"("company_id", "chave_acesso");

CREATE UNIQUE INDEX IF NOT EXISTS "nfe_imports_purchase_id_key"
    ON "nfe_imports"("purchase_id");

CREATE INDEX IF NOT EXISTS "nfe_imports_company_id_idx" ON "nfe_imports"("company_id");
CREATE INDEX IF NOT EXISTS "nfe_imports_company_status_idx" ON "nfe_imports"("company_id", "status");

ALTER TABLE "nfe_imports"
    ADD CONSTRAINT "nfe_imports_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nfe_imports"
    ADD CONSTRAINT "nfe_imports_establishment_id_fkey"
    FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "nfe_imports"
    ADD CONSTRAINT "nfe_imports_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "nfe_imports"
    ADD CONSTRAINT "nfe_imports_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────
-- 3. Os itens lidos
--
-- Guardam o que veio no XML **e** o resultado do casamento. O que veio é
-- imutável: se o produto for editado depois, a nota continua dizendo o que o
-- fornecedor faturou.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "nfe_import_items" (
    "id"             TEXT NOT NULL,
    "nfe_import_id"  TEXT NOT NULL,
    "item_number"    INTEGER NOT NULL,
    "supplier_code"  TEXT NOT NULL,
    "gtin"           TEXT,
    "description"    TEXT NOT NULL,
    "ncm"            TEXT,
    "cfop"           TEXT,
    "unit"           TEXT NOT NULL,
    "quantity"       DECIMAL(12,4) NOT NULL,
    "unit_price"     DECIMAL(12,4) NOT NULL,
    "total_amount"   DECIMAL(12,2) NOT NULL,
    "product_id"     TEXT,
    "match"          "NfeImportMatch" NOT NULL DEFAULT 'UNMATCHED',

    CONSTRAINT "nfe_import_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "nfe_import_items_import_idx" ON "nfe_import_items"("nfe_import_id");

ALTER TABLE "nfe_import_items"
    ADD CONSTRAINT "nfe_import_items_import_fkey"
    FOREIGN KEY ("nfe_import_id") REFERENCES "nfe_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nfe_import_items"
    ADD CONSTRAINT "nfe_import_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────
-- 4. O de-para memorizado
--
-- A chave é (fornecedor, código), **nunca só o código**: o mesmo `cProd` em
-- fornecedores diferentes é produto diferente. Um índice único só no código
-- faria a nota de um fornecedor casar item com o produto de outro.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "partner_product_codes" (
    "id"         TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_product_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_product_codes_partner_code_key"
    ON "partner_product_codes"("partner_id", "code");

CREATE INDEX IF NOT EXISTS "partner_product_codes_company_id_idx"
    ON "partner_product_codes"("company_id");

ALTER TABLE "partner_product_codes"
    ADD CONSTRAINT "partner_product_codes_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "partner_product_codes"
    ADD CONSTRAINT "partner_product_codes_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "partner_product_codes"
    ADD CONSTRAINT "partner_product_codes_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────
-- 5. Permissão — os 3 passos
--
-- Catálogo, template e **backfill nas empresas existentes**. Sem o terceiro, o
-- endpoint responde 403 para todos menos OWNER, e ninguém entende por quê.
-- ──────────────────────────────────────────────

INSERT INTO "permissions" ("code", "description") VALUES
    ('purchases.import', 'Importar nota fiscal de entrada')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'purchases.import'),
    ('ADMIN', 'purchases.import')
ON CONFLICT ("role", "permission_code") DO NOTHING;

INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" = 'purchases.import'
ON CONFLICT DO NOTHING;
