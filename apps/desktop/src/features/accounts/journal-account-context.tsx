import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type { Account } from "../../types/domain";

export type JournalAccountStatus =
  "loading" | "noAccounts" | "selectionRequired" | "ready";

interface JournalAccountContextValue {
  status: JournalAccountStatus;
  accounts: Account[];
  selectedAccountId: string | null;
  selectedAccount: Account | null;
  selectAccount: (accountId: string | null) => void;
}

const JournalAccountContext = createContext<JournalAccountContextValue | null>(
  null,
);

export function JournalAccountProvider({ children }: { children: ReactNode }) {
  const selectedAccountId = useUiStore(
    (state) => state.selectedJournalAccountId,
  );
  const setSelectedAccountId = useUiStore(
    (state) => state.setSelectedJournalAccountId,
  );
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const accounts = (bootstrap.data?.accounts ?? []).filter(
    (account) => !account.isArchived,
  );
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? null;

  useEffect(() => {
    if (
      bootstrap.isSuccess &&
      selectedAccountId !== null &&
      selectedAccount === null
    ) {
      setSelectedAccountId(null);
    }
  }, [
    bootstrap.isSuccess,
    selectedAccount,
    selectedAccountId,
    setSelectedAccountId,
  ]);

  if (bootstrap.isError) throw bootstrap.error;

  const status: JournalAccountStatus = bootstrap.isPending
    ? "loading"
    : accounts.length === 0
      ? "noAccounts"
      : selectedAccount
        ? "ready"
        : "selectionRequired";

  const value: JournalAccountContextValue = {
    status,
    accounts,
    selectedAccountId,
    selectedAccount,
    selectAccount: (accountId) => {
      if (
        accountId === null ||
        accounts.some((account) => account.id === accountId)
      ) {
        setSelectedAccountId(accountId);
      }
    },
  };

  return (
    <JournalAccountContext.Provider value={value}>
      {children}
    </JournalAccountContext.Provider>
  );
}

export function useJournalAccount(): JournalAccountContextValue {
  const context = useContext(JournalAccountContext);
  if (!context) {
    throw new Error(
      "useJournalAccount muss innerhalb von JournalAccountProvider verwendet werden.",
    );
  }
  return context;
}
