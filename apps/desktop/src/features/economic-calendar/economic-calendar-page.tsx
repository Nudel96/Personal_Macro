import { CalendarRange as PageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CalendarClock,
  ExternalLink,
  Filter,
  Globe2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  EconomicCalendarCategory,
  EconomicCalendarEvent,
  EconomicCalendarInput,
} from "../../types/domain";

type CalendarSort = "time" | "country" | "category";
type CalendarView = "future" | "history";

const categoryOptions: Array<{
  key: EconomicCalendarCategory;
  label: string;
}> = [
  { key: "growth", label: "Wachstum & Aktivität" },
  { key: "inflation", label: "Inflation & Preise" },
  { key: "labor", label: "Arbeitsmarkt" },
  { key: "rates", label: "Geldpolitik & Zinsen" },
  { key: "trade", label: "Außenhandel" },
  { key: "housing", label: "Immobilien" },
  { key: "energy", label: "Energie & Rohstoffe" },
  { key: "confidence", label: "Stimmung & Vertrauen" },
  { key: "fiscal", label: "Fiskalpolitik & Anleihen" },
  { key: "other", label: "Weitere Termine" },
];

const countryByCurrency: Record<string, string> = {
  AUD: "Australien",
  CAD: "Kanada",
  CHF: "Schweiz",
  CNY: "China",
  EUR: "Eurozone",
  GBP: "Großbritannien",
  JPY: "Japan",
  NZD: "Neuseeland",
  USD: "USA",
};

const categoryLabels = Object.fromEntries(
  categoryOptions.map((category) => [category.key, category.label]),
) as Record<EconomicCalendarCategory, string>;
const emptyEvents: EconomicCalendarEvent[] = [];

export interface EconomicCalendarFilters {
  country: string;
  category: EconomicCalendarCategory | "all";
  asset: string;
  query: string;
  sort: CalendarSort;
  chronology?: "ascending" | "descending";
}

export function filterAndSortEconomicCalendarEvents(
  events: EconomicCalendarEvent[],
  filters: EconomicCalendarFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase("de-DE");
  const filtered = events.filter((event) => {
    if (filters.country !== "all" && event.currency !== filters.country) {
      return false;
    }
    if (filters.category !== "all" && event.category !== filters.category) {
      return false;
    }
    if (
      filters.asset !== "all" &&
      !event.affectedAssets.includes(filters.asset)
    ) {
      return false;
    }
    if (!query) return true;
    return [
      event.title,
      event.currency,
      countryByCurrency[event.currency] ?? event.country,
      categoryLabels[event.category],
      event.period ?? "",
      ...event.affectedAssets,
    ]
      .join(" ")
      .toLocaleLowerCase("de-DE")
      .includes(query);
  });
  const collator = new Intl.Collator("de-DE", { sensitivity: "base" });
  return [...filtered].sort((left, right) => {
    if (filters.sort === "country") {
      const countryOrder = collator.compare(
        countryByCurrency[left.currency] ?? left.country,
        countryByCurrency[right.currency] ?? right.country,
      );
      if (countryOrder !== 0) return countryOrder;
    }
    if (filters.sort === "category") {
      const categoryOrder = collator.compare(
        categoryLabels[left.category],
        categoryLabels[right.category],
      );
      if (categoryOrder !== 0) return categoryOrder;
    }
    const timeOrder =
      new Date(left.scheduledAt).getTime() -
      new Date(right.scheduledAt).getTime();
    return filters.chronology === "descending" ? -timeOrder : timeOrder;
  });
}

function calendarDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const key = (item: Date) =>
    `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
  if (key(date) === key(today)) return "Heute";
  if (key(date) === key(tomorrow)) return "Morgen";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function calendarTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function countryLabel(event: EconomicCalendarEvent) {
  return countryByCurrency[event.currency] ?? event.country;
}

export function EconomicCalendarPage() {
  const queryClient = useQueryClient();
  const [range, setRange] =
    useState<EconomicCalendarInput["range"]>("future30");
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState<EconomicCalendarCategory | "all">(
    "all",
  );
  const [asset, setAsset] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CalendarSort>("time");
  const view: CalendarView = range.startsWith("future") ? "future" : "history";
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();

  const calendar = useQuery({
    queryKey: ["economic-calendar", range, timezoneOffsetMinutes],
    queryFn: () => api.economicCalendar({ range, timezoneOffsetMinutes }),
    retry: false,
  });
  const feedStatus = useQuery({
    queryKey: ["macro", "eodhd-status"],
    queryFn: api.eodhdFeedStatus,
    retry: false,
    refetchInterval: 60_000,
  });
  const refresh = useMutation({
    mutationFn: api.syncEodhdNow,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["economic-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["macro"] });
      toast.success(
        `${result.run.eventsSeen} Termine geprüft · ${result.run.eventsUpdated} Datensätze aktualisiert.`,
      );
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ??
          "Der Wirtschaftskalender konnte nicht aktualisiert werden.",
      ),
  });

  const events = useMemo(
    () => calendar.data?.events ?? emptyEvents,
    [calendar.data?.events],
  );
  const countries = useMemo(
    () =>
      [...new Set(events.map((event) => event.currency))].sort((a, b) =>
        (countryByCurrency[a] ?? a).localeCompare(countryByCurrency[b] ?? b),
      ),
    [events],
  );
  const assets = useMemo(
    () =>
      [...new Set(events.flatMap((event) => event.affectedAssets))].sort(
        (a, b) => a.localeCompare(b, "de-DE"),
      ),
    [events],
  );
  const visibleEvents = useMemo(
    () =>
      filterAndSortEconomicCalendarEvents(events, {
        country,
        category,
        asset,
        query: search,
        sort,
        chronology: view === "history" ? "descending" : "ascending",
      }),
    [asset, category, country, events, search, sort, view],
  );
  const focusEvent = useMemo(
    () =>
      visibleEvents.reduce<EconomicCalendarEvent | undefined>(
        (current, event) =>
          !current ||
          (view === "history"
            ? new Date(event.scheduledAt).getTime() >
              new Date(current.scheduledAt).getTime()
            : new Date(event.scheduledAt).getTime() <
              new Date(current.scheduledAt).getTime())
            ? event
            : current,
        undefined,
      ),
    [view, visibleEvents],
  );
  const activeFilters =
    Number(country !== "all") +
    Number(category !== "all") +
    Number(asset !== "all") +
    Number(search.trim() !== "");

  if (calendar.isLoading) {
    return (
      <div className="page economic-calendar-page">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="page economic-calendar-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Marktkontext"
        title="Wirtschaftskalender"
        description={
          view === "history"
            ? "Vergangene EODHD-Wirtschaftsdaten des heutigen Tages, der laufenden Woche oder des laufenden Monats – einschließlich Actual, Forecast und Previous."
            : "Alle lokal geladenen, zukünftigen EODHD-Macro-Termine – mit Länder-, Kategorien- und Marktfilter."
        }
        actions={
          <>
            <div className="segmented" aria-label="Kalenderansicht">
              <button
                type="button"
                className={view === "future" ? "active" : ""}
                onClick={() => setRange("future30")}
              >
                Kommend
              </button>
              <button
                type="button"
                className={view === "history" ? "active" : ""}
                onClick={() => setRange("today")}
              >
                Verlauf
              </button>
            </div>
            <div className="segmented" aria-label="Kalenderzeitraum">
              {view === "future"
                ? ([7, 30, 90] as const).map((days) => {
                    const value = `future${days}` as const;
                    return (
                      <button
                        type="button"
                        className={range === value ? "active" : ""}
                        onClick={() => setRange(value)}
                        key={value}
                      >
                        {days} Tage
                      </button>
                    );
                  })
                : (
                    [
                      ["today", "Heute"],
                      ["week", "Diese Woche"],
                      ["month", "Dieser Monat"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      className={range === value ? "active" : ""}
                      onClick={() => setRange(value)}
                      key={value}
                    >
                      {label}
                    </button>
                  ))}
            </div>
            <Button
              onClick={() => refresh.mutate()}
              disabled={
                !isTauri() ||
                !feedStatus.data?.configured ||
                feedStatus.data?.running ||
                refresh.isPending
              }
              title={
                isTauri()
                  ? "EODHD-Kalender aktualisieren"
                  : "Nur in der Desktop-App verfügbar"
              }
            >
              <RefreshCw
                size={15}
                className={refresh.isPending ? "spin" : undefined}
              />
              Aktualisieren
            </Button>
          </>
        }
      />

      {calendar.isError ? (
        <ErrorState message="Wirtschaftstermine konnten nicht aus der lokalen Datenbank geladen werden." />
      ) : null}

      <div className="economic-calendar-summary">
        <div>
          <span>Gefundene Termine</span>
          <strong className="tabular">{visibleEvents.length}</strong>
          <small>{events.length} im gewählten Zeitraum geladen</small>
        </div>
        <div>
          <span>Länder / Währungen</span>
          <strong className="tabular">
            {new Set(visibleEvents.map((event) => event.currency)).size}
          </strong>
          <small>von {countries.length} mit Terminen</small>
        </div>
        <div>
          <span>
            {view === "history"
              ? "Letzter gefilterter Release"
              : "Nächster gefilterter Termin"}
          </span>
          <strong>{focusEvent ? dateTime(focusEvent.scheduledAt) : "—"}</strong>
          <small>{focusEvent?.title ?? "Keine passenden Termine"}</small>
        </div>
      </div>

      <Card className="economic-calendar-filter-card">
        <CardHeader
          title={
            <span className="economic-calendar-card-title">
              <Filter size={15} /> Kalender filtern
            </span>
          }
          subtitle={`${activeFilters} aktive Filter · Uhrzeiten in deiner lokalen Zeitzone`}
          action={
            activeFilters > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCountry("all");
                  setCategory("all");
                  setAsset("all");
                  setSearch("");
                }}
              >
                Zurücksetzen
              </Button>
            ) : null
          }
        />
        <CardContent className="economic-calendar-filters">
          <div className="field economic-calendar-search">
            <label htmlFor="economic-calendar-search">Suche</label>
            <div className="economic-calendar-search-input">
              <Search size={14} />
              <input
                id="economic-calendar-search"
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Termin, Währung oder Asset …"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="economic-calendar-country">Land</label>
            <select
              id="economic-calendar-country"
              className="select"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="all">Alle Länder</option>
              {countries.map((currency) => (
                <option value={currency} key={currency}>
                  {countryByCurrency[currency] ?? currency} · {currency}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="economic-calendar-category">Kategorie</label>
            <select
              id="economic-calendar-category"
              className="select"
              value={category}
              onChange={(event) =>
                setCategory(
                  event.target.value as EconomicCalendarCategory | "all",
                )
              }
            >
              <option value="all">Alle Kategorien</option>
              {categoryOptions.map((option) => (
                <option value={option.key} key={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="economic-calendar-asset">Markt / Asset</label>
            <select
              id="economic-calendar-asset"
              className="select"
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            >
              <option value="all">Alle Märkte</option>
              {assets.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="economic-calendar-sort">Sortierung</label>
            <select
              id="economic-calendar-sort"
              className="select"
              value={sort}
              onChange={(event) => setSort(event.target.value as CalendarSort)}
            >
              <option value="time">Zeitpunkt</option>
              <option value="country">Land</option>
              <option value="category">Kategorie</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="economic-calendar-results">
        <CardHeader
          title={
            view === "history"
              ? "Vergangene Wirtschaftsdaten"
              : "Kommende Macro-Termine"
          }
          subtitle={
            calendar.data
              ? `${calendar.data.sourceName} · Stand ${dateTime(calendar.data.asOf)}`
              : "EODHD Economic Events API"
          }
          action={<Badge>{visibleEvents.length} Termine</Badge>}
        />
        {visibleEvents.length ? (
          <div className="table-wrap economic-calendar-table-wrap">
            <table className="data-table economic-calendar-table">
              <thead>
                <tr>
                  <th>Datum / Zeit</th>
                  <th>Land</th>
                  <th>Kategorie</th>
                  <th>Termin</th>
                  <th>Actual</th>
                  <th>Forecast</th>
                  <th>Previous</th>
                  <th>Marktrelevanz</th>
                  <th>Quelle</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong className="economic-calendar-date">
                        {calendarDate(event.scheduledAt)}
                      </strong>
                      <small className="economic-calendar-time">
                        {calendarTime(event.scheduledAt)} Uhr
                      </small>
                    </td>
                    <td>
                      <span className="economic-calendar-country">
                        <strong>{event.currency}</strong>
                        <small>{countryLabel(event)}</small>
                      </span>
                    </td>
                    <td>
                      <Badge className={`calendar-category ${event.category}`}>
                        {categoryLabels[event.category]}
                      </Badge>
                    </td>
                    <td className="economic-calendar-event-cell">
                      <strong>{event.title}</strong>
                      <small>
                        {[event.period, event.comparison, event.frequency]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </td>
                    <td className="tabular">{event.actualText ?? "—"}</td>
                    <td className="tabular">{event.forecastText ?? "—"}</td>
                    <td className="tabular">{event.previousText ?? "—"}</td>
                    <td>
                      <div className="economic-calendar-assets">
                        {event.affectedAssets.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="economic-source-link"
                        onClick={() => void openUrl(event.sourceUrl)}
                        aria-label={`EODHD-Quelle für ${event.title} öffnen`}
                      >
                        EODHD <ExternalLink size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={isTauri() ? CalendarClock : Globe2}
            title={
              isTauri()
                ? "Keine passenden Termine"
                : "Desktop-App für Live-Termine erforderlich"
            }
            description={
              isTauri()
                ? "Ändere die Filter oder aktualisiere den EODHD-Feed. Fehlende Termine werden nicht als neutrale Ereignisse ergänzt."
                : "Die Browser-Vorschau erzeugt bewusst keine Mock-Termine. Starte die Tauri-App, um den lokalen EODHD-Kalender zu laden."
            }
          />
        )}
      </Card>

      <p className="economic-calendar-provenance">
        Termine, Actual, Forecast und Previous stammen direkt aus EODHD. Die
        angezeigte Marktrelevanz ist eine regelbasierte Orientierung aus Land
        und Kategorie, keine Aussage des Providers und keine Handelsempfehlung.
      </p>
    </div>
  );
}
