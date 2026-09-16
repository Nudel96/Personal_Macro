"""Independently validate the complete revised WGI workbook and its territorial identities."""
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
TEMP = ROOT / 'apps/desktop/.tmp/atlas-remaining-40'
EVIDENCE = Path(__file__).parent
raw = (TEMP / 'WGI2025.xlsx').read_bytes()
review = json.loads((TEMP / 'WGI2025-inspection.json').read_text(encoding='utf8'))
assert hashlib.sha256(raw).hexdigest() == review['sha256']
geos = {g['iso3']: g for g in json.loads((DATA / 'catalog.json').read_text(encoding='utf8'))['geographies'] if g.get('iso3')}
book = openpyxl.load_workbook(TEMP / 'WGI2025.xlsx', read_only=True, data_only=True)
assert book.sheetnames == ['va','pv','ge','rq','rl','cc']
headers = review['sheets']['va']['firstRows'][0]
profiles = defaultdict(list)
labels, seen, excluded = {}, set(), defaultdict(int)
rows_count = 0
names = {
 'va': ('Stimme und Rechenschaft', 'Wahrnehmungen politischer Teilhabe, Meinungs- und Vereinigungsfreiheit sowie Medienfreiheit.'),
 'pv': ('Politische Stabilität und Gewalt', 'Wahrnehmungen des Risikos politischer Instabilität und politisch motivierter Gewalt einschließlich Terrorismus.'),
 'ge': ('Wirksamkeit staatlichen Handelns', 'Wahrnehmungen der Qualität öffentlicher Dienstleistungen, der Verwaltung, der Politikgestaltung und ihrer Umsetzung sowie der Glaubwürdigkeit staatlicher Zusagen.'),
 'rq': ('Regulierungsqualität', 'Wahrnehmungen der Fähigkeit des Staates, tragfähige Regeln zu formulieren und umzusetzen, die privatwirtschaftliche Entwicklung ermöglichen.'),
 'rl': ('Rechtsstaatlichkeit', 'Wahrnehmungen von Vertrauen in Regeln und deren Einhaltung, unter anderem Verträge, Eigentumsrechte, Polizei und Gerichte.'),
 'cc': ('Korruptionskontrolle', 'Wahrnehmungen darüber, wie weit öffentliche Macht für private Vorteile genutzt wird und wie wirksam deren Begrenzung ist.'),
}
for sheet in book:
 iterator = iter(sheet.values)
 assert list(next(iterator)) == headers
 for row in iterator:
  rows_count += 1
  ident, label, code, year, dim = row[0], row[1], row[2], row[5], row[6]
  assert dim == sheet.title and ident == f'{code}{dim}{year}'
  assert isinstance(year, int) and 1996 <= year <= 2024
  assert (code,dim,year) not in seen
  seen.add((code,dim,year))
  assert labels.setdefault(code,label) == label
  assert isinstance(row[7], int) and 1 <= row[7] <= 35
  assert all(isinstance(row[i], (float,int)) and math.isfinite(row[i]) for i in range(8,16))
  assert 0 <= row[14] <= row[12] <= row[15] <= 100
  assert row[9] >= 0 and row[13] >= 0
  if code == 'ANT':
   assert label == 'Netherlands Antilles (former)'
   excluded[code] += 1
   continue
  iso = 'AND' if code == 'ADO' else code
  assert iso in geos, (code,label)
  if code == 'ADO': assert label == 'Andorra'
  profiles[(code,dim)].append({'year': year, 'score': row[12], 'lower90': row[14], 'upper90': row[15], 'sourceCount': row[7]})
areas = []
for code in sorted(set(c for c,_ in profiles)):
 areas.append({'code': code, 'label': labels[code], 'geographyId': geos['AND' if code == 'ADO' else code]['id'], 'seriesTitles': {dim: f'Governance score (0-100) · {dim}' for c,dim in profiles if c == code}})
boundary = 'WGI-Modell aus Befragungen und Expertenschätzungen; kein direkt gemessener Zustand und keine politische Bewertung des Atlas. Absolute Skala 0–100 mit festen Referenzpunkten, kein Länder-Perzentil. Senkrechte Balken zeigen das veröffentlichte 90%-Unsicherheitsintervall. Überlappende Intervalle erlauben keine sichere Rang- oder Änderungsbehauptung. Die methodisch revidierte Ausgabe 2025 wird nur mit ihrer neu berechneten Geschichte verwendet.'
source = {'id': 'worldbank-wgi', 'label': 'Weltbank · Institutionelle Indikatoren', 'adapter': 'worldbank_wgi', 'url': review['url'], 'documentationUrl': 'https://www.worldbank.org/en/publication/worldwide-governance-indicators', 'licenseUrl': 'https://datacatalog.worldbank.org/search/dataset/0038026/worldwide-governance-indicators', 'publishedAt': '2026-03-11', 'reviewedAt': '2026-09-11', 'recipe': 'wgi-2025-revision-absolute-score-v1', 'observationKind': 'perception_index', 'expectedSha256': review['sha256'], 'expectedRows': rows_count, 'expectedNumeric': sum(len(p) for p in profiles.values()), 'firstPeriod': '1996', 'lastPeriod': '2024', 'areas': areas}
metrics = [{'id': f'worldbank-wgi:{dim}', 'sourceId': source['id'], 'topicId': 'institutions:institutional_indicators', 'providerCode': dim, 'label': name, 'unit': 'Punkte auf der absoluten WGI-Skala (0–100)', 'frequency': 'annual', 'kind': 'numeric', 'comparison': 'same_definition', 'connectAdjacent': True, 'explanation': meaning, 'scopeNote': boundary} for dim,(name,meaning) in names.items()]
audit = {'reviewedAt': '2026-09-11', 'source': source, 'headers': headers, 'allAreaLabels': labels, 'excludedAreas': dict(excluded), 'aliases': {'ADO': {'iso3':'AND', 'meaning':'Andorra, original WGI economy code ADO'}}, 'profiles': [{'providerArea': c, 'metric': dim, 'count': len(v), 'first': sorted(v,key=lambda p:p['year'])[0], 'last': sorted(v,key=lambda p:p['year'])[-1]} for (c,dim),v in profiles.items()]}
(EVIDENCE / 'public-wgi-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf8')
(DATA / 'public-wgi-contract.json').write_text(json.dumps({'headers':headers,'areaLabels':labels,'dimensions':list(names),'excludedArea':'ANT'}, ensure_ascii=False, indent=2), encoding='utf8')
catalog = json.loads((DATA / 'public-series-catalog.json').read_text(encoding='utf8'))
catalog['sources'] = [s for s in catalog['sources'] if s['id'] != source['id']] + [source]
catalog['metrics'] = [m for m in catalog['metrics'] if m['sourceId'] != source['id']] + metrics
catalog['version'] = '2026-09-11.3'
(DATA / 'public-series-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf8')
ledger = json.loads((EVIDENCE / 'remaining-40-ledger.json').read_text(encoding='utf8'))
item = next(t for t in ledger['topics'] if t['id'] == metrics[0]['topicId'])
item['status'] = 'source_validated'
item['research'] = [{'sourceId':source['id'],'documentationUrl':source['documentationUrl'],'originalUrl':source['url'],'reviewedAt':'2026-09-11','evidence':'public-wgi-audit.json','areaCount':len(areas),'values':source['expectedNumeric'],'boundary':boundary}]
(EVIDENCE / 'remaining-40-ledger.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf8')
print('WGI',len(areas),'areas',len(profiles),'profiles',rows_count,'original rows',source['expectedNumeric'],'selected scores; historical Antilles excluded',dict(excluded))
