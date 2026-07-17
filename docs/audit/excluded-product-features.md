# Bewusst ausgeschlossene Produktfunktionen

`Personal_Macro` ist eine lokale Single-User-Anwendung. Die folgenden Quellmodule werden fachlich erkannt, aber nicht übernommen.

## Identität und Mehrbenutzerbetrieb

- Öffentliche Registrierung und Login-Seiten
- Credentials-/Google-Login über NextAuth
- Passwort-Reset, Tokens und E-Mail-Flows
- Benutzer-, Rollen-, Admin- und Rechteverwaltung
- Einladungen und `admin_granted`-Zugänge
- öffentliche Profile, Usernames, Avatar-/Profilpflege und Sichtbarkeitsregeln
- DSGVO-Einwilligungsprotokolle für externe Nutzer
- Leaderboards, XP, Level, Streaks und Academy-Progress-Sync

Quellbereiche: `src/lib/auth*`, `src/middleware.ts`, `src/app/api/auth/**`, `src/app/login/**`, `src/app/signup/**`, `src/app/profile/**`, `src/app/api/profile/**`, `src/app/api/admin/**`, Academy-Progress-Routen und entsprechende Tabellen.

Lokaler Ersatz: kein Login im Standardbetrieb. Optional kann später eine lokale App-Sperre/OS-Keychain zum Schutz persönlicher Journalinhalte ergänzt werden; das ist keine Multi-User-Authentifizierung.

## Kommerzielle Funktionen

- Stripe Checkout, Billing Portal, Webhooks und Subscription-Status
- Pricing-, Checkout- und Success-Seiten
- Resend-Kampagnen/Transaktionsmails
- Pre-Registration, Subscriber-CRM und Admin-Analytics
- Affiliate-, Marketing- und Conversion-Tracking
- Google Analytics und Cookie-Consent für öffentliche Besucher

Quellbereiche: `src/app/api/stripe/**`, `src/lib/stripe.ts`, `src/app/pricing/**`, `src/app/checkout/**`, `src/components/Pricing.tsx`, `PreregisterForm.tsx`, Admin-Payment/CRM-Komponenten, `src/lib/analytics.ts`, `GoogleAnalytics.tsx`, `CookieConsent.tsx`.

## Community und öffentliche Inhalte

- Forum-Posts, Kommentare, Likes und Moderation
- Community-Feeds, öffentliche Community-Profile
- Peer Challenges und Leaderboards als soziale Funktionen
- Marketing-Landingpage, Hero, CTA, Roadmap und Case-Study-Präsentation
- Impressum, AGB und öffentliche Datenschutzseiten der SaaS-Plattform

Quellbereiche: `src/app/community/**`, `src/app/api/forum/**`, `migrations/002_community_forum.sql`, öffentliche Landingpage-Komponenten und Marketingmedien.

## Academy und Gamification

Nicht Bestandteil des neuen Tools sind:

- Kurse, Wochen, Levels, Lessons, Quizzes, Boss Fights und Skill Tree
- Szenario-Simulationen als Lernspiel
- Spaced Repetition und Achievement Engine
- XP, Badges, Rankings und Academy-Navigation

Ausnahme: Die Tradingjournal- und Reflexionsjournal-Funktionen liegen organisatorisch unter `academy`, sind aber eigenständige fachliche Werkzeuge. Diese werden als Referenz berücksichtigt. Auch einzelne statische Trading-Setup- oder Bias-Definitionen können später als konfigurierbare Journaltaxonomie dienen, nicht als Academy-Modul.

## Cloud- und Deploymentkopplungen

- Neon als zwingende Cloud-Datenbank
- Vercel-spezifische Runtime-/Cache-Annahmen
- Upstash Redis als zwingender Rate Limiter
- serverseitige SaaS-Session- und Subscription-Checks
- Git-Commits von persönlichen Daten oder Anhängen durch Scheduler

Das Ziel bleibt lokal-first. GitHub Actions darf später nur für Tests und optional öffentliche, lizenzkonforme Referenzdaten genutzt werden. Persönliche Trades, Anhänge, Secrets und lokale Datenbanken dürfen nie committed werden.

## Nicht zu übernehmende Daten

- bestehende Nutzer-, Kunden-, Payment-, Subscriber- oder Profildaten
- Quell-`.env`-, Token- oder Credential-Dateien
- getrackte Economic-/COT-/Retail-Caches als Startdatenbestand
- das simulierte Retail-Sentiment
- Screenshots, Reports oder Brokerdateien aus dem Quell-Repository
- Marketing- und Academy-Medien

## Abhängigkeitsbereinigung

Damit entfallen im Ziel voraussichtlich NextAuth, bcrypt, Stripe, Resend, Upstash Redis, Google Analytics, PostgreSQL/Neon und Stealth-Browserautomation als Kernabhängigkeiten. Ein optionaler Browseradapter darf nur isoliert, rate-limitiert und nach dokumentierter Terms-/robots-Prüfung existieren.
