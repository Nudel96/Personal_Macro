import { Component, type ReactNode } from "react";

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    // Intentionally do not serialize client errors or user data.
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-fatal-error">
          <h1>Personal Macro konnte nicht geladen werden.</h1>
          <p>
            Bitte starte die App erneut. Falls der Fehler bleibt, starte sie
            über START-MACROTOOL.cmd und prüfe die angezeigte Fehlermeldung.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
