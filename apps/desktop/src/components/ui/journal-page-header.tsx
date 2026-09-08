import type { ComponentProps } from "react";
import { JournalAccountSelector } from "../../features/accounts/journal-account-selector";
import { PageHeader } from "./page-header";

export function JournalPageHeader({
  actions,
  ...props
}: ComponentProps<typeof PageHeader>) {
  return (
    <PageHeader
      {...props}
      context={<JournalAccountSelector />}
      actions={actions}
    />
  );
}
