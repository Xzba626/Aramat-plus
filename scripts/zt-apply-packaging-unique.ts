/**
 * @deprecated Volume+material+color uniqueness was removed (20260805140000).
 * Exact duplicates are enforced in packaging.service (name+volume+material+color+cost).
 * This script is kept only as historical reference — do not re-apply.
 */
console.error(
  "Obsolete: do not recreate PackagingSku_companyId_volumeMl_material_color_key. See migration 20260805140000_packaging_volume_not_unique."
);
process.exit(1);
