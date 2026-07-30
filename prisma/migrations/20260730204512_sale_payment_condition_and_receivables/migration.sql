-- CreateEnum
CREATE TYPE "PaymentCondition" AS ENUM ('A_VISTA', 'A_PRAZO');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "first_due_date" TIMESTAMP(3),
ADD COLUMN     "installments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "interval_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "payment_condition" "PaymentCondition" NOT NULL DEFAULT 'A_VISTA';

-- ---------------------------------------------------------------------------
-- Permissões do módulo de contas a receber
-- ---------------------------------------------------------------------------

INSERT INTO "permissions" ("code", "description") VALUES
    ('receivables.list', 'Listar contas a receber'),
    ('receivables.create', 'Criar conta a receber'),
    ('receivables.read', 'Ler dados da conta a receber'),
    ('receivables.pay', 'Registrar baixa em conta a receber'),
    ('receivables.cancel', 'Cancelar conta a receber')
ON CONFLICT ("code") DO NOTHING;

-- Template padrão: OWNER e ADMIN recebem tudo
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'receivables.list'),
    ('OWNER', 'receivables.create'),
    ('OWNER', 'receivables.read'),
    ('OWNER', 'receivables.pay'),
    ('OWNER', 'receivables.cancel'),
    ('ADMIN', 'receivables.list'),
    ('ADMIN', 'receivables.create'),
    ('ADMIN', 'receivables.read'),
    ('ADMIN', 'receivables.pay'),
    ('ADMIN', 'receivables.cancel')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Backfill das empresas existentes. Sem isso o ADMIN toma 403 no módulo inteiro.
-- MEMBER fica de fora: o baseline dele é vazio desde 20260728150000 e todo o
-- acesso vem dos perfis de permissão.
INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" LIKE 'receivables.%'
  AND rp."role" <> 'MEMBER'
ON CONFLICT DO NOTHING;
