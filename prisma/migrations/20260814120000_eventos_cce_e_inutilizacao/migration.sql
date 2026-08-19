-- Carta de correção e inutilização de numeração.

-- ──────────────────────────────────────────────
-- 1. Carta de Correção Eletrônica
--
-- Tabela própria, e não uma linha em `fiscal_document_events`: a sequência
-- precisa de UNIQUE no banco. Conferir só no código deixaria a porta aberta
-- para duas correções concorrentes gravarem a mesma sequência — e a SEFAZ
-- recusaria a segunda depois, sem que ninguém entendesse por quê.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "fiscal_correction_letters" (
    "id"                 TEXT NOT NULL,
    "company_id"         TEXT NOT NULL,
    "fiscal_document_id" TEXT NOT NULL,
    "sequencia"          INTEGER NOT NULL,
    "correcao"           TEXT NOT NULL,
    "condicao_de_uso"    TEXT,
    "protocolo"          TEXT,
    "xml_evento"         TEXT,
    "usuario_id"         TEXT,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_correction_letters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_correction_letters_doc_seq_key"
    ON "fiscal_correction_letters"("fiscal_document_id", "sequencia");

CREATE INDEX IF NOT EXISTS "fiscal_correction_letters_company_id_idx"
    ON "fiscal_correction_letters"("company_id");

ALTER TABLE "fiscal_correction_letters"
    ADD CONSTRAINT "fiscal_correction_letters_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fiscal_correction_letters"
    ADD CONSTRAINT "fiscal_correction_letters_fiscal_document_id_fkey"
    FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────
-- 2. Inutilização de faixa
--
-- Sem `fiscal_document_id`: ela age sobre números que nunca viraram documento.
-- Por isso guarda série, modelo e faixa, e não uma chave de acesso.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "fiscal_inutilizations" (
    "id"               TEXT NOT NULL,
    "company_id"       TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "modelo"           "FiscalDocumentModel" NOT NULL,
    "ambiente"         "FiscalEnvironment" NOT NULL,
    "serie"            INTEGER NOT NULL,
    "numero_inicial"   INTEGER NOT NULL,
    "numero_final"     INTEGER NOT NULL,
    "ano"              INTEGER NOT NULL,
    "justificativa"    TEXT NOT NULL,
    "protocolo"        TEXT,
    "xml_inutilizacao" TEXT,
    "usuario_id"       TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_inutilizations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fiscal_inutilizations_company_id_idx"
    ON "fiscal_inutilizations"("company_id");

CREATE INDEX IF NOT EXISTS "fiscal_inutilizations_estab_modelo_serie_idx"
    ON "fiscal_inutilizations"("establishment_id", "modelo", "serie");

ALTER TABLE "fiscal_inutilizations"
    ADD CONSTRAINT "fiscal_inutilizations_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fiscal_inutilizations"
    ADD CONSTRAINT "fiscal_inutilizations_establishment_id_fkey"
    FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ──────────────────────────────────────────────
-- 3. Permissões — os três passos
--
-- Separadas de propósito: corrigir uma nota e inutilizar uma faixa de numeração
-- são atos de peso muito diferente.
-- ──────────────────────────────────────────────

INSERT INTO "permissions" ("code", "description") VALUES
    ('fiscal.cce', 'Emitir carta de correção'),
    ('fiscal.inutilizar', 'Inutilizar faixa de numeração')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_code") VALUES
    ('OWNER', 'fiscal.cce'),
    ('OWNER', 'fiscal.inutilizar'),
    ('ADMIN', 'fiscal.cce'),
    ('ADMIN', 'fiscal.inutilizar')
ON CONFLICT ("role", "permission_code") DO NOTHING;

INSERT INTO "company_role_permissions" ("company_id", "role", "permission_code")
SELECT c."id", rp."role", rp."permission_code"
FROM "companies" c
CROSS JOIN "role_permissions" rp
WHERE rp."permission_code" IN ('fiscal.cce', 'fiscal.inutilizar')
ON CONFLICT DO NOTHING;
