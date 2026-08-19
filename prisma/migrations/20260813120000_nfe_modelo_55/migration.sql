-- NF-e modelo 55: numeração própria, indicador de IE do destinatário e permissões.

-- ──────────────────────────────────────────────
-- 1. Série e numeração da NF-e
--
-- Independentes das da NFC-e: são sequências fiscais distintas, e misturá-las
-- produziria salto de numeração em ambos os modelos.
-- ──────────────────────────────────────────────

ALTER TABLE "fiscal_settings"
    ADD COLUMN IF NOT EXISTS "serie_nfe" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "proximo_numero_nfe" INTEGER NOT NULL DEFAULT 1;

-- ──────────────────────────────────────────────
-- 2. Indicador de IE do destinatário
--
-- Fica nulo de propósito: não há valor padrão correto. Pessoa jurídica não
-- implica contribuinte de ICMS — prestadora de serviço é PJ e não é
-- contribuinte. Quem declara é quem cadastra o parceiro, e emitir NF-e sem
-- este campo é recusado nomeando-o.
-- ──────────────────────────────────────────────

ALTER TABLE "partners"
    ADD COLUMN IF NOT EXISTS "ind_ie_dest" INTEGER;

-- Código IBGE do município do destinatário (`cMun`), obrigatório na NF-e e
-- inexistente até aqui: a NFC-e não leva endereço de destinatário.
ALTER TABLE "partners"
    ADD COLUMN IF NOT EXISTS "ibge_code" TEXT;

-- ──────────────────────────────────────────────
-- 3. Permissões — os três passos
--
-- Separadas das de NFC-e: quem opera o caixa não necessariamente emite NF-e.
-- ──────────────────────────────────────────────

-- 3.1 catálogo
INSERT INTO "permissions" ("code", "description") VALUES
    ('fiscal.nfe.emit', 'Emitir NF-e modelo 55'),
    ('fiscal.nfe.cancel', 'Cancelar NF-e modelo 55')
ON CONFLICT ("code") DO NOTHING;

-- 3.2 template por papel
INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'fiscal.nfe.emit'),
    ('OWNER', 'fiscal.nfe.cancel'),
    ('ADMIN', 'fiscal.nfe.emit'),
    ('ADMIN', 'fiscal.nfe.cancel')
ON CONFLICT ("role", "permission_code") DO NOTHING;

-- 3.3 backfill das empresas existentes — o passo que, esquecido, produz 403
-- inexplicável para todo mundo que não seja OWNER
INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" IN ('fiscal.nfe.emit', 'fiscal.nfe.cancel')
ON CONFLICT DO NOTHING;
