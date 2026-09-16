import type { ComponentProps } from "react";
import { PageHeader } from "./page-header";

export function JournalPageHeader({
  actions,
  ...props
}: ComponentProps<typeof PageHeader>) {
  return <PageHeader {...props} actions={actions} />;
}
