/**
 * M2 static checks — permission defaults + create role force rules (no HTTP).
 */
import {
  DEFAULT_MANAGER_GRANTS,
  NEVER_GRANTABLE_SET,
  GRANTABLE_KEY_SET,
} from "../src/lib/permissions/keys";

const defaults = DEFAULT_MANAGER_GRANTS as readonly string[];
console.log(
  "sellers.create default OFF",
  !defaults.includes("sellers.create") ? "PASS" : "FAIL"
);
console.log(
  "sellers.assign default OFF",
  !defaults.includes("sellers.assign") ? "PASS" : "FAIL"
);
console.log(
  "sellers.view default OFF",
  !defaults.includes("sellers.view") ? "PASS" : "FAIL"
);
console.log(
  "sellers.create grantable",
  GRANTABLE_KEY_SET.has("sellers.create") ? "PASS" : "FAIL"
);
console.log(
  "sellers.assign grantable",
  GRANTABLE_KEY_SET.has("sellers.assign") ? "PASS" : "FAIL"
);
console.log(
  "never still blocks finance.view",
  NEVER_GRANTABLE_SET.has("finance.view") ? "PASS" : "FAIL"
);
