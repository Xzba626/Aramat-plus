-- Part 5: cart reserves have no TTL
ALTER TABLE "Reservation" ALTER COLUMN "expiresAt" DROP NOT NULL;
