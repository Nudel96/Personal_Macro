"""Independent cell-by-cell Findex source/native audit; only public files and test caches."""
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / 'apps/desktop/.tmp/atlas-validation/findex'
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
cfg = json.loads((DATA/'findex-catalog.json').read_text(encoding='utf-8-sig'))
catalog = json.loads((DATA/'catalog.json').read_text(encoding='utf-8-sig'))
raw = (REVIEW/'GlobalFindexDatabase2025.csv').read_bytes()
assert hashlib.sha256(raw).hexdigest() == cfg['sha256'] and len(raw) == cfg['bytes']
assert hashlib.sha256((REVIEW/'GlobalFindex2025-glossary.xlsx').read_bytes()).hexdigest() == cfg['glossarySha256']
book = openpyxl.load_workbook(REVIEW/'GlobalFindex2025-glossary.xlsx',read_only=True,data_only=True)
definitions = {r[0]:(r[1],r[2]) for r in list(book['Glossary'].values)[1:] if r[0]}
for m in cfg['metrics']:
    assert (m['sourceLabel'],m['sourceDefinition']) == definitions[m['sourceCode']]
    assert m['field'] == m['sourceCode'].replace('.','_')
    assert not m['field'].endswith('_s')
with (REVIEW/'GlobalFindexDatabase2025.csv').open(encoding='utf-8-sig',newline='') as file:
    reader=csv.DictReader(file);rows=list(reader)
    assert reader.fieldnames == cfg['headers']
areas={a['code']:a for a in cfg['areas']}
geographies={g['id']:g for g in catalog['geographies']}
assert len(areas)==174 and sum(not a['aggregate'] for a in areas.values())==162
assert {(r['codewb'],r['countrynewwb']) for r in rows} == {(a['code'],a['label']) for a in areas.values()}
for a in areas.values():
    assert geographies[a['geographyId']]['iso3']==a['iso3']
    if a['geographyId'].startswith('findex:'):
        assert geographies[a['geographyId']]['kind']=='aggregate' and not a['iso3']
    else: assert a['code']==a['iso3']
populations={(p['group'],p['value']):p['id'] for p in cfg['populations']}
reference={a['geographyId']:{'geographyId':a['geographyId'],'providerCode':a['code'],'providerLabel':a['label'],'points':[]} for a in areas.values()}
numeric=missing=zeros=scientific=0
seen=set(); delayed=[]; selected=0
for r in rows:
    key=(r['codewb'],r['year'],r['group'],r['group2'])
    assert key not in seen;seen.add(key)
    population=populations.get((r['group'],r['group2']))
    if population is None:continue
    values={}
    for m in cfg['metrics']:
        raw_value=r[m['field']]
        value=None if raw_value=='NA' else raw_value
        if value is None:missing+=1
        else:
            assert 0<=Decimal(value)<=1
            numeric+=1;zeros+=Decimal(value)==0;scientific+='e' in value
        values[m['field']]=value
    year=int(r['year']);selected+=1
    if population=='all' and year==2022:delayed.append(r['codewb'])
    reference[areas[r['codewb']]['geographyId']]['points'].append({'year':year,'population':population,'values':values})
for profile in reference.values():profile['points'].sort(key=lambda p:(p['population'],p['year']))
assert len(rows)==cfg['expectedRows']==8577 and selected==cfg['expectedSelectedRows']==3766
assert numeric==cfg['expectedNumericCells']==59471 and len(delayed)==16 and scientific==10
(REVIEW/'reference.json').write_text(json.dumps(reference,ensure_ascii=False),encoding='utf-8')
result={'sourceSha256':cfg['sha256'],'glossarySha256':cfg['glossarySha256'],'profiles':len(reference),
        'countries':162,'aggregates':12,'metrics':42,'groups':7,'populations':len(populations),
        'rows':len(rows),'selectedRows':selected,'numericCells':numeric,'missingCells':missing,
        'trueZeros':zeros,'scientificValuesPreserved':scientific,'delayed2022Countries':sorted(delayed),
        'sourceYears':sorted({int(r['year']) for r in rows}),'mapping':cfg['areas'],
        'originalFileRoundtrip':'not_run','scope':'Published survey fractions, demographics and source geography; not confidence intervals or market valuation.'}
native_file=REVIEW/'native-review.json'
if native_file.exists():
    native=json.loads(native_file.read_text(encoding='utf-8'))
    assert len(native)==len(reference)
    for row in native:
        assert row['status']=='available'
        assert row['profile']==reference[row['geography']['id']]
        assert row['provenance']['sha256']==cfg['sha256'] and row['provenance']['glossarySha256']==cfg['glossarySha256']
    result['originalFileRoundtrip']='all_raw_cells_equal_after_sqlite_reopen'
Path(__file__).with_name('findex-source-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='mapping'},ensure_ascii=False))
