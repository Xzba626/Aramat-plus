type Dict = Record<string, unknown>;

export function getByPath(obj: Dict, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`
  );
}

export function translate(
  dict: Dict,
  fallbackDict: Dict,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = getByPath(dict, key) ?? getByPath(fallbackDict, key) ?? key;
  return interpolate(raw, params);
}
