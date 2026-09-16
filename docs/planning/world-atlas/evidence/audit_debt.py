"""Independent BIS borrower-debt source audit; never opens a personal journal."""
from pathlib import Path
from decimal import Decimal
import argparse, collections, csv, hashlib, io, json, sqlite3, zipfile

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
SCRATCH = ROOT / 'apps/desktop/.tmp/atlas-validation/debt'
REGIONS = [
    ('G2', 'G20 economies', 'bis:debt_g20', 'G20 · BIS-Schuldengruppe'),
    ('5R', 'Advanced economies', 'bis:debt_advanced', 'Fortgeschrittene Volkswirtschaften · BIS-Schuldengruppe'),
    ('4T', 'Emerging market economies (aggregate)', 'bis:debt_emerging', 'Schwellenländer · BIS-Schuldengruppe'),
    ('5A', 'All reporting economies', 'bis:debt_reporting', 'Alle berichtenden Volkswirtschaften · BIS-Schuldengruppe'),
]
URL = 'https://data.bis.org/static/bulk/WS_TC_csv_flat.zip'
SELECT = {
    'TC_LENDERS:Lending sector':'A: All sectors',
    'VALUATION:Valuation method':'M: Market value',
    'UNIT_TYPE:Unit type':'770: Percentage of GDP',
    'TC_ADJUST:Adjustment':'A: Adjusted for breaks',
}

