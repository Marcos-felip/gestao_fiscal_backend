-- Perfis de permissão: conjuntos nomeados de permissões, escopados por empresa,
-- vinculáveis a memberships de papel MEMBER.

CREATE TABLE "permission_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "permission_profiles_company_id_idx" ON "permission_profiles"("company_id");

CREATE UNIQUE INDEX "permission_profiles_company_id_name_key" ON "permission_profiles"("company_id", "name");

ALTER TABLE "permission_profiles" ADD CONSTRAINT "permission_profiles_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissões que compõem cada perfil
CREATE TABLE "permission_profile_permissions" (
    "profile_id" TEXT NOT NULL,
    "permission_code" TEXT NOT NULL,

    CONSTRAINT "permission_profile_permissions_pkey" PRIMARY KEY ("profile_id", "permission_code")
);

CREATE INDEX "permission_profile_permissions_permission_code_idx" ON "permission_profile_permissions"("permission_code");

ALTER TABLE "permission_profile_permissions" ADD CONSTRAINT "permission_profile_permissions_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "permission_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permission_profile_permissions" ADD CONSTRAINT "permission_profile_permissions_permission_code_fkey"
    FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vínculo N-N entre membership e perfil
CREATE TABLE "membership_profiles" (
    "membership_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,

    CONSTRAINT "membership_profiles_pkey" PRIMARY KEY ("membership_id", "profile_id")
);

CREATE INDEX "membership_profiles_profile_id_idx" ON "membership_profiles"("profile_id");

ALTER TABLE "membership_profiles" ADD CONSTRAINT "membership_profiles_membership_id_fkey"
    FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_profiles" ADD CONSTRAINT "membership_profiles_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "permission_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissão que controla a gestão de perfis
INSERT INTO "permissions" ("code", "description") VALUES
    ('permissions.manage', 'Gerenciar perfis de permissão')
ON CONFLICT ("code") DO NOTHING;

-- Template padrão: OWNER e ADMIN gerenciam perfis
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'permissions.manage'),
    ('ADMIN', 'permissions.manage')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- Backfill das empresas existentes, senão o endpoint retorna 403 para todos menos OWNER
INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" = 'permissions.manage'
ON CONFLICT DO NOTHING;
