-- Remover módulo de vendas
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_sale_id_fkey";
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_product_id_fkey";
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_company_id_fkey";
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_establishment_id_fkey";
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_client_id_fkey";
DROP TABLE IF EXISTS "sale_items";
DROP TABLE IF EXISTS "sales";
DROP TYPE IF EXISTS "SaleStatus";