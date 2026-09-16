"""Audit genuine OECD source rows and generate only explicitly selected annual series."""
import csv
import hashlib
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
TEMP = ROOT / 'apps/desktop/.tmp/atlas-remaining-40'
EVIDENCE = Path(__file__).parent
geos = {g['iso3']: g for g in json.loads((DATA / 'catalog.json').read_text(encoding='utf8'))['geographies'] if g.get('iso3')}
catalog = json.loads((DATA / 'public-series-catalog.json').read_text(encoding='utf8'))
contracts = {}
metric_specs = {
 'oecd-wages': [('real_ppp', 'Realer durchschnittlicher Jahreslohn', 'USD zu Preisen und Kaufkraftparitäten von 2025', 'Durchschnittlicher Bruttojahreslohn je abhängig Beschäftigtem in Vollzeitäquivalenten. Die OECD bereinigt die Reihe um den Preisdeflator des privaten Konsums und rechnet mit Kaufkraftparitäten von 2025 um.', 'Durchschnitt, kein Median und kein verfügbares Haushaltseinkommen. Änderungen der Beschäftigtenstruktur können den Durchschnitt verändern. Basis 2025; frühere Ausgaben mit anderer Preisbasis werden nicht vermischt.')],
 'oecd-hours': [('_T', 'Tatsächliche Arbeitszeit je Erwerbstätigem', 'Stunden pro Jahr je Erwerbstätigem', 'Veröffentlichter Durchschnitt der tatsächlich geleisteten Jahresstunden für alle Erwerbstätigen, einschließlich Vollzeit, Teilzeit, zusätzlichen Tätigkeiten und Selbständigen.', 'Die OECD empfiehlt wegen unterschiedlicher Quellen und Methoden vor allem Zeitvergleiche innerhalb eines Landes. Urlaub, Feiertage und krankheitsbedingte Abwesenheit zählen nicht als geleistete Arbeit. Jahresstunden sind keine übliche Wochenarbeitszeit.'), ('ICSE93_1', 'Tatsächliche Arbeitszeit je Arbeitnehmer', 'Stunden pro Jahr je Arbeitnehmer', 'Veröffentlichter Durchschnitt tatsächlich geleisteter Jahresstunden abhängig Beschäftigter; getrennt von der Reihe für alle Erwerbstätigen.', 'Abhängig Beschäftigte; keine Selbständigen. Unterschiede im Teilzeitanteil und nationale Methoden begrenzen direkte Niveauvergleiche. Die Reihe enthält keine Aussage zu Produktivität oder Einkommen.')]
}
for name in metric_specs:
 path = TEMP / f'{name}.csv'
 raw = path.read_bytes()
 inspection = json.loads((TEMP / f'{name}-inspection.json').read_text(encoding='utf8'))
 assert hashlib.sha256(raw).hexdigest() == inspection['sha256']
 rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
 fixed = {k: v[0] for k, v in inspection['dimensions'].items() if len(v) == 1 and k not in ['REF_AREA', 'Reference area']}
 profiles = defaultdict(list)
 labels = {}
 excluded = defaultdict(int)
 seen = set()
 for row in rows:
  assert all(row[k] == v for k,v in fixed.items())
  code, label = row['REF_AREA'], row['Reference area']
  assert code in geos or code == 'OECD', (code, label)
  assert labels.setdefault(code, label) == label
  year = row['TIME_PERIOD']
  assert year.isdigit() and 1950 <= int(year) <= 2025
  value = Decimal(row['OBS_VALUE']) if row['OBS_VALUE'] else None
  assert value is None or (value.is_finite() and value >= 0)
  assert row['OBS_STATUS'] == 'A'
  if name == 'oecd-wages':
   assert row['PRICE_BASE'] in ['Q', 'V']
   assert row['BASE_PER'] == ('2025' if row['PRICE_BASE'] == 'Q' else '')
   key = (code, row['UNIT_MEASURE'], row['PRICE_BASE'], year)
   selected = row['UNIT_MEASURE'] == 'USD_PPP' and row['PRICE_BASE'] == 'Q'
   metric = 'real_ppp'
  else:
   assert row['WORKER_STATUS'] in ['_T', 'ICSE93_1']
   key = (code, row['WORKER_STATUS'], year)
   metric, selected = row['WORKER_STATUS'], True
  assert key not in seen, key
  seen.add(key)
  if code == 'OECD':
   excluded[code] += 1
   continue
  if selected:
   profiles[(code, metric)].append((year, row['OBS_VALUE'] or None))
 topic = 'labor:wages' if name == 'oecd-wages' else 'labor:working_hours'
 metrics = [{'id': f'{name}:{code}', 'sourceId': name, 'topicId': topic, 'providerCode': code, 'label': label, 'unit': unit, 'frequency': 'annual', 'kind': 'numeric', 'comparison': 'within_country' if name == 'oecd-hours' else 'same_definition', 'connectAdjacent': True, 'explanation': description, 'scopeNote': boundary} for code,label,unit,description,boundary in metric_specs[name]]
 areas = []
 for code in sorted(set(c for c,_ in profiles)):
  titles = {m: ('Average annual wages · USD_PPP · Constant prices · 2025' if name == 'oecd-wages' else 'Average annual hours actually worked per worker · ' + ('Total' if m == '_T' else 'Employees')) for c,m in profiles if c == code}
  areas.append({'code': code, 'label': labels[code], 'geographyId': geos[code]['id'], 'seriesTitles': titles})
 source = {'id': name, 'label': 'OECD · Reallöhne' if name == 'oecd-wages' else 'OECD · Arbeitszeit', 'adapter': name.replace('-', '_'), 'url': inspection['url'], 'documentationUrl': 'https://www.oecd.org/en/data/indicators/' + ('average-annual-wages.html' if name == 'oecd-wages' else 'hours-worked.html'), 'licenseUrl': 'https://www.oecd.org/en/about/terms-conditions.html', 'publishedAt': 'nicht angegeben', 'reviewedAt': '2026-09-11', 'recipe': name + '-2025-source-20260911-v1', 'observationKind': 'source_statistics', 'expectedSha256': inspection['sha256'], 'expectedRows': len(rows), 'expectedNumeric': sum(value is not None for values in profiles.values() for _,value in values), 'firstPeriod': min(y for values in profiles.values() for y,_ in values), 'lastPeriod': max(y for values in profiles.values() for y,_ in values), 'areas': areas}
 audit = {'reviewedAt': '2026-09-11', 'source': source, 'headers': inspection['headers'], 'fixedFields': fixed, 'sourceAreaLabels': labels, 'dimensions': inspection['dimensions'], 'excludedAreas': dict(excluded), 'profiles': [{'providerArea': c, 'metric': m, 'count': len(v), 'first': sorted(v)[0], 'last': sorted(v)[-1]} for (c,m),v in profiles.items()]}
 (EVIDENCE / f'public-{name}-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf8')
 catalog['sources'] = [s for s in catalog['sources'] if s['id'] != name] + [source]
 catalog['metrics'] = [m for m in catalog['metrics'] if m['sourceId'] != name] + metrics
 contracts[name] = {'headers': inspection['headers'], 'fixedFields': fixed, 'areaLabels': labels, 'allowedDimensions': inspection['dimensions']}
 print(name, 'areas', len(areas), 'series', len(profiles), 'values', source['expectedNumeric'], 'range', source['firstPeriod'], source['lastPeriod'])
 ledger = json.loads((EVIDENCE / 'remaining-40-ledger.json').read_text(encoding='utf8'))
 item = next(t for t in ledger['topics'] if t['id'] == topic)
 item['status'] = 'source_validated'
 item['research'] = [{'sourceId': name, 'documentationUrl': source['documentationUrl'], 'originalUrl': source['url'], 'reviewedAt': '2026-09-11', 'evidence': f'public-{name}-audit.json', 'areaCount': len(areas), 'values': source['expectedNumeric'], 'boundary': metrics[0]['scopeNote']}]
 (EVIDENCE / 'remaining-40-ledger.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf8')
catalog['version'] = '2026-09-11.2'
(DATA / 'public-series-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf8')
(DATA / 'public-oecd-contracts.json').write_text(json.dumps(contracts, ensure_ascii=False, indent=2), encoding='utf8')
