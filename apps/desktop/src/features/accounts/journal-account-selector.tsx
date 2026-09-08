import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useJournalAccount } from "./journal-account-context";

const managementValueBase = "__journal-account-management__";

export function JournalAccountSelector() {
  const { accounts, selectedAccountId, selectAccount, status } =
    useJournalAccount();
  const navigate = useNavigate();
  const disabled = status === "loading" || status === "noAccounts";
  const value = selectedAccountId ?? "";
  let managementValue = managementValueBase;
  while (accounts.some((account) => account.id === managementValue)) {
    managementValue = `${managementValue}_`;
  }

  return (
    <Select.Root
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === managementValue) {
          navigate("/settings?section=accounts");
          return;
        }
        selectAccount(nextValue);
      }}
      disabled={disabled}
    >
      <Select.Trigger
        className="journal-account-selector"
        aria-label="Tradingkonto"
      >
        <WalletCards size={15} aria-hidden="true" />
        <span className="journal-account-selector-label">Tradingkonto</span>
        {status === "noAccounts" ? (
          <span>Kein Tradingkonto</span>
        ) : (
          <Select.Value placeholder={"Tradingkonto ausw\u00e4hlen"} />
        )}
        <Select.Icon className="journal-account-selector-chevron">
          <ChevronDown size={14} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="journal-account-selector-content"
          position="popper"
        >
          <Select.Viewport>
            {accounts.map((account) => (
              <Select.Item
                className="journal-account-selector-item"
                key={account.id}
                value={account.id}
              >
                <Select.ItemText>{account.name}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={14} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
            <Select.Separator className="journal-account-selector-separator" />
            <Select.Item
              className="journal-account-selector-manage"
              value={managementValue}
            >
              <Select.ItemText>Konten verwalten</Select.ItemText>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
