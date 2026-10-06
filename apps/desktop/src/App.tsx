import { lazy, Suspense } from "react";
import { AppErrorBoundary } from "./components/ui/app-error-boundary";
import { PrivateWebBoundary } from "./app/private-web-boundary";
import { PRIVATE_WORKSPACE_COMMANDS } from "./app/workspace-capabilities";
import { isPrivateWeb } from "./services/runtime-mode";

// Import providers and workspace state only after a validated private session.
const WorkspaceApp = lazy(() => import("./workspace-app"));

export default function App() {
  const workspace = (
    <Suspense fallback={<p role="status">Personal Macro wird geladen …</p>}>
      <WorkspaceApp />
    </Suspense>
  );
  return (
    <AppErrorBoundary>
      {isPrivateWeb() ? (
        <PrivateWebBoundary requiredCommands={PRIVATE_WORKSPACE_COMMANDS}>
          {workspace}
        </PrivateWebBoundary>
      ) : (
        workspace
      )}
    </AppErrorBoundary>
  );
}
