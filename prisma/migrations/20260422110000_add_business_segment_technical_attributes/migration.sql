-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "BusinessSegment" AS ENUM (
    'ALUMINIO_PORTAS',
    'SUPERMERCADO',
    'PAPELARIA',
    'MERCEARIA',
    'LANCHONETE',
    'GENERICO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "business_segment" "BusinessSegment";

-- AlterTable
ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "technical_attributes" JSONB;
