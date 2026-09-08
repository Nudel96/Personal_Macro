import { Settings2 as PageIcon } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Banknote,
  BarChart3,
  Database,
  HardDrive,
  Keyboard,
  Palette,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { api, isTauri } from "../../services/commands";
import { formatMoneyMinor } from "../../lib/utils";
import { useUiStore } from "../../stores/ui-store";
import type { Account, TaxonomyItem } from "../../types/domain";
import { AccountConnectionPanel } from "../accounts/account-connection-panel";

const sections = [
  { id: "appearance", label: "Darstellung", icon: Palette },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "accounts", label: "Konten", icon: WalletCards },
  { id: "custom", label: "Eigene Felder", icon: SlidersHorizontal },
  { id: "taxonomy", label: "Tags", icon: Tags },
  { id: "data", label: "Daten & Backup", icon: Database },
  { id: "shortcuts", label: "Tastatur", icon: Keyboard },
  { id: "privacy", label: "Privatsphäre", icon: ShieldCheck },
];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const initialSection = sections.some((item) => item.id === requestedSection)
    ? requestedSection!
    : "appearance";
  const [section, setSection] = useState(initialSection);
  useEffect(() => {
    if (
      requestedSection &&
      sections.some((item) => item.id === requestedSection)
    ) {
      setSection(requestedSection);
    }
  }, [requestedSection]);
  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  if (bootstrap.isLoading || settings.isLoading)
    return (
      <div className="page settings-page">
        <PageLoading />
      </div>
    );
  return (
    <div className="page settings-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Daten & System"
        title="Einstellungen"
        description="Lokale Darstellung, Analytics-Regeln, Backups und Datenschutz."
      />
      <div className="grid settings-grid">
        <Card
          className="settings-nav"
          role="navigation"
          aria-label="Einstellungsbereiche"
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              className={section === id ? "active" : ""}
              aria-current={section === id ? "page" : undefined}
              key={id}
              onClick={() => {
                setSection(id);
                setSearchParams(id === "appearance" ? {} : { section: id }, {
                  replace: true,
                });
              }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </Card>
        <div className="settings-panel">
          {section === "appearance" && (
            <AppearanceSettings initial={settings.data?.settings.appearance} />
          )}
          {section === "analytics" && (
            <AnalyticsSettings initial={settings.data?.settings.analytics} />
          )}
          {section === "accounts" && (
            <AccountSettings accounts={bootstrap.data?.accounts ?? []} />
          )}
          {section === "custom" && <CustomFieldSettings />}
          {section === "taxonomy" && (
            <TagSettings tags={bootstrap.data?.tags ?? []} />
          )}
          {section === "data" && (
            <DataSettings
              databasePath={bootstrap.data?.databasePath ?? "—"}
              appDataPath={bootstrap.data?.appDataPath ?? "—"}
              initial={settings.data?.settings.backup}
            />
          )}
          {section === "shortcuts" && <ShortcutSettings />}
          {section === "privacy" && <PrivacySettings />}
        </div>
      </div>
    </div>
  );
}

