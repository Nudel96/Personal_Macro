# Personal Macro Desktop

Local-first Tradingjournal und Macro-Workspace für einen einzelnen Benutzer.
Tradingdaten bleiben standardmäßig lokal in SQLite; die App besitzt keine
Broker-Orderausführung und keine verpflichtende Cloud-Anmeldung.

## Start

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

Nur die schnelle Browser-Vorschau:

```powershell
pnpm dev
```

Die Browser-Vorschau nutzt `localStorage`. Funktionen mit Dateisystemzugriff –
SQLite, automatische Backups, Restore, native Dateiimporte und sichere lokale
Medienpfade – sind ausschließlich in `pnpm tauri dev` beziehungsweise im
installierten Build vollständig aktiv.

## Qualität prüfen

```powershell
pnpm typecheck
pnpm test
pnpm build
cd src-tauri
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

## Windows-Installer

Benötigt werden Rust Stable, Microsoft Visual Studio Build Tools mit der
Komponente „Desktopentwicklung mit C++“ und WebView2. Anschließend:

```powershell
pnpm tauri build
```

Tauri schreibt die erzeugten Installer nach `src-tauri\target\release\bundle`.

## Daten und Backups

- Datenbank: `%APPDATA%\com.personal-macro.app\PersonalMacro\database\journal.sqlite`
- Medien: `%APPDATA%\com.personal-macro.app\PersonalMacro\media`
- Exporte: `%APPDATA%\com.personal-macro.app\PersonalMacro\exports`
- Backups: `%APPDATA%\com.personal-macro.app\PersonalMacro\backups`

Automatische Backups laufen beim App-Start höchstens einmal innerhalb von 24
Stunden. Die Aufbewahrungszahl ist in den Einstellungen konfigurierbar. Ein
Restore wird zunächst geprüft und gestaged; vor dem Austausch entsteht eine
zusätzliche Sicherheitskopie.

## Datenanbieter

Forecast-Daten können bewusst über den öffentlichen Wochenexport von Forex
Factory oder über einen eigenen Trading-Economics-API-Schlüssel synchronisiert
werden. API-Schlüssel werden nicht dauerhaft gespeichert. Quelle, Aktualität,
fehlende Werte und Datenqualität bleiben in der Oberfläche sichtbar.
