import { useCallback, useRef } from "react";

/** Controlled dialogs opened outside Dialog.Trigger need an explicit focus target. */
export function useDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const rememberFocus = useCallback(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, []);
  const restoreFocus = useCallback((event: Event) => {
    if (opener.current?.isConnected) {
      event.preventDefault();
      opener.current.focus();
    }
  }, []);
  return { rememberFocus, restoreFocus };
}
