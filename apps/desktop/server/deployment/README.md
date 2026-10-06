# Dauerhafter privater Server neben Vercel

Dieses Paket bereitet einen eigenständigen Linux-Server mit dauerhaftem
Datenträger vor. Die Oberfläche bleibt bei Vercel. Der Rechner zu Hause wird
für diesen Betrieb nicht benötigt. Ein Anbieter, Server, Datenträger oder
kostenpflichtiger Dienst wurde damit noch nicht bestellt oder eingerichtet.

**Stand:** Docker ist auf dem Entwicklungsrechner nicht verfügbar. Der
Linux-Container wurde deshalb noch nicht gebaut oder gestartet. Die Dateien
sind eine prüfbare Bereitstellungsvorlage, keine bestätigte Cloud-Installation.
Die vorhandene PC-Datenbank wurde weder übernommen noch hochgeladen. Die
Übernahme und der gemeinsame Betrieb mit der Desktop-App sind weiterhin
separate, noch nicht implementierte Schritte. Ein neuer Server beginnt mit
einem leeren Journal und den vorhandenen Systemdefinitionen.

Der aktuelle Startpfad akzeptiert nur ein neues, leeres Testverzeichnis oder
einen vollständigen, zusammengehörigen vorhandenen Server-Datenbestand.
Journal ohne Server-Steuerdatenbank und Steuerdatenbank ohne Journal werden
abgelehnt, ebenso leere/beschädigte vorhandene Steuerdatenbanken und ein
ausstehender Desktop-Restore-Auftrag. Die Erstübernahme vom PC benötigt einen
eigenen geprüften Migrationsablauf, der passende Server-Steuerdaten erzeugt;
das Kopieren einer PC-Datenbank in ein neues Serververzeichnis ist dafür
ausdrücklich noch kein implementierter Weg.

## Aufbau und Zugriff

```text
iPhone → Vercel-Anmeldung des Besitzers → geschütztes Vercel-Gateway
       → HTTPS zu Caddy → 127.0.0.1:8080 → Rust + privater Datenträger
```

Vercel muss weiterhin **jedes Deployment und jede API-Route** ausschließlich
für das Besitzerkonto schützen. Der Rust-Server verlangt zusätzlich eine
frische signierte Gateway-Anfrage. Der gemeinsame Schlüssel liegt nur auf
Server und Vercel, niemals in `VITE_*`, Browsercode oder Build-Argumenten.
Der genaue Vertrag steht im [Gateway-Handbuch](../gateway/README.md).

Die Compose-Vorlage verwendet ausdrücklich einen **Linux-Host** mit
Host-Netzwerk. Das Backend bindet ausschließlich `127.0.0.1:8080`.
Caddy bindet öffentlich TCP 80/443; seine Verwaltungs-API ist abgeschaltet.
Es gibt kein veröffentlichtes Docker-Portmapping für 8080. HTTP/3 ist in
dieser Vorlage deaktiviert, deshalb wird kein öffentlicher UDP-Port benötigt.
Für die Anwendung nur TCP 80/443 freigeben; einen bereits gesicherten
Administrationszugang getrennt erhalten. Ein Host muss nur diesem privaten
Workspace dienen. Es läuft genau eine Backend-Instanz pro Datenverzeichnis.

Beide Container laufen ohne Root-Benutzer. Das Backend nutzt UID/GID 10001,
Caddy UID/GID 10002. Schreibbar sind nur die jeweils zugewiesenen Verzeichnisse
und temporäre Dateisysteme. Das Backend besitzt keine zusätzlichen
Linux-Capabilities. Caddy erhält nur das Binden privilegierter Ports.

## Build-Kontext und überprüfte Images

Der Build-Kontext ist **`apps/desktop`**, nicht `src-tauri` allein. Rust bindet
47 Katalog-/Connector-Referenzen über `include_str!` ein. Deshalb gehören
die JSON-Dateien unter `src/features/world-atlas/data` und
`src/features/government-bonds/data` sowie der vorhandene MT5-Connector zum
Build. Dessen Einbettung aktiviert keine MT5-Funktion auf dem Server.
Alle 49 Journal-, 22 Atlas- und eine Bond-Migration werden mitgebaut.

`src-tauri/Dockerfile.private-server.dockerignore` ist die Dockerfile-spezifische
Positivliste. Sie lässt ausschließlich Manifeste, Rust-Dateien, SQL-Migrationen,
die genannten öffentlichen JSON-Kataloge und die einzelne Connector-Quelldatei
zu. Umgebungsdateien, Datenbanken samt Begleitdateien, Schlüssel, Archive,
`node_modules`, `target`, Build-Ausgaben und private Datenordner sind gesperrt.
Neue Rust-Unterverzeichnisse müssen in der Liste ergänzt und erneut geprüft
werden. Docker überträgt seine Build-Steuerdateien gesondert.

