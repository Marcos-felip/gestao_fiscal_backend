-- Quadro tributário do item importado.
--
-- O grupo `imposto` de cada `det` do XML traz origem da mercadoria e a situação
-- tributária de ICMS, PIS e COFINS. O parser descartava tudo isso, e o usuário
-- acabava redigitando no cadastro do produto o que a nota já dizia.
--
-- **É ponto de partida, não verdade.** `origem` é propriedade da mercadoria e
-- transfere direto; a situação tributária é a da venda **do fornecedor**, sob o
-- regime dele — um emitente no Regime Normal manda CST 00 onde a nossa empresa
-- do Simples usaria CSOSN 102. Por isso os campos ficam no item da importação,
-- e não são copiados para `products` sem alguém conferir.

ALTER TABLE "nfe_import_items"
    ADD COLUMN IF NOT EXISTS "cest"          TEXT,
    ADD COLUMN IF NOT EXISTS "origem"        SMALLINT,
    ADD COLUMN IF NOT EXISTS "situacao_icms" TEXT,
    ADD COLUMN IF NOT EXISTS "cst_pis"       TEXT,
    ADD COLUMN IF NOT EXISTS "cst_cofins"    TEXT;
