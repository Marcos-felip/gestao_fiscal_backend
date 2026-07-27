CREATE TABLE "company_role_permissions" (
    "company_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "permission_code" TEXT NOT NULL,

    CONSTRAINT "company_role_permissions_pkey" PRIMARY KEY ("company_id", "role", "permission_code")
);

CREATE INDEX "company_role_permissions_company_id_role_idx" ON "company_role_permissions"("company_id", "role");

ALTER TABLE "company_role_permissions" ADD CONSTRAINT "company_role_permissions_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_role_permissions" ADD CONSTRAINT "company_role_permissions_permission_code_fkey"
    FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("code", "description") VALUES
    ('purchases.delete', 'Deletar compra')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'purchases.delete'),
    ('ADMIN', 'purchases.delete')
ON CONFLICT ("role", "permission_code") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('ADMIN', 'users.create')
ON CONFLICT ("role", "permission_code") DO NOTHING;

INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
ON CONFLICT DO NOTHING;
