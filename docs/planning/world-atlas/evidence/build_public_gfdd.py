"""Audit the September 2022 GFDD concentration workbook without current-weight backcasts."""
import hashlib
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import openpyxl

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
RAW = ROOT / 'apps/desktop/.tmp/atlas-remaining-40'
ID = 'worldbank-gfdd-concentration'
FILE = 'worldbank-gfdd-2022.xlsx'
URL = 'https://thedocs.worldbank.org/en/doc/5882f2b2117b882d58a78f9c64ea3613-0050062022/original/20220909-global-financial-development-database.xlsx'
VERSION = '2026-09-11.18'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def read(p):
    return json.loads(p.read_text(encoding='utf-8'))


def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


book = openpyxl.load_workbook(RAW / FILE, data_only=True, read_only=True)
archive = ZipFile(RAW / FILE)
raw_cells = {}
with archive.open('xl/worksheets/sheet3.xml') as stream:
    for _, e in ET.iterparse(stream, events=('end',)):
        if e.tag == NS + 'c':
            address = e.attrib['r']
            if address.startswith(('AR', 'AS')) and e.attrib.get('t') not in ('s', 'inlineStr'):
                v = e.find(NS + 'v')
                if v is not None:
                    assert e.find(NS + 'f') is None and address not in raw_cells
                    raw_cells[address] = v.text
            e.clear()
        elif e.tag == NS + 'row':
            e.clear()
sheet = book['Data - August 2022']
rows = list(sheet.iter_rows(values_only=True))
header = list(rows[0])
assert (sheet.max_row, sheet.max_column) == (13269, 115)
assert header[:7] == ['iso3', 'iso2', 'imfn', 'country', 'region', 'income', 'year']
assert header[43:45] == ['am01', 'am02']
meta_rows = {str(r[1]): list(r) for r in book['Metadata'].iter_rows(values_only=True) if r[1]}
scope = (
    'Weltbank GFDD, Archiv September 2022, Originaldaten der World Federation of Exchanges. '
    'Historische Anteile außerhalb der jeweiligen zehn größten beziehungsweise meistgehandelten Unternehmen, '
    'Quellenjahre 1998–2020. Niedrigere Anteile bedeuten eine stärkere Konzentration auf die jeweilige Top-10-Gruppe. '
    'Börsendeckung und Länderabgrenzung folgen der Quelle; keine vollständige Messung des Wettbewerbs in einer Volkswirtschaft, '
    'kein aktuelles Fondsportfolio und keine faire Bewertung. Fehlende Jahre werden nicht ergänzt. '
    'Originalanteile werden weder umgekehrt noch neu gewichtet; Quelle und deutsche Erläuterung bleiben getrennt.'
)
definitions = [
    ('am02', 'AS', 'GFDD.AM.02', 39, 'Börsenmarkt · Marktwert außerhalb der Top 10',
     'Welcher Anteil des veröffentlichten Börsenmarktwerts auf Unternehmen außerhalb der zehn größten entfällt.',
     'Marktkapitalisierung außerhalb der zehn größten Unternehmen. Keine historischen Gewichte eines bestimmten Index oder Fonds.'),
    ('am01', 'AR', 'GFDD.AM.01', 38, 'Börsenmarkt · Handel außerhalb der Top 10',
     'Welcher Anteil des gehandelten Aktienwerts auf Unternehmen außerhalb der zehn meistgehandelten entfällt.',
     'Handelswert außerhalb der zehn meistgehandelten Unternehmen; die Quelle bildet für mehrere Börsen eines Landes einen einfachen Mittelwert, keinen nach Handelswert gewichteten Gesamtanteil.'),
]
metrics, columns = [], []
for code, col, provider, meta_row, label, explanation, note in definitions:
    original = meta_rows[provider]
    assert original[5] == '1998-2020' and original[6] == 'World Federation of Exchanges'
    metrics.append({'id': ID + ':' + code, 'sourceId': ID, 'topicId': 'market_context:market_concentration',
                    'providerCode': code, 'label': label, 'unit': 'Anteil außerhalb der Top 10 (%)',
                    'frequency': 'annual', 'kind': 'source_statistic', 'comparison': 'same_definition',
                    'connectAdjacent': True, 'explanation': explanation, 'scopeNote': note + ' ' + scope})
    columns.append({'code': code, 'column': col, 'index': header.index(code), 'metadataRow': meta_row,
                    'metadata': original, 'note': note})

