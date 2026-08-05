-- Volume alone must not be unique: Classic 5ml and Premium 5ml are different SKUs.
-- Exact duplicate checks (name+volume+material+color+cost) run in application code.
DROP INDEX IF EXISTS "PackagingSku_companyId_volumeMl_material_color_key";

CREATE INDEX IF NOT EXISTS "PackagingSku_companyId_name_idx" ON "PackagingSku"("companyId", "name");
