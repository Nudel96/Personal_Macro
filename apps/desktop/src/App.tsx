import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders } from "./app/providers";
import { AppErrorBoundary } from "./components/ui/app-error-boundary";
import { AppShell } from "./components/layout/app-shell";
import { PageLoading } from "./components/ui/loading";

const DashboardPage = lazy(() =>
  import("./features/dashboard/dashboard-page").then((module) => ({
    default: module.DashboardPage,
  })),
);
const TradesPage = lazy(() =>
  import("./features/trades/trades-page").then((module) => ({
    default: module.TradesPage,
  })),
);
const CalendarPage = lazy(() =>
  import("./features/calendar/calendar-page").then((module) => ({
    default: module.CalendarPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("./features/analytics/analytics-page").then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const ReviewsPage = lazy(() =>
  import("./features/reviews/reviews-page").then((module) => ({
    default: module.ReviewsPage,
  })),
);
const PlaybookPage = lazy(() =>
  import("./features/playbook/playbook-page").then((module) => ({
    default: module.PlaybookPage,
  })),
);
const MistakesPage = lazy(() =>
  import("./features/mistakes/mistakes-page").then((module) => ({
    default: module.MistakesPage,
  })),
);
const MediaPage = lazy(() =>
  import("./features/media/media-page").then((module) => ({
    default: module.MediaPage,
  })),
);
const GoalsPage = lazy(() =>
  import("./features/goals/goals-page").then((module) => ({
    default: module.GoalsPage,
  })),
);
const MacroPage = lazy(() =>
  import("./features/macro/macro-page").then((module) => ({
    default: module.MacroPage,
  })),
);
const CotPage = lazy(() =>
  import("./features/cot/cot-page").then((module) => ({
    default: module.CotPage,
  })),
);
const MarketPage = lazy(() =>
  import("./features/market/market-page").then((module) => ({
    default: module.MarketPage,
  })),
);
const SeasonalityPage = lazy(() =>
  import("./features/seasonality/seasonality-page").then((module) => ({
    default: module.SeasonalityPage,
  })),
);
const RatesPage = lazy(() =>
  import("./features/rates/rates-page").then((module) => ({
    default: module.RatesPage,
  })),
);
const PutCallRatioPage = lazy(() =>
  import("./features/put-call-ratio/put-call-ratio-page").then((module) => ({
    default: module.PutCallRatioPage,
  })),
);
const ImportExportPage = lazy(() =>
  import("./features/import-export/import-export-page").then((module) => ({
    default: module.ImportExportPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/settings-page").then((module) => ({
    default: module.SettingsPage,
  })),
);

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="page">
                <PageLoading />
              </div>
            }
          >
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="trades" element={<TradesPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="reviews" element={<ReviewsPage />} />
                <Route path="playbook" element={<PlaybookPage />} />
                <Route path="mistakes" element={<MistakesPage />} />
                <Route path="media" element={<MediaPage />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="macro" element={<MacroPage />} />
                <Route path="cot" element={<CotPage />} />
                <Route path="market" element={<MarketPage />} />
                <Route path="seasonality" element={<SeasonalityPage />} />
                <Route path="rates" element={<RatesPage />} />
                <Route path="put-call-ratio" element={<PutCallRatioPage />} />
                <Route path="import-export" element={<ImportExportPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProviders>
    </AppErrorBoundary>
  );
}
