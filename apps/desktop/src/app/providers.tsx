import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { type ReactNode, useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { MyfxbookEvents } from "../features/accounts/myfxbook-events";
import { isPrivateWeb } from "../services/runtime-mode";
import { resetPrivateUiState } from "../stores/ui-store";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  useEffect(() => {
    if (!isPrivateWeb()) return;
    return () => {
      // Mutations retain their own transport receipt handling; cached personal
      // data and UI state must not survive a private workspace unmount.
      void queryClient.cancelQueries();
      queryClient.clear();
      resetPrivateUiState();
      toast.dismiss();
    };
  }, [queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <MyfxbookEvents />
      <Tooltip.Provider delayDuration={250}>{children}</Tooltip.Provider>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
