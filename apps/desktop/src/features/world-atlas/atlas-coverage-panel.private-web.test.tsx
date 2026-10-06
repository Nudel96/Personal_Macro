import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { AtlasCoveragePanel } from "./atlas-coverage-panel";
import { atlasCatalog } from "./atlas-catalog";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../services/commands", () => ({
  api: new Proxy({}, { get: () => read }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("does not fan out hundreds of private requests before an explicit coverage check", () => {
  vi.stubEnv("VITE_PRIVATE_WEB", "true");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AtlasCoveragePanel
        geography={atlasCatalog.geographies.find((g) => g.id === "m49:276")!}
        showNumbers={false}
        onNumbersChange={() => {}}
        filters={{ domain: null, search: null, status: null }}
        onNavigate={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: /Quellenabdeckung/ }),
  ).toBeInTheDocument();
  expect(read).not.toHaveBeenCalled();
  client.clear();
});
