import { WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/empty-state";
import { PageLoading } from "../../components/ui/loading";
import { useJournalAccount } from "./journal-account-context";

export function JournalAccountGate({ children }: { children: ReactNode }) {
  const { status } = useJournalAccount();

  if (status === "loading") return <PageLoading />;

  if (status === "noAccounts") {
    return (
      <EmptyState
        icon={WalletCards}
        title="Noch kein Tradingkonto"
        description="Lege zuerst ein Tradingkonto an, damit dein Journal eindeutig zugeordnet bleibt."
        action={
          <Link className="button primary" to="/settings?section=accounts">
            Tradingkonto anlegen
          </Link>
        }
      />
    );
  }

  if (status === "selectionRequired") {
    return (
      <EmptyState
        icon={WalletCards}
        title={"Tradingkonto ausw\u00e4hlen"}
        description={
          "W\u00e4hle ein aktives Tradingkonto aus, bevor du Journal-Daten verwendest."
        }
        action={
          <Link className="button primary" to="/settings?section=accounts">
            {"Tradingkonto ausw\u00e4hlen"}
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
