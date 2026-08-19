-- Modelos que cada estabelecimento emite.
--
-- Sem este campo o checklist de producao nao distingue "nao configurou CSC" de
-- "nao emite NFC-e", e cobra de quem nao deve: CSC e consulta publica sao
-- exclusivos do modelo 65.

ALTER TABLE "fiscal_settings"
  ADD COLUMN "modelos_emitidos" "FiscalDocumentModel"[] DEFAULT ARRAY[]::"FiscalDocumentModel"[];

-- Backfill pelo que a configuracao ja revela:
--   - CSC preenchido  -> emite NFC-e
--   - documento de NF-e ja emitido -> emite NF-e
-- Na duvida, os dois: e o comportamento de hoje, e marcar de menos travaria a
-- liberacao de quem ja esta emitindo.
UPDATE "fiscal_settings" fs
SET "modelos_emitidos" = (
  SELECT ARRAY(
    SELECT m FROM unnest(ARRAY['NFCE', 'NFE']::"FiscalDocumentModel"[]) AS m
    WHERE
      (m = 'NFCE' AND (fs."codigo_csc" IS NOT NULL AND fs."id_csc" IS NOT NULL))
      OR (m = 'NFE' AND EXISTS (
        SELECT 1 FROM "fiscal_documents" fd
        WHERE fd."establishment_id" = fs."establishment_id"
          AND fd."modelo" = 'NFE'
          AND fd."deleted_at" IS NULL
      ))
  )
);

-- Configuracao que nao revelou nada continua emitindo os dois, como antes.
UPDATE "fiscal_settings"
SET "modelos_emitidos" = ARRAY['NFCE', 'NFE']::"FiscalDocumentModel"[]
WHERE cardinality("modelos_emitidos") = 0;
