import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/commands";

export function useAccountJournal(accountId: string | null | undefined) {
  return useQuery({
    // Every journal mutation already invalidates bootstrap. Its account totals
    // share that prefix, so imports, restore, deletion and edits refresh them too.
    queryKey: ["bootstrap", "account-journal", accountId],
    queryFn: () => api.accountJournal(accountId!),
    enabled: Boolean(accountId),
  });
}

export function accountMoney(
  amount: number | null | undefined,
  currency: string,
) {
  return amount == null
    ? "—"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(
        amount / 100,
      );
}
