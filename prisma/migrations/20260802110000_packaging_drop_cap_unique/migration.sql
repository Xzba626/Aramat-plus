-- Part 3: drop cap from PackagingSku uniqueness (cap field removed from product UI)
DROP INDEX IF EXISTS "PackagingSku_companyId_volumeMl_material_color_cap_key";

-- Normalize any historical rows that differed only by cap
UPDATE "PackagingSku" SET "cap" = '';

CREATE UNIQUE INDEX "PackagingSku_companyId_volumeMl_material_color_key"
  ON "PackagingSku"("companyId", "volumeMl", "material", "color");