geos = {g['iso3']: g for g in read(DATA / 'catalog.json')['geographies'] if g.get('iso3')}
data = defaultdict(dict)
identities, seen, numeric = {}, set(), 0
for row_num, r in enumerate(rows[1:], 2):
    iso, label, year = r[0], r[3], r[6]
    assert isinstance(iso, str) and len(iso) == 3 and isinstance(label, str)
    assert isinstance(year, int) and 1960 <= year <= 2021 and (iso, year) not in seen
    seen.add((iso, year))
    assert identities.setdefault(iso, label) == label
    for c in columns:
        value = r[c['index']]
        raw = raw_cells.get(c['column'] + str(row_num))
        assert (raw is None) == (value is None)
        if raw is not None:
            assert 1998 <= year <= 2020 and isinstance(value, (int, float))
            assert Decimal(raw).is_finite() and 0 <= Decimal(raw) <= 100
            assert float(raw) == value
            numeric += 1
        if 1998 <= year <= 2020:
            data[(iso, c['code'])][year] = raw
assert len(rows) - 1 == 13268 and numeric == 1829 and len(identities) == 214
profiles, by_area = [], {}
for (iso, code), values in sorted(data.items()):
    if all(n is None for n in values.values()):
        continue
    g = geos[iso]
    assert g['kind'] in ('area', 'provider_area') and g['iso3'] == iso
    metric = next(m for m in metrics if m['providerCode'] == code)
    column = next(c for c in columns if c['code'] == code)
    title = column['metadata'][2]
    area = by_area.setdefault(iso, {'code': iso, 'label': identities[iso], 'geographyId': g['id'], 'seriesTitles': {}})
    area['seriesTitles'][code] = title
    points = [{'period': str(y), 'value': values[y], 'status': 'GFDD-Archiv September 2022' if values[y] is not None else 'Kein veröffentlichter Zahlenwert',
               'breakBefore': False, 'notes': [column['note']], 'lowerBound': None, 'upperBound': None} for y in range(1998, 2021)]
    profiles.append({'metricId': metric['id'], 'geographyId': g['id'], 'providerArea': iso,
                     'providerLabel': identities[iso], 'providerTitle': title, 'unit': metric['unit'], 'points': points})
profiles.sort(key=lambda p: (p['metricId'], p['geographyId']))
source = {'id': ID, 'label': 'Weltbank GFDD · Börsenkonzentration · Archiv 2022', 'adapter': 'gfdd_concentration',
          'url': URL, 'documentationUrl': 'https://www.worldbank.org/en/publication/gfdr/data/global-financial-development-database',
          'licenseUrl': 'https://datacatalog.worldbank.org/public-licenses', 'publishedAt': '2022-09', 'reviewedAt': '2026-09-11',
          'recipe': 'gfdd-20220909-original-am01-am02-through2020-v1', 'observationKind': 'source_statistics',
          'expectedSha256': hashlib.sha256((RAW / FILE).read_bytes()).hexdigest(), 'expectedRows': 13268,
          'expectedNumeric': numeric, 'firstPeriod': '1998', 'lastPeriod': '2020', 'areas': list(by_area.values())}
contract = {'sourceId': ID, 'file': FILE, 'sheetNames': book.sheetnames, 'sheet': sheet.title,
            'dataXml': 'xl/worksheets/sheet3.xml', 'header': header, 'columns': columns,
            'sourceCountries': identities, 'zipEntries': len(archive.infolist()),
            'uncompressedBytes': sum(f.file_size for f in archive.infolist())}
catalog = read(DATA / 'public-series-catalog.json')
catalog['sources'] = [s for s in catalog['sources'] if s['id'] != ID] + [source]
catalog['metrics'] = [m for m in catalog['metrics'] if m['sourceId'] != ID] + metrics
catalog['version'] = VERSION
write(DATA / 'public-series-catalog.json', catalog)
main = read(DATA / 'catalog.json'); main['version'] = VERSION; write(DATA / 'catalog.json', main)
write(DATA / 'public-gfdd-contract.json', contract)
write(RAW / 'gfdd-expected-profiles.json', profiles)
write(HERE / 'public-gfdd-audit.json', {'reviewedAt': '2026-09-11', 'source': source, 'contract': contract,
      'profiles': len(profiles), 'numeric': numeric, 'missing': sum(p['value'] is None for a in profiles for p in a['points']),
      'originalDecimalsPreserved': True, 'metadataRows': [c['metadata'] for c in columns],
      'excluded': 'November 2021 worksheet, all unrelated financial indicators and wholly empty countries. No world/continent aggregation or current-weight backcast.'})
ledger = read(HERE / 'remaining-40-ledger.json')
topic = next(t for t in ledger['topics'] if t['id'] == 'market_context:market_concentration')
topic['research'] = [{'sourceId': ID, 'reviewedAt': '2026-09-11', 'evidence': 'public-gfdd-audit.json'}]
if topic['status'] == 'research_pending': topic['status'] = 'source_validated'
write(HERE / 'remaining-40-ledger.json', ledger)
print(json.dumps({'source': ID, 'profiles': len(profiles), 'areas': len(by_area), 'numeric': numeric,
                  'missing': sum(p['value'] is None for a in profiles for p in a['points'])}))