function AccountSettings({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const selectedJournalAccountId = useUiStore(
    (state) => state.selectedJournalAccountId,
  );
  const setSelectedJournalAccountId = useUiStore(
    (state) => state.setSelectedJournalAccountId,
  );
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [initialBalance, setInitialBalance] = useState("");
  const [defaultRiskPercent, setDefaultRiskPercent] = useState("1");
  const [creationMode, setCreationMode] = useState<"manual" | "connected">(
    "manual",
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    accounts[0]?.id ?? "",
  );
  const [cashflowKind, setCashflowKind] = useState<
    "deposit" | "withdrawal" | "adjustment"
  >("deposit");
  const [cashflowAmount, setCashflowAmount] = useState("");
  const [cashflowNote, setCashflowNote] = useState("");
  const cashflows = useQuery({
    queryKey: ["account-cashflows", selectedAccountId],
    queryFn: () => api.accountCashflows(selectedAccountId),
    enabled: Boolean(selectedAccountId),
  });
  const save = useMutation({
    mutationFn: () =>
      api.saveAccount({
        name,
        broker: broker || undefined,
        accountType: "personal",
        baseCurrency: currency.toUpperCase(),
        initialBalanceMinor: Math.round(
          Number(initialBalance.replace(",", ".") || 0) * 100,
        ),
        defaultRiskPercent: Number(defaultRiskPercent.replace(",", ".")) || 1,
      }),
    onSuccess: async (account) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setSelectedJournalAccountId(account.id);
      setSelectedAccountId(account.id);
      setName("");
      setBroker("");
      setInitialBalance("");
      setDefaultRiskPercent("1");
      toast.success("Konto angelegt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Konto konnte nicht gespeichert werden."),
  });
  const archive = useMutation({
    mutationFn: api.archiveAccount,
    onSuccess: async (_, archivedAccountId) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      if (selectedJournalAccountId === archivedAccountId) {
        setSelectedJournalAccountId(null);
      }
      setSelectedAccountId("");
      toast.success("Konto archiviert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Konto konnte nicht archiviert werden."),
  });
  const cashflow = useMutation({
    mutationFn: () => {
      const raw = Math.round(Number(cashflowAmount.replace(",", ".")) * 100);
      return api.addAccountCashflow({
        accountId: selectedAccountId,
        occurredAt: new Date().toISOString(),
        amountMinor: cashflowKind === "withdrawal" ? -Math.abs(raw) : raw,
        kind: cashflowKind,
        note: cashflowNote || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["account-cashflows", selectedAccountId],
      });
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setCashflowAmount("");
      setCashflowNote("");
      toast.success("Cashflow erfasst.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Cashflow konnte nicht gespeichert werden."),
  });
  return (
    <div className="grid" style={{ gap: 14 }}>
      <SettingsCard
        title="Tradingkonten"
        subtitle="Mehrere Broker- oder Prop-Konten mit eigener Basiswährung."
      >
        {accounts.map((account) => (
          <Setting
            key={account.id}
            label={account.name}
            copy={`${account.broker ?? "Ohne Broker"} · ${account.baseCurrency} · Journal ${formatMoneyMinor(account.currentBalanceMinor)} · Risiko ${account.defaultRiskPercent.toLocaleString("de-DE")} %`}
          >
            <Button
              variant="danger"
              size="sm"
              disabled={accounts.length <= 1 || archive.isPending}
              onClick={() => archive.mutate(account.id)}
            >
              <Archive size={12} /> Archivieren
            </Button>
          </Setting>
        ))}
        <div
          className="segmented account-creation-tabs"
          aria-label="Konto anlegen"
        >
          <button
            type="button"
            className={creationMode === "manual" ? "active" : ""}
            onClick={() => setCreationMode("manual")}
          >
            Manuell anlegen
          </button>
          <button
            type="button"
            className={creationMode === "connected" ? "active" : ""}
            onClick={() => setCreationMode("connected")}
          >
            MT5 / cTrader verbinden
          </button>
        </div>
        {creationMode === "manual" && (
          <>
            <div className="form-grid cols-3" style={{ marginTop: 16 }}>
              <div className="field">
                <label>Kontoname</label>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="z. B. Prop Evaluation"
                />
              </div>
              <div className="field">
                <label>Broker / Firma</label>
                <input
                  className="input"
                  value={broker}
                  onChange={(event) => setBroker(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Basiswährung</label>
                <input
                  className="input"
                  maxLength={3}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Startkapital</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={initialBalance}
                  onChange={(event) => setInitialBalance(event.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="field">
                <label>Standardrisiko (%)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={defaultRiskPercent}
                  onChange={(event) =>
                    setDefaultRiskPercent(event.target.value)
                  }
                  placeholder="1,00"
                />
              </div>
            </div>
            <Button
              variant="primary"
              style={{ marginTop: 13 }}
              disabled={!name.trim() || currency.length !== 3 || save.isPending}
              onClick={() => save.mutate()}
            >
              <Plus size={14} /> Konto anlegen
            </Button>
          </>
        )}
        {creationMode === "connected" && (
          <AccountConnectionPanel
            onAccountCreated={(accountId) => {
              setSelectedJournalAccountId(accountId);
              setSelectedAccountId(accountId);
            }}
          />
        )}
      </SettingsCard>
      <SettingsCard
        title="Ein- und Auszahlungen"
        subtitle="Cashflows werden getrennt vom Trading-P&L geführt."
      >
        <div className="form-grid cols-3">
          <div className="field">
            <label>Konto</label>
            <select
              className="select"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Typ</label>
            <select
              className="select"
              value={cashflowKind}
              onChange={(event) =>
                setCashflowKind(event.target.value as typeof cashflowKind)
              }
            >
              <option value="deposit">Einzahlung</option>
              <option value="withdrawal">Auszahlung</option>
              <option value="adjustment">Korrektur</option>
            </select>
          </div>
          <div className="field">
            <label>Betrag</label>
            <input
              className="input"
              inputMode="decimal"
              value={cashflowAmount}
              onChange={(event) => setCashflowAmount(event.target.value)}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Notiz</label>
          <input
            className="input"
            value={cashflowNote}
            onChange={(event) => setCashflowNote(event.target.value)}
          />
        </div>
        <Button
          style={{ marginTop: 12 }}
          disabled={
            !selectedAccountId ||
            !Number(cashflowAmount.replace(",", ".")) ||
            cashflow.isPending
          }
          onClick={() => cashflow.mutate()}
        >
          <Banknote size={14} /> Cashflow erfassen
        </Button>
        {cashflows.data?.length ? (
          <div style={{ marginTop: 14 }}>
            {cashflows.data.slice(0, 8).map((row) => (
              <Setting
                key={row.id}
                label={
                  row.kind === "deposit"
                    ? "Einzahlung"
                    : row.kind === "withdrawal"
                      ? "Auszahlung"
                      : "Korrektur"
                }
                copy={
                  row.note ??
                  new Date(row.occurredAt).toLocaleDateString("de-DE")
                }
              >
                <strong
                  className={
                    row.amountMinor >= 0 ? "positive-text" : "negative-text"
                  }
                >
                  {formatMoneyMinor(row.amountMinor)}
                </strong>
              </Setting>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 14 }}>
            Noch keine Cashflows für dieses Konto.
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

function CustomFieldSettings() {
  const queryClient = useQueryClient();
  const fields = useQuery({
    queryKey: ["custom-fields", "trade"],
    queryFn: () => api.customFields("trade"),
  });
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<
    "text" | "number" | "boolean" | "date" | "select" | "multiselect"
  >("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.saveCustomField({
        entityType: "trade",
        name,
        fieldType,
        optionsJson: JSON.stringify(
          options
            .split(",")
            .map((option) => option.trim())
            .filter(Boolean),
        ),
        isRequired: required,
        sortOrder: fields.data?.length ?? 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["custom-fields", "trade"],
      });
      setName("");
      setOptions("");
      setRequired(false);
      toast.success("Eigenes Feld angelegt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Feld konnte nicht angelegt werden."),
  });
  const remove = useMutation({
    mutationFn: api.deleteCustomField,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["custom-fields", "trade"],
      });
      toast.success("Feld entfernt; bestehende Feldwerte wurden mit gelöscht.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Feld konnte nicht entfernt werden."),
  });
  return (
    <SettingsCard
      title="Eigene Journal-Felder"
      subtitle="Erweitere jeden Trade um persönliche Text-, Zahlen-, Auswahl- oder Statusfelder."
    >
      {fields.data?.map((field) => (
        <Setting
          key={field.id}
          label={field.name}
          copy={`${field.fieldType}${field.isRequired ? " · Pflichtfeld" : ""}`}
        >
          <Button
            size="sm"
            variant="danger"
            onClick={() => remove.mutate(field.id)}
            disabled={remove.isPending}
          >
            <Archive size={12} /> Entfernen
          </Button>
        </Setting>
      ))}
      {!fields.data?.length && (
        <div className="notice">
          Noch keine eigenen Felder. Neue Felder erscheinen automatisch in jedem
          Trade-Detail.
        </div>
      )}
      <div className="form-grid cols-3" style={{ marginTop: 17 }}>
        <div className="field">
          <label>Feldname</label>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. HTF-Konfluenz"
          />
        </div>
        <div className="field">
          <label>Typ</label>
          <select
            className="select"
            value={fieldType}
            onChange={(event) =>
              setFieldType(event.target.value as typeof fieldType)
            }
          >
            <option value="text">Text</option>
            <option value="number">Zahl</option>
            <option value="boolean">Ja / Nein</option>
            <option value="date">Datum</option>
            <option value="select">Auswahl</option>
            <option value="multiselect">Mehrfachauswahl</option>
          </select>
        </div>
        {(fieldType === "select" || fieldType === "multiselect") && (
          <div className="field">
            <label>Optionen (kommagetrennt)</label>
            <input
              className="input"
              value={options}
              onChange={(event) => setOptions(event.target.value)}
            />
          </div>
        )}
      </div>
      <label className="checklist-line" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />{" "}
        Pflichtfeld
      </label>
      <Button
        variant="primary"
        style={{ marginTop: 12 }}
        disabled={!name.trim() || save.isPending}
        onClick={() => save.mutate()}
      >
        <Plus size={14} /> Feld anlegen
      </Button>
    </SettingsCard>
  );
}

function TagSettings({ tags }: { tags: TaxonomyItem[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4c8dff");
  const save = useMutation({
    mutationFn: () => api.createTag({ name, color }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setName("");
      toast.success("Tag angelegt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Tag konnte nicht angelegt werden."),
  });
  return (
    <SettingsCard
      title="Trade-Tags"
      subtitle="Persönliche Labels für Märkte, Konfluenz, News, Fehlerbilder oder besondere Situationen."
    >
      <div className="chip-list" style={{ marginBottom: 17 }}>
        {tags.map((tag) => (
          <span className="tag-toggle selected" key={tag.id}>
            <span style={{ background: tag.color }} />
            {tag.name}
          </span>
        ))}
        {!tags.length && <span className="muted">Noch keine Tags.</span>}
      </div>
      <div className="page-actions">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="z. B. High Impact News"
        />
        <input
          className="color-input"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
        <Button
          variant="primary"
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          <Plus size={14} /> Tag anlegen
        </Button>
      </div>
    </SettingsCard>
  );
}

function AppearanceSettings({ initial }: { initial: unknown }) {
  const value = (initial ?? {}) as {
    theme?: string;
    density?: string;
    sidebarCollapsed?: boolean;
  };
  const [theme, setTheme] = useState(value.theme ?? "dark");
  const [density, setDensity] = useState(value.density ?? "compact");
  return (
    <SettingsCard
      title="Darstellung"
      subtitle="Die App ist für fokussiertes Arbeiten im dunklen Theme optimiert."
    >
      <Setting
        label="Theme"
        copy="Dunkles Workspace-Design. Ein helles Theme ist noch nicht verfügbar."
      >
        <select
          className="select"
          value={theme}
          aria-label="Theme"
          onChange={(event) => setTheme(event.target.value)}
          style={{ width: 180 }}
        >
          <option value="dark">Dunkel</option>
          <option value="system">System (derzeit dunkel)</option>
          <option value="light" disabled>
            Hell (folgt)
          </option>
        </select>
      </Setting>
      <Setting
        label="Informationsdichte"
        copy="Beeinflusst Tabellenhöhe und Kartenabstände."
      >
        <select
          className="select"
          value={density}
          aria-label="Informationsdichte"
          onChange={(event) => setDensity(event.target.value)}
          style={{ width: 180 }}
        >
          <option value="comfortable">Komfortabel</option>
          <option value="compact">Kompakt</option>
        </select>
      </Setting>
      <SaveSetting
        settingKey="appearance"
        value={{ theme, density, sidebarCollapsed: false }}
      />
    </SettingsCard>
  );
}
function AnalyticsSettings({ initial }: { initial: unknown }) {
  const value = (initial ?? {}) as {
    minimumRankingSample?: number;
    minimumCorrelationSample?: number;
    rollingWindow?: number;
  };
  const [ranking, setRanking] = useState(value.minimumRankingSample ?? 10);
  const [correlation, setCorrelation] = useState(
    value.minimumCorrelationSample ?? 20,
  );
  const [rolling, setRolling] = useState(value.rollingWindow ?? 20);
  return (
    <SettingsCard
      title="Analytics-Regeln"
      subtitle="Guardrails gegen Scheingenauigkeit bei kleinen Stichproben."
    >
      <Setting
        label="Mindeststichprobe Rankings"
        copy="Setups und Sessions werden vorher als vorläufig markiert."
      >
        <input
          className="input"
          type="number"
          min="1"
          value={ranking}
          onChange={(event) => setRanking(Number(event.target.value))}
          style={{ width: 100 }}
        />
      </Setting>
      <Setting
        label="Psychologie-Korrelation"
        copy="Unter diesem n wird keine Korrelationszahl gezeigt."
      >
        <input
          className="input"
          type="number"
          min="5"
          value={correlation}
          onChange={(event) => setCorrelation(Number(event.target.value))}
          style={{ width: 100 }}
        />
      </Setting>
      <Setting
        label="Rollendes Fenster"
        copy="Anzahl Trades für Win Rate, Expectancy und Profit Factor."
      >
        <input
          className="input"
          type="number"
          min="5"
          value={rolling}
          onChange={(event) => setRolling(Number(event.target.value))}
          style={{ width: 100 }}
        />
      </Setting>
      <SaveSetting
        settingKey="analytics"
        value={{
          minimumRankingSample: ranking,
          minimumCorrelationSample: correlation,
          rollingWindow: rolling,
        }}
      />
    </SettingsCard>
  );
}
function DataSettings({
  databasePath,
  appDataPath,
  initial,
}: {
  databasePath: string;
  appDataPath: string;
  initial: unknown;
}) {
  const queryClient = useQueryClient();
  const backup = useMutation({
    mutationFn: api.createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast.success("Backup erstellt.");
    },
    onError: (error: { message?: string }) =>
      toast.error(error.message ?? "Backup fehlgeschlagen."),
  });
  const backupSettings = (initial ?? {}) as {
    automatic?: boolean;
    retention?: number;
  };
  const [automatic, setAutomatic] = useState(backupSettings.automatic ?? true);
  const [retention, setRetention] = useState(backupSettings.retention ?? 10);
  return (
    <SettingsCard
      title="Daten & Backup"
      subtitle="Alle Daten bleiben standardmäßig auf diesem Gerät."
    >
      <Setting label="Datenbank" copy={databasePath}>
        <Badge className="positive">
          <HardDrive size={11} /> SQLite · WAL
        </Badge>
      </Setting>
      <Setting label="AppData-Verzeichnis" copy={appDataPath}>
        <Badge>Lokal</Badge>
      </Setting>
      <Setting
        label="Vollständiges Backup"
        copy="Sichert Datenbank, Medien und SHA-256-Manifest."
      >
        <Button
          onClick={() => backup.mutate()}
          disabled={!isTauri() || backup.isPending}
        >
          <Archive size={14} /> Jetzt erstellen
        </Button>
      </Setting>
      <Setting
        label="Automatisches Tagesbackup"
        copy="Beim App-Start wird höchstens einmal pro 24 Stunden gesichert."
      >
        <Toggle checked={automatic} onCheckedChange={setAutomatic} />
      </Setting>
      <Setting
        label="Aufbewahrung"
        copy="Ältere automatische Archive werden innerhalb des Backup-Ordners entfernt."
      >
        <input
          className="input"
          style={{ width: 90 }}
          type="number"
          min="1"
          max="100"
          value={retention}
          onChange={(event) => setRetention(Number(event.target.value))}
        />
      </Setting>
      <SaveSetting settingKey="backup" value={{ automatic, retention }} />
      <div className="notice" style={{ marginTop: 15 }}>
        Restore-Archive werden vor einer Wiederherstellung geprüft. Ein
        Pre-Restore-Backup ist Pflicht; die alte Datenbank wird nicht
        stillschweigend überschrieben.
      </div>
    </SettingsCard>
  );
}
function ShortcutSettings() {
  const shortcuts = [
    ["Ctrl + K", "Befehlspalette"],
    ["Ctrl + N", "Neuen Trade erfassen"],
    ["Esc", "Dialog schließen"],
    ["Enter", "Ausgewählte Aktion ausführen"],
  ];
  return (
    <SettingsCard
      title="Tastaturbefehle"
      subtitle="Schnelle Bedienung ohne Maus."
    >
      {shortcuts.map(([key, description]) => (
        <Setting key={key} label={description} copy="">
          <Badge className="primary">{key}</Badge>
        </Setting>
      ))}
    </SettingsCard>
  );
}
function PrivacySettings() {
  const [telemetry, setTelemetry] = useState(false);
  return (
    <SettingsCard
      title="Privatsphäre"
      subtitle="Einzelbenutzer, local-first und ohne Konto."
    >
      <Setting
        label="Telemetrie"
        copy="Es werden keine Nutzungs- oder Tradingdaten versendet."
      >
        <Toggle checked={telemetry} onCheckedChange={setTelemetry} disabled />
      </Setting>
      <Setting
        label="Cloud-Synchronisierung"
        copy="Nicht installiert; kein externer Speicher ist verbunden."
      >
        <Badge className="positive">Aus</Badge>
      </Setting>
      <div className="notice" style={{ marginTop: 15 }}>
        Optionale Datenanbieter für Forecasts werden nur über bewusst gestartete
        Import-Adapter angebunden. Quelle, Importzeit und Datenqualität bleiben
        sichtbar.
      </div>
    </SettingsCard>
  );
}
function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Setting({
  label,
  copy,
  children,
}: {
  label: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{label}</strong>
        {copy && <span>{copy}</span>}
      </div>
      {children}
    </div>
  );
}
function SaveSetting({
  settingKey,
  value,
}: {
  settingKey: string;
  value: unknown;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.updateSetting(settingKey, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Einstellung gespeichert.");
    },
    onError: () => toast.error("Einstellung konnte nicht gespeichert werden."),
  });
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 15 }}>
      <Button
        variant="primary"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Save size={14} /> Speichern
      </Button>
    </div>
  );
}
function Toggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      style={{
        width: 42,
        height: 23,
        borderRadius: 99,
        border: "1px solid var(--border)",
        background: checked ? "var(--primary)" : "#15243a",
        padding: 2,
      }}
    >
      <Switch.Thumb
        style={{
          display: "block",
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "white",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: ".15s",
        }}
      />
    </Switch.Root>
  );
}
