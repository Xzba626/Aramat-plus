# ActivityLog growth — index recommendations

Do **not** apply until journal queries slow down (typically 100k+ rows).

## Current indexes (schema)

```
@@index([createdAt])
@@index([userId, createdAt])
@@index([entityType, entityId])
@@index([companyId, createdAt])
```

## Recommended next (when needed)

Category tabs + period filters:

```prisma
@@index([companyId, action, createdAt])
```

Owner filters by actor:

```prisma
@@index([companyId, userId, createdAt])
```

Optional later (JSON store filter at scale):
- Consider promoting `storeId` to a typed column if store-filtered queries dominate.
- Until then `metadata.storeId` / `toStoreId` filters are acceptable for moderate volume.

## How to decide

Run `EXPLAIN ANALYZE` on:

```sql
SELECT * FROM "ActivityLog"
WHERE "companyId" = $1 AND action = ANY($2) AND "createdAt" >= $3
ORDER BY "createdAt" DESC
LIMIT 30;
```

If sequential scans dominate → add the composite indexes above via a dedicated migration.
