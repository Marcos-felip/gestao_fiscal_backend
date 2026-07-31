-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "first_due_date" TIMESTAMP(3),
ADD COLUMN     "installments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "interval_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "payment_condition" "PaymentCondition" NOT NULL DEFAULT 'A_VISTA';

-- ---------------------------------------------------------------------------
-- Permissões do módulo de contas a pagar
-- ---------------------------------------------------------------------------

INSERT INTO "permissions" ("code", "description") VALUES
    ('payables.list', 'Listar contas a pagar'),
    ('payables.create', 'Criar conta a pagar'),
    ('payables.read', 'Ler dados da conta a pagar'),
    ('payables.pay', 'Registrar baixa em conta a pagar'),
    ('payables.cancel', 'Cancelar conta a pagar')
ON CONFLICT ("code") DO NOTHING;

-- Template padrão: OWNER e ADMIN recebem tudo
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'payables.list'),
    ('OWNER', 'payables.create'),
    ('OWNER', 'payables.read'),
    ('OWNER', 'payables.pay'),
    ('OWNER', 'payables.cancel'),
    ('ADMIN', 'payables.list'),
    ('ADMIN', 'payables.create'),
    ('ADMIN', 'payables.read'),
    ('ADMIN', 'payables.pay'),
    ('ADMIN', 'payables.cancel')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Backfill das empresas existentes. Sem isso o ADMIN toma 403 no módulo inteiro.
-- MEMBER fica de fora: o baseline dele é vazio desde 20260728150000 e todo o
-- acesso vem dos perfis de permissão.
INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" LIKE 'payables.%'
  AND rp."role" <> 'MEMBER'
ON CONFLICT DO NOTHING;
