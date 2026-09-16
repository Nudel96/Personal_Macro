"""Audit the reviewed public WIPO export; never publish the raw numerical dataset.

Run after saving the public CSV and its download metadata in the ignored review
directory. The resulting catalog contains identities and definitions only.
"""
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'apps/desktop/.tmp/atlas-validation/innovation'
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
RAW_SHA = 'c7e93cd7ad4b9305190f5cb72c899ef854771209794c3025621859c94de84f48'
RELEASE = 'Source: WIPO statistics database. Last updated: May 2026'
GROUPS = [
    ('digital', 'Digitales und Halbleiter', [3, 4, 5, 6, 7, 8]),
    ('electrical', 'Elektrotechnik und Messung', [1, 2, 9, 10, 12]),
    ('medicine', 'Medizin und Biotechnologie', [11, 13, 15, 16]),
    ('materials', 'Chemie und Materialien', [14, 17, 19, 20, 21, 22]),
    ('processes', 'Verfahren und Umwelt', [18, 23, 24, 30]),
    ('machines', 'Maschinen und Fertigung', [25, 26, 27, 28, 29, 31]),
    ('everyday', 'Verkehr, Bau und Alltag', [32, 33, 34, 35, 0]),
]
LABELS = [
    'Nicht zugeordnet', 'Elektrische Maschinen, Geräte und Energie',
    'Audiovisuelle Technik', 'Telekommunikation', 'Digitale Kommunikation',
    'Grundlegende Kommunikationstechnik', 'Computertechnik',
    'IT-Verfahren für Geschäftsprozesse', 'Halbleiter', 'Optik', 'Messtechnik',
    'Analyse biologischer Materialien', 'Steuerung und Regelung', 'Medizintechnik',
    'Organische Feinchemie', 'Biotechnologie', 'Pharmazeutika',
    'Makromolekulare Chemie und Polymere', 'Lebensmittelchemie',
    'Grundstoffchemie', 'Materialien und Metallurgie',
    'Oberflächentechnik und Beschichtung', 'Mikrostruktur- und Nanotechnologie',
    'Chemische Verfahrenstechnik', 'Umwelttechnik', 'Handhabung und Fördertechnik',
    'Werkzeugmaschinen', 'Motoren, Pumpen und Turbinen', 'Textil- und Papiermaschinen',
    'Andere Spezialmaschinen', 'Thermische Verfahren und Apparate',
    'Mechanische Bauelemente', 'Transport', 'Möbel und Spiele',
    'Andere Konsumgüter', 'Bauwesen',
]

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def main():
    raw = (OUT / 'current-publications.csv').read_bytes()
    download = read(OUT / 'current-publications-download.json')
    assert hashlib.sha256(raw).hexdigest() == RAW_SHA == download['sha256']
    lines = raw.decode('utf-8-sig').splitlines()
    assert lines[:6] == ['Intellectual property right :Patent', '',
                         'Indicator :4a- Patent publications by technology', '', RELEASE, '']
    table = list(csv.reader(io.StringIO('\n'.join(lines[6:]))))
    assert table[0] == ['Origin', 'Origin (Code)', 'Office', 'Field of technology'] + [str(y) for y in range(1980, 2025)]
    records = table[1:]
    assert len(records) == 5645
    crosswalk = {a['iso2']: a for a in read(ROOT / 'docs/planning/world-atlas/catalogs/geographies.json')['areas'] if a.get('iso2')}
    geography = {a['id']: a for a in read(DATA / 'catalog.json')['geographies']}
    historical = {'AN', 'CS', 'DD', 'SU', 'YU', 'ZR'}
    origins, fields, keys = {}, {}, set()
    source_count = current_count = current_rows = 0
    numeric_by_area = {}
    for row in records:
        assert len(row) == 50 and row[-1] == '' and row[2] == 'Total'
        label, code, _, field = row[:4]
        field_id = 0 if field == 'Unknown' else int(field.split(' - ')[0])
        assert 0 <= field_id <= 35 and (code, field_id) not in keys
        keys.add((code, field_id))
        assert origins.setdefault(code, label) == label
        assert fields.setdefault(field_id, field) == field
        values = row[4:-1]
        assert any(values)
        assert all(v == '' or (v.isascii() and v.isdigit() and int(v) <= 9007199254740991) for v in values)
        count = sum(v != '' for v in values)
        source_count += count
        if code not in historical:
            current_count += count
            current_rows += 1
            numeric_by_area[code] = numeric_by_area.get(code, 0) + count
    assert len(origins) == 205 and set(fields) == set(range(36))
    assert set(download['requestedOrigins']) - set(origins) == {'NU', 'TL'}
    areas = []
    for code in sorted(set(origins) - historical):
        a = crosswalk[code]
        assert geography[a['id']]['iso3'] == a['iso3']
        areas.append({'code': code, 'label': origins[code], 'geographyId': a['id'], 'iso3': a['iso3']})
    assert len(areas) == 199
    config = {
        'datasetId': 'wipo-technology', 'recipe': 'wipo-publications-origin-v1',
        'release': 'WIPO Statistics Database · Mai 2026', 'sourceRelease': RELEASE,
        'sourceUrl': 'https://www.wipo.int/en/web/ip-statistics',
        'methodologyUrl': 'https://www.wipo.int/en/web/ip-statistics/about',
        'reportUrl': 'https://www.wipo.int/web-publications/world-intellectual-property-indicators-2025-highlights/en/patents-highlights.html',
        'releaseUrl': 'https://api.ipstatsdc.deda.prd.web1.wipo.int/api/v1/public/ips-search/en/last-updated',
        'url': download['url'], 'bytes': len(raw), 'sha256': RAW_SHA,
        'firstYear': 1980, 'lastYear': 2024, 'defaultThrough': 2023,
        'expectedRows': len(records), 'expectedNumericCells': source_count,
        'expectedCurrentNumericCells': current_count,
        'requestedOrigins': download['requestedOrigins'], 'absentOrigins': ['NU', 'TL'],
        'excludedOrigins': [{'code': c, 'label': origins[c]} for c in sorted(historical)],
        'areas': areas,
        'groups': [{'id': i, 'label': label} for i, label, _ in GROUPS],
        'metrics': [{'id': str(i), 'field': str(i), 'label': LABELS[i], 'sourceLabel': fields[i],
                     'group': next(g for g, _, ids in GROUPS if i in ids)} for i in range(36)],
    }
    write(DATA / 'innovation-catalog.json', config)
    audit = {
        'source': 'WIPO Statistics Database', 'release': RELEASE, 'url': download['url'],
        'sha256': RAW_SHA, 'bytes': len(raw), 'rows': len(records), 'currentRows': current_rows,
        'numericCells': source_count, 'currentNumericCells': current_count,
        'currentMissingCells': len(areas) * 45 * 36 - current_count,
        'profiles': len(areas), 'fields': len(fields), 'years': [1980, 2024],
        'excludedOrigins': config['excludedOrigins'], 'absentOrigins': config['absentOrigins'],
        'mapping': areas, 'numericCellCountsByOrigin': numeric_by_area,
        'meaning': 'Patent publications by technology; provider Total by applicant origin retained. No invented world total, successor-state splicing, valuation, unique-invention count or missing-to-zero conversion.',
        'freshness': 'Current export and release metadata require Accept-Language: en. The older public bulk ZIP ends in 2022 and is not a fallback.',
        'boundary': '2024 is an editorially flagged boundary year, not a source per-cell preliminary flag. WIPI 2025 technology discussion uses 2023 because of publication delay.',
    }
    write(Path(__file__).with_name('innovation-source-audit.json'), audit)
    print(json.dumps({k: audit[k] for k in ['rows', 'profiles', 'numericCells', 'currentNumericCells', 'currentMissingCells']}))

if __name__ == '__main__':
    main()
