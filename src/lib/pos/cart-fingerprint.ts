/** Shared cart fingerprint — client + server (no Prisma). */
export type CartFingerprintLine = {
  productId: string;
  quantity: number;
  salePrice: number;
};

export function cartFingerprint(items: CartFingerprintLine[]): string {
  return [...items]
    .map(
      (i) =>
        `${i.productId}:${Number(i.quantity)}:${Number(i.salePrice)}`
    )
    .sort()
    .join("|");
}

export function cartMatchesSnapshot(
  items: CartFingerprintLine[],
  snapshot: unknown
): boolean {
  if (!Array.isArray(snapshot)) return false;
  return (
    cartFingerprint(items) ===
    cartFingerprint(snapshot as CartFingerprintLine[])
  );
}

export function linesToFingerprintLines(
  lines: Array<{ productId: string; quantity: number; salePrice: number }>
): CartFingerprintLine[] {
  return lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    salePrice: l.salePrice,
  }));
}
