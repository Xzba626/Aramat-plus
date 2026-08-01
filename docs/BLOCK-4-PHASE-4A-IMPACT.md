# Block 4 Phase 4a — Impact map (before schema)

Approved answers locked in: per-ml price · seed 5–100 glass · bottle not revenue · sealed-only bottle restore · exact volume match.

## Models touched

| Model | Change in 4a | Used by 4a UI | Later phase |
|-------|--------------|---------------|-------------|
| **PackagingSku** | **NEW** | Catalog CRUD | — |
| **Product** | `kind`, `packagingSkuId` | Ensure PIECE stock product per Sku | POS filter |
| **Company** | relation `packagingSkus` | — | — |
| **Batch** | none | Receive via existing `addBatch` on packaging Product | — |
| **StockBalance** | none | Shown on packaging list | — |
| **Sale** | none | — | 4b |
| **SaleItem** | `isDecant`, `packagingProductId`, `packagingQuantity`, `packagingCostPerUnit` | Schema only (nullable) | 4b dual FIFO |
| **SaleReturnItem** | `packagingReturned` | Schema only | 4d sealed restore |
| **Transfer / TransferItem** | none | Works automatically (Product) | — |
| **COGS / Profit services** | none in 4a | — | 4b read packaging cost |
| **Analytics** | none in 4a | — | 4c |
| **Revision** | none in 4a | Counts packaging Products already | 4d UI split |
| **Export** | none | — | optional later |
| **stock.service** | **NOT MODIFIED** | called as-is for receive | 4b call twice |

## Broken-chain risk check

| Chain link | 4a status |
|------------|-----------|
| PackagingSku → Product(PACKAGING) | created together |
| Product → Batch → StockBalance | existing receive API |
| UI catalog sees stock | yes |
| UI receive bottles | yes (receive tab) |
| Sale dual FIFO | **not yet** (4b) — fields ready, unused |
| Analytics ml | **not yet** (4c) |

4a exit: owner can create Skus, see stock, receive bottles into warehouse. No POS yet.
