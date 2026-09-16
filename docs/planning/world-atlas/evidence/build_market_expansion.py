"""Build the reviewed country-fund expansion from issuer and EODHD catalogues.

Inputs are public issuer pages and the configured provider's symbol directory,
kept outside git in apps/desktop/.tmp/atlas-gaps. No journal data or API key is
read by this generator. Fund geography is an explicit reviewed mapping.
"""
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
RAW = ROOT / "apps/desktop/.tmp/atlas-gaps"
COUNTRIES = {
    "EWL": "CHE", "EWQ": "FRA", "EWP": "ESP", "EWI": "ITA", "EWN": "NLD",
    "EWO": "AUT", "EWK": "BEL", "EWD": "SWE", "EDEN": "DNK", "ENOR": "NOR",
    "EFNL": "FIN", "EIRL": "IRL", "EPOL": "POL", "TUR": "TUR", "EWW": "MEX",
    "ECH": "CHL", "EPU": "PER", "EWM": "MYS", "EIDO": "IDN", "EPHE": "PHL",
    "THD": "THA", "EWS": "SGP", "EWY": "KOR", "EWT": "TWN", "EWH": "HKG",
    "EIS": "ISR", "KSA": "SAU", "QAT": "QAT", "UAE": "ARE", "ENZL": "NZL",
    "GREK": "GRC", "ARGT": "ARG", "VNM": "VNM",
}

def main():
    catalog = json.loads((DATA / "catalog.json").read_text("utf-8"))
    geos = {g["iso3"]: g for g in catalog["geographies"] if g["iso3"]}
    proxies = json.loads((DATA / "market-proxies.json").read_text("utf-8"))
    provider = {r["Code"]: r for r in json.loads((RAW / "eod-us-etfs.json").read_text("utf-8"))}
    issuer = BeautifulSoup((RAW / "ishares-products.html").read_bytes(), "html.parser")
    limits = "Börsennotierte Unternehmen im Fonds, keine vollständige Volkswirtschaft. USD-Kurse enthalten Wechselkurseinflüsse; Zusammensetzung und Gewichte ändern sich. Auch ausländische Umsätze und je Index im Ausland notierte Unternehmen können enthalten sein."
    additions, proof = [], []
    for ticker, iso in COUNTRIES.items():
        native = provider[ticker]
        assert native["Type"] == "ETF" and native["Currency"] == "USD", native
        geo = geos[iso]
        breaks, extra = [], ""
        if ticker not in {"GREK", "ARGT", "VNM"}:
            a = issuer.find("a", string=ticker)
            row = [c.get_text(" ", strip=True) for c in a.find_parent("tr").find_all("td")]
            name, date = row[1], datetime.strptime(row[6], "%b %d, %Y").strftime("%Y-%m-%d")
            url = "https://www.ishares.com" + a["href"]
            assert name.startswith("iShares MSCI ")
            if ticker == "EPU":
                extra = " Der All-Peru-Fonds schließt auch Unternehmen mit wesentlicher wirtschaftlicher Verbindung zu Peru ein. Er heißt inzwischen Peru and Global Exposure und ist kein reiner Börsenplatz-Index."
        else:
            file = {"GREK": "globalx-grek.html", "ARGT": "globalx-argt.html", "VNM": "vaneck-vnm.html"}[ticker]
            text = BeautifulSoup((RAW / file).read_bytes(), "html.parser").get_text(" ", strip=True)
            match = re.search(r"Inception Date (\d{2}/\d{2}/(?:\d{4}|\d{2}))\b", text)
            assert match, ticker
            date = datetime.strptime(match[1], "%m/%d/%Y" if len(match[1]) == 10 else "%m/%d/%y").strftime("%Y-%m-%d")
            if ticker == "GREK":
                name, url = "Global X MSCI Greece ETF", "https://www.globalxetfs.com/funds/grek"
                assert "changed effective March 1, 2016" in text
                breaks = ["2016-03"]
                extra = " Index- und Strategieänderung am 1. März 2016; die Wellen-Vorlaufzeit beginnt danach neu."
            elif ticker == "ARGT":
                name, url = "Global X MSCI Argentina ETF", "https://www.globalxetfs.com/funds/argt"
                extra = " MSCI All Argentina umfasst auch im Ausland notierte Unternehmen mit wirtschaftlicher Verbindung zu Argentinien."
            else:
                name, url = "VanEck Vietnam ETF", "https://www.vaneck.com/us/en/investments/vietnam-etf-vnm/"
                breaks = ["2023-03"]
                extra = " Seit 17. März 2023 Vietnam Local Index mit lokal gegründeten Unternehmen; davor breiterer MVIS Vietnam Index. Nach dem Strukturwechsel ist die neue Wellenhistorie noch zu kurz."
        additions.append({"id": f"eodhd:{ticker}.US", "symbol": f"{ticker}.US", "label": f"{geo['label']} – Aktienmarkt", "topicIds": ["market_context:country_equities"], "geographyId": geo["id"], "scope": name, "currency": "USD", "issuerUrl": url, "inception": date, "limits": limits + extra, "breaks": breaks})
        proof.append({"symbol": f"{ticker}.US", "geographyId": geo["id"], "iso3": iso, "issuerName": name, "issuerUrl": url, "inception": date, "breaks": breaks, "providerRecord": native})
    new_ids = {p["id"] for p in additions}
    proxies = [p for p in proxies if p["id"] not in new_ids] + additions
    (DATA / "market-proxies.json").write_text(json.dumps(proxies, ensure_ascii=False, indent=2) + "\n", "utf-8")
    files = ["ishares-products.html", "eod-us-etfs.json", "ishares-EPU.html", "globalx-grek.html", "globalx-argt.html", "vaneck-vnm.html", "vaneck-egpt.html"]
    report = {"reviewedAt": "2026-09-15", "additionalMarkets": len(additions), "proxiesTotal": len(proxies), "countriesWithMarketProxy": len({p["geographyId"] for p in proxies if p["geographyId"] != "world"}), "sources": [{"file": f, "bytes": (RAW/f).stat().st_size, "sha256": hashlib.sha256((RAW/f).read_bytes()).hexdigest()} for f in files], "funds": proof, "excluded": [{"symbol": "EGPT.US", "reason": "Die ehemalige Produktseite führt zur offiziellen Schließungsmitteilung. Kein aktueller Länderfonds.", "url": "https://www.vaneck.com/us/en/press-releases/vaneck-announces-changes-to-etf-product-line-egypt-index-etf.pdf/"}]}
    Path(__file__).with_name("market-expansion-sources-2026-09-15.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Added {len(additions)} reviewed country proxies; {len(proxies)} total")

if __name__ == "__main__":
    main()