def read_source():
    raw = (SCRATCH / 'source.zip').read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        assert z.namelist() == ['WS_TC_csv_flat.csv']
        content = z.read(z.namelist()[0])
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    all_rows = list(reader)
    chosen = [r for r in all_rows if r['TC_BORROWERS:Borrowing sector'] in ['H: Households & NPISHs','N: Non-financial corporations'] and all(r[k] == v for k,v in SELECT.items())]
    rows = [r for r in chosen if r['FREQ:Frequency'] == 'Q: Quarterly']
    metadata = [r for r in chosen if not r['FREQ:Frequency']]
    assert len(chosen) == len(rows) + len(metadata)
    assert all(r['DECIMALS:Decimals'] in ['1: One','3: Three'] and not r['OBS_VALUE:Observation Value'] and not r['TIME_PERIOD:Time period or range'] for r in metadata)
    assert all(r['UNIT_MULT:Unit Multiplier'] == '0: Units' and r['UNIT_MEASURE:Unit of measure'] == '367: Per cent' and r['OBS_CONF:Observation confidentiality'] == 'F: Free' for r in rows)
    country_map = {a['code']:a for a in json.loads((DATA/'credit-catalog.json').read_text(encoding='utf-8'))['areas']}
    country_map.update({code:{'code':code,'label':label,'geographyId':area} for code,label,area,title in REGIONS})
    for row in metadata:
        code=row["BORROWERS_CTY:Borrowers' country"].split(': ',1)[0]
        decimals=int(row['DECIMALS:Decimals'].split(':',1)[0])
        assert country_map[code].get('decimals',decimals)==decimals
        country_map[code]['decimals']=decimals
    areas, expected = {}, {}
    for row in rows:
        code, label = row["BORROWERS_CTY:Borrowers' country"].split(': ',1)
        assert code in country_map and country_map[code]['label'] == label, (code,label)
        area = country_map[code]
        series_label=row['TITLE_TS:Title (tseries level)'].split(' - Credit to ',1)[0]
        assert area.get('seriesLabel',series_label)==series_label
        area['seriesLabel']=series_label
        areas[code] = area
        metric = 'households' if row['TC_BORROWERS:Borrowing sector'].startswith('H:') else 'corporations'
        period = row['TIME_PERIOD:Time period or range']
        value = row['OBS_VALUE:Observation Value']
        key = (area['geographyId'],period,metric)
        assert key not in expected
        assert row['OBS_STATUS:Observation Status'] in ['A: Normal value','B: Break']
        expected[key] = (Decimal(value) if value else None, row['OBS_STATUS:Observation Status'].startswith('B:'), row['OBS_PRE_BREAK:Pre-Break Observation'])
    assert len(areas)==48 and len(metadata)==96
    coverage = []
    for code,area in sorted(areas.items()):
        measurements = {}
        for metric in ['households','corporations']:
            cells=[(period,v) for (g,period,m),v in expected.items() if g==area['geographyId'] and m==metric]
            measurements[metric]={'first':min(p for p,v in cells),'last':max(p for p,v in cells),'rows':len(cells),'numeric':sum(v[0] is not None for p,v in cells)}
        coverage.append({**area,'measures':measurements})
    return raw, reader.fieldnames, all_rows, expected, coverage

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--write-catalog',action='store_true')
    parser.add_argument('--native',type=Path)
    parser.add_argument('--cache',type=Path)
    args=parser.parse_args()
    raw,headers,all_rows,expected,coverage=read_source()
    cfg={'datasetId':'bis-borrower-debt','version':'2026-09-09.1','recipe':'bis-household-corporate-debt-gdp-break-adjusted-v1','url':URL,'methodologyUrl':'https://www.bis.org/statistics/totcredit/credpriv_doc.pdf','reviewedAt':'2026-09-09','reviewedSha256':hashlib.sha256(raw).hexdigest(),'topicIds':['finance:household_debt','finance:corporate_debt'],'regions':[{'code':code,'label':label,'geographyId':area,'title':title,'regionId':'world'} for code,label,area,title in REGIONS],'areas':[{k:a[k] for k in ['code','label','seriesLabel','geographyId','decimals']} for a in coverage]}
    if args.write_catalog:
        (DATA/'debt-catalog.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    else:
        assert json.loads((DATA/'debt-catalog.json').read_text(encoding='utf-8'))==cfg
    observed=None
    if args.native:
        observed=json.loads(args.native.read_text(encoding='utf-8'),parse_float=Decimal)
    if args.cache:
        assert args.cache.resolve() == Path.home()/'AppData/Roaming/com.personal-macro.atlas-debt-20260909/PersonalMacro/atlas/cache.sqlite'
        with sqlite3.connect(args.cache.as_uri()+'?mode=ro',uri=True) as db:
            observed=[{'profile':json.loads(row[0],parse_float=Decimal)} for row in db.execute('SELECT profile_json FROM atlas_debt_areas')]
    if observed is not None:
        actual={}
        profiles_seen=set()
        expected_areas={a['geographyId']:a for a in coverage}
        for response in observed:
            profile=response['profile']
            if not profile: continue
            assert profile['geographyId'] not in profiles_seen
            profiles_seen.add(profile['geographyId'])
            a=expected_areas[profile['geographyId']]
            assert (profile['providerCode'],profile['providerLabel'],profile['decimals'])==(a['code'],a['label'],a['decimals'])
            if response.get('provenance'):
                p=response['provenance']
                assert p['sha256']==cfg['reviewedSha256'] and p['url']==URL and p['recipe']==cfg['recipe'] and p['areaCount']==48
            for point in profile['points']:
                for metric in ['households','corporations']:
                    key=(profile['geographyId'],point['period'],metric)
                    if key in expected:
                        assert key not in actual
                        actual[key]=(point[metric],point[metric+'Break'],point[metric+'PreBreak'])
                    else:
                        assert point[metric] is None
        assert profiles_seen==set(expected_areas)
        assert actual==expected, 'Source values or flags differ from the native data'
    report={'status':'native_exact_match' if observed is not None else 'source_verified','url':URL,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'sourceRows':len(all_rows),'selectedObservations':len(expected),'metadataRows':96,'areas':48,'countryAndEuroAreaProfiles':44,'ownAggregates':4,'numeric':sum(v[0] is not None for v in expected.values()),'zero':sum(v[0]==0 for v in expected.values()),'missing':sum(v[0] is None for v in expected.values()),'breaks':sum(v[1] for v in expected.values()),'headers':headers,'coverage':coverage}
    (Path(__file__).parent/'debt-source-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['coverage','headers']},indent=2))

if __name__=='__main__': main()
