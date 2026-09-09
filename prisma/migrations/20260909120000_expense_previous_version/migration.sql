-- Links a rate-change split back to the expense row it replaced, so history stays traceable and non-overlapping.
ALTER TABLE "Expense" ADD COLUMN "previousExpenseId" TEXT;

CREATE UNIQUE INDEX "Expense_previousExpenseId_key" ON "Expense"("previousExpenseId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_previousExpenseId_fkey" FOREIGN KEY ("previousExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