Vom Desktop-Projektordner aus prüfen:

```sh
node server/deployment/audit-build-context.mjs
```

Der statische Prüfer kontrolliert zugelassene Dateien, alle benötigten
Quellgruppen und eingebetteten Katalogpfade sowie 31 verbotene Beispielpfade.
Er liest keine ausgeschlossenen Dateiinhalte. Er ersetzt keinen Docker-Build.

Die folgenden offiziellen Images waren bei Prüfung über die Docker-Hub-API
am **24.09.2026** aktiv und sind im Paket mit Manifest-Digest fixiert:

| Zweck       | Offizieller Tag        | Nachweis                                                                               |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------- |
| Compiler    | `rust:1.97-bookworm`   | [Docker Hub](https://hub.docker.com/v2/repositories/library/rust/tags/1.97-bookworm)   |
| Laufzeit    | `debian:bookworm-slim` | [Docker Hub](https://hub.docker.com/v2/repositories/library/debian/tags/bookworm-slim) |
| HTTPS-Proxy | `caddy:2-alpine`       | [Docker Hub](https://hub.docker.com/v2/repositories/library/caddy/tags/2-alpine)       |

Der Rust-Build verwendet `--locked --release --no-default-features --features
server --bin personal-macro-server`. Die endgültige Laufzeit enthält nur das
Binary und benötigte Systempakete. Image-Aktualisierungen einschließlich neuer
Digests benötigen einen erneuten Build und dieselbe Funktionsprüfung.

## Vorbereitung auf dem später gewählten Host

Benötigt werden ein geeigneter Linux-Host mit Docker Engine/Compose, ein
eigener DNS-Hostname, ein dauerhaftes lokales Dateisystem für SQLite und genug
Speicher für Daten plus Backups. Keine flüchtigen Vercel-Funktionsverzeichnisse,
keine geteilte Netzwerkdatei und keine automatische Mehrfachinstanz verwenden.
Anbieter, Budget, Standort, Datenträger und Sicherungsziel müssen vor einer
Bestellung feststehen; diese Vorlage enthält keine Buchung oder Preiszusage.

Die leere `server.env.example` wird **außerhalb des Repositorys** als private
Konfigurationsdatei mit Modus 0600 angelegt. Sie enthält:

| Variable                  | Bedeutung                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MACRO_WORKSPACE_ID`      | Dauerhafte Kennung, 1–128 Zeichen aus Buchstaben, Ziffern, `_`, `-`; auf Vercel identisch.                 |
| `MACRO_GATEWAY_SECRET`    | 32 zufällige Bytes als 64 Hex-Zeichen; sicher erzeugen und nur in den beiden Secret-Speichern hinterlegen. |
| `MACRO_API_HOST`          | DNS-Hostname des Backends ohne Schema oder Pfad.                                                           |
| `ACME_EMAIL`              | Kontaktadresse für die automatische Zertifikatsausstellung.                                                |
| `MACRO_HOST_DATA_ROOT`    | Absoluter Pfad zum dauerhaften Workspace-Verzeichnis, für UID/GID 10001 beschreibbar.                      |
| `MACRO_CADDY_DATA_ROOT`   | Separater absoluter Pfad für Zertifikate, für UID/GID 10002 beschreibbar.                                  |
| `MACRO_CADDY_CONFIG_ROOT` | Separater absoluter Pfad für Caddy-Zustand, für UID/GID 10002 beschreibbar.                                |

Beispiel für neu angelegte, voneinander getrennte Verzeichnisse auf dem
ausgewählten Linux-Host; die Pfade müssen zur privaten Konfiguration passen:

```sh
sudo install -d -m 0700 -o 10001 -g 10001 /srv/personal-macro/data
sudo install -d -m 0700 -o 10002 -g 10002 /srv/personal-macro/caddy-data
sudo install -d -m 0700 -o 10002 -g 10002 /srv/personal-macro/caddy-config
```

Vor dem ersten Start wird auf dem Linux-Host aus `apps/desktop` gebaut.
Der hier benannte Konfigurationspfad ist ein Beispiel für die später privat
angelegte Datei; es liegt keine solche Datei im Repository:

```sh
docker compose --env-file /etc/personal-macro/server.env -f server/deployment/compose.yaml config --quiet
docker compose --env-file /etc/personal-macro/server.env -f server/deployment/compose.yaml build --pull backend
docker compose --env-file /etc/personal-macro/server.env -f server/deployment/compose.yaml run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

`config --quiet` prüft die Konfiguration, ohne die aufgelösten Secrets
auszugeben. Erst nach erfolgreichem Linux-Build, Speicher- und Zugriffsprüfung
wird bewusst mit `up -d --no-build` derselben Compose-Konfiguration gestartet.
Diese Anleitung führt keinen dieser Schritte automatisch aus.

Anschließend auf dem Host prüfen, dass 8080 nur an Loopback gebunden ist und
eine **unsignierte** HTTPS-Anfrage an `/session` HTTP 401 liefert. Die
authentifizierten Gateway-Prüfungen müssen Lesen, Schreiben, Neustart,
wiederholte Anfragen und konkurrierende Änderungen abdecken, bevor persönliche
Daten übernommen werden. Ein laufender Prozess oder HTTP 401 allein bestätigt
keine vollständige Funktionsfähigkeit.

Auf Vercel werden `MACRO_BACKEND_ORIGIN` als exakter HTTPS-Origin,
`MACRO_WEB_ORIGINS` als exakte geschützte Frontend-Origins sowie dieselbe
Workspace-Kennung und derselbe Gateway-Schlüssel hinterlegt. Die dauerhafte
Kennung darf nach Befüllen des Datenträgers nicht neu erzeugt werden.

## Konsistente Sicherung und Wiederherstellung

Die eingebaute Journal-ZIP-Sicherung ist **keine vollständige Serversicherung**.
Eine Server-Sicherung muss mindestens gemeinsam enthalten:

- `database/journal.sqlite` mit dem Journal und persönlichen Atlasnotizen;
- `private-server.sqlite` mit Workspace-Identität, Revisionen, Vorgängen und Nonces;
- `media/`, insbesondere persönliche Bilder und Annotationen;
- vorhandene `atlas/`- und `government-bonds/`-Datenbanken;
- weitere gespeicherte Dateien und Einstellungen, etwa
  `central-bank-reports/`, nach derselben Aufbewahrungsregel.

Solange keine koordinierte Sicherungsfunktion für alle Datenbanken existiert,
wird das Backend für eine vollständige Sicherung angehalten und sein Ende
abgewartet. Anschließend wird der gesamte dauerhafte Datenbaum konsistent
gesichert, einschließlich noch vorhandener SQLite-WAL-/SHM-Dateien, und das
Backend wieder gestartet. Vorhandene automatische Backups und Exporte gehören
in einen ausdrücklich festgelegten Aufbewahrungsplan. Schlüssel und Caddy-
Zertifikatszustand werden getrennt und geschützt gesichert. Sicherungen auf
einem anderen Datenträger müssen verschlüsselt sein.

Das Kopieren nur von `journal.sqlite` während laufender Schreibzugriffe oder
einzeln zeitversetzte SQL-Backups verschiedener Datenbanken können Journal und
Serverrevision auseinanderbringen. Die SQLite-Option FULL schützt bestätigte
Schreibzugriffe im vorgesehenen Dateisystem; sie ersetzt weder Sicherung noch
Wiederherstellungsprüfung. Für einen Restore bleibt das Backend angehalten,
die zusammengehörigen Daten werden gemeinsam zurückgespielt und zunächst auf
einem isolierten Ziel mit derselben Workspace-Kennung geprüft. Vorhandene Daten
werden dabei nicht ungeprüft überschrieben.

Einzelne Datenbanken dürfen zur Umgehung eines Startfehlers nicht gelöscht oder
neu initialisiert werden: Dadurch gingen die zugehörigen Revisions- und
Vorgangsnachweise verloren. Ein Desktop-ZIP-Restore über
`settings/pending-restore.json` ist im Serverbetrieb gesperrt; er würde nur den
Journalteil ersetzen. Die vollständige Serversicherung und ein künftiger
geprüfter Importablauf bleiben davon getrennt.

## Noch offene Produktanbindung

Dieses Paket veröffentlicht nur die tatsächlich implementierte Server-
Command-Liste. Es aktiviert keine übrigen Desktop-Funktionen. Die Datenübernahme
vom PC, ein vollständig gemeinsamer Desktop-/Webmodus und alle noch fehlenden
HTTP-Funktionen sind dadurch nicht erledigt. Windows-OCR, das lokale
MT5-Terminal, native Dateidialoge und der Windows-Anmeldedatenspeicher stehen
unter Linux nicht zur Verfügung. cTrader-/Myfxbook-Zugangsdaten werden nicht
automatisch übertragen; dafür fehlt die eigene Cloud-Speicherung.

Primärdokumentation: [Docker-Build-Kontext und spezielle Ignore-Dateien](https://docs.docker.com/build/concepts/context/),
[Compose-Netzwerkmodus](https://docs.docker.com/reference/compose-file/services/#network_mode),
[Caddy-Konfiguration](https://caddyserver.com/docs/caddyfile/options),
[Caddy Reverse Proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
