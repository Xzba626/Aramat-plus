export type ContainerSourceStats = {
  /** WEIGHT lines that used a store bottle (stock deducted). */
  storeBottles: number;
  /** WEIGHT lines sold into the customer's own bottle. */
  customerBottles: number;
};

/**
 * Count bottle-source outcomes from sale items.
 * Legacy rows: packagingProductId without containerSource → store bottle.
 * FIFO may split a line into multiple SaleItems; bottle fields live on the first slice only.
 */
export function aggregateContainerSourceStats(
  sales: Array<{
    items: Array<{
      containerSource?: string | null;
      packagingProductId?: string | null;
    }>;
  }>
): ContainerSourceStats {
  let storeBottles = 0;
  let customerBottles = 0;

  for (const sale of sales) {
    for (const it of sale.items) {
      if (it.containerSource === "CUSTOMER_BOTTLE") {
        customerBottles += 1;
      } else if (
        it.containerSource === "STORE_BOTTLE" ||
        Boolean(it.packagingProductId)
      ) {
        storeBottles += 1;
      }
    }
  }

  return { storeBottles, customerBottles };
}
