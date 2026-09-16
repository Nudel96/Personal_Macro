"""Validate the reviewed public ILO CSV and catalog, without redistributing data."""
import csv
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
RAW = ROOT / 'apps/desktop/.tmp/atlas-validation/labor/employment.csv'


def main():
    cfg = json.loads((DATA / 'labor-catalog.json').read_text(encoding='utf-8'))
    catalog = json.loads((DATA / 'catalog.json').read_text(encoding='utf-8'))
    raw = RAW.read_bytes()
    assert len(raw) == cfg['bytes'] and hashlib.sha256(raw).hexdigest() == cfg['sha256']
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    areas = {a['code']: a for a in cfg['areas'] + cfg['excludedAreas']}
    mapped = {a['code']: a for a in cfg['areas']}
    geographies = {g['id']: g for g in catalog['geographies']}
    assert len(mapped) == len({a['geographyId'] for a in mapped.values()}) == 190
    for a in mapped.values():
        assert geographies[a['geographyId']]['iso3'] == a['iso3']
    fields = {m['field']: m['sourceLabel'] for m in cfg['metrics']}
    fields[cfg['totalField']] = cfg['totalLabel']
    cells = {}; years = defaultdict(set); flags = Counter(); imported = 0
    for r in rows:
        a = areas[r['ref_area']]
        assert (r['ref_area.label'], r['source']) == (a['label'], a['source'])
        assert r['source.label'] == 'ILO - Modelled Estimates'
        assert r['indicator'] == 'EMP_2EMP_SEX_ECO_NB' and r['indicator.label'] == cfg['sourceRelease']
        assert r['sex'] == 'SEX_T' and r['sex.label'] == 'Total'
        assert fields[r['classif1']] == r['classif1.label']
        assert (r['obs_status'], r['obs_status.label']) in [('', ''), ('A', 'Adjusted')]
        year = int(r['time']); assert 1991 <= year <= 2024
        number = Decimal(r['obs_value']) * 1000
        assert number >= 0 and number == int(number) and number < 2**53
        key = (r['ref_area'], year, r['classif1']); assert key not in cells
        cells[key] = int(number); years[r['ref_area']].add(year)
        if r['ref_area'] in mapped:
            imported += 1; flags[r['obs_status']] += 1
    assert set(years) == set(areas) and len(cells) == cfg['expectedRows'] == 140625
    assert imported == cfg['expectedCurrentNumericCells'] == 96765
    deviations = []
    for area, yy in years.items():
        for year in yy:
            total = cells[area, year, cfg['totalField']]
            values = [cells[area, year, m['field']] for m in cfg['metrics']]
            assert all(v <= total for v in values)
            deviations.append(abs(sum(values) - total))
    report = {'status': 'passed', 'sourceSha256': cfg['sha256'], 'sourceBytes': len(raw),
              'sourceRows': len(rows), 'sourceAreas': len(areas), 'mappedProfiles': len(mapped),
              'countryTerritoryProfiles': 188, 'providerAggregates': ['X01', 'X06'],
              'excludedAreas': len(cfg['excludedAreas']), 'metrics': 14,
              'exactNumericCells': imported, 'missingCalendarCells': 190*34*15-imported,
              'flags': dict(flags), 'incompleteYears': {k: sorted(set(range(1991,2025))-v) for k,v in years.items() if len(v)<34},
              'largestPublishedComponentSumDifferencePeople': max(deviations),
              'rebalancedByApp': False, 'containsValuation': False}
    Path(__file__).with_name('labor-source-audit.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
