/** IndexedDB / localStorage key for POS cart namespace (seller + store). */
export function posCartStorageKey(sellerId: string, storeId: string) {
  return `aramat-pos-cart-v1:${sellerId}:${storeId}`;
}
