"""Verify the populated public Atlas read-only, never the personal journal.

Compares every new profile with the independent source extraction, including exact
decimal strings, nulls, flags and source identities. Original downloads/expected
values stay in the ignored .tmp directory; only aggregate audit results are saved.
"""
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
RAW = ROOT / 'apps/desktop/.tmp/atlas-gaps'

def read(path): return json.loads(path.read_text('utf-8'))
def sort(rows): return sorted(rows, key=lambda p:(p['metricId'],p['geographyId']))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('atlas_directory',type=Path)
    args=parser.parse_args()
    root=args.atlas_directory.resolve(strict=True)
    assert root.is_absolute() and root.name == 'atlas'
    dbfile=root/'cache.sqlite'; assert dbfile.is_file()
    db=sqlite3.connect(dbfile.as_uri()+'?mode=ro',uri=True)
    db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
    catalog=read(DATA/'catalog.json');geos={g['id']:g for g in catalog['geographies']}
    config=read(DATA/'public-series-catalog.json');sources={s['id']:s for s in config['sources']}
    audit=[]
    for name in ['gap-source-audit-2026-09-15.json','battery-expansion-sources-2026-09-15.json','imts-source-audit-2026-09-15.json']:
        audit+=read(HERE/name)
    result=[]
    for a in audit:
        sid=a['sourceId'];s=sources[sid]
        saved=db.execute('SELECT provenance_json FROM atlas_public_datasets WHERE id=?',(sid,)).fetchone()
        assert saved, 'Missing package: '+sid
        provenance=json.loads(saved[0])
        assert provenance['sha256']==s['expectedSha256'] and provenance['recipe']==s['recipe']
        expected=sort(read(RAW/'expected'/(sid+'.json')))
        actual=sort([json.loads(r[0]) for r in db.execute('SELECT profile_json FROM atlas_public_series WHERE dataset_id=?',(sid,))])
        assert actual == expected, 'Full source comparison failed: '+sid
        numeric=sum(p['value'] is not None for r in actual for p in r['points'])
        areas={r['geographyId'] for r in actual if any(p['value'] is not None for p in r['points'])}
        countries={g for g in areas if geos[g]['iso3']}
        africa={g for g in countries if geos[g]['regionId']=='Africa'}
        assert numeric==s['expectedNumeric']==a['numeric']==provenance['numericValues']
        result.append(dict(sourceId=sid,profiles=len(actual),numericValues=numeric,areasWithValues=len(areas),countriesOrTerritoriesWithValues=len(countries),africanCountriesOrTerritories=len(africa),firstPeriod=s['firstPeriod'],lastPeriod=s['lastPeriod'],sha256=provenance['sha256'],retrievedAt=provenance['retrievedAt']))
    baseline=read(RAW/'baseline.json')
    for before in baseline['public']:
        after=json.loads(db.execute('SELECT provenance_json FROM atlas_public_datasets WHERE id=?',(before['id'],)).fetchone()[0])
        assert before['retrievedAt']==after['retrievedAt'] and before['numeric']==after['numericValues'], 'Existing public package unexpectedly changed'
    markets=read(DATA/'market-proxies.json')
    reviewed=read(HERE/'market-expansion-sources-2026-09-15.json')
    # All pre-existing IDs are preserved; the native normal importer added missing funds.
    new_market_symbols={r['symbol'] for r in reviewed['funds']}
    assert len(markets)-len(new_market_symbols)==baseline['markets']
    market_rows=[]
    for proxy in markets:
        if proxy['symbol'] not in new_market_symbols: continue
        raw=db.execute('SELECT provenance_json FROM atlas_market_datasets WHERE proxy_id=?',(proxy['id'],)).fetchone()
        assert raw, 'Missing new market: '+proxy['id']
        prov=json.loads(raw[0]);assert len(prov['sha256'])==64 and 'api_token' not in prov['sourceUrl']
        months=db.execute('SELECT month,adjusted_close FROM atlas_market_months WHERE proxy_id=? ORDER BY month',(proxy['id'],)).fetchall()
        assert months and all(m<'2026-09' and (v is None or v>0) for m,v in months)
        market_rows.append(dict(proxyId=proxy['id'],symbol=proxy['symbol'],geographyId=proxy['geographyId'],firstMonth=months[0][0],lastMonth=months[-1][0],months=len(months),numericMonths=sum(v is not None for _,v in months),definitionBreaks=proxy['breaks'],sourceSha256=prov['sha256'],retrievedAt=prov['retrievedAt']))
    assert len(market_rows)==33
    all_provenance=[json.loads(r[0]) for r in db.execute('SELECT provenance_json FROM atlas_public_datasets')]
    out=dict(checkedAt=datetime.now(timezone.utc).isoformat(),scope='Read-only public atlas/cache.sqlite; no journal data',newSourcePackages=len(result),newMetrics=sum(m['sourceId'] in {r['sourceId'] for r in result} for m in config['metrics']),newNumericValues=sum(r['numericValues'] for r in result),newProfiles=sum(r['profiles'] for r in result),publicNumericValuesBefore=sum(r['numeric'] for r in baseline['public']),publicNumericValuesAfter=sum(r['numericValues'] for r in all_provenance),publicPackagesAfter=len(all_provenance),publicMetricsAfter=len(config['metrics']),newMarketFunds=len(market_rows),newMarketMonths=sum(r['months'] for r in market_rows),marketFundsAfter=len(markets),sources=result,markets=market_rows,unresolved=['Broader bilateral partner universe beyond the twelve selected partners','Long country valuation archives for China and India','Isolated rent series outside existing source coverage; ICP measures housing and utilities together','Recent reproducible quantum-country series; 2023 supplementary workbooks contain search strategies, Data Desk 2026 disables export','Comprehensive advanced-materials production and global battery stocks; available patent and power-addition perspectives are partial'])
    (HERE/'gap-cache-audit-2026-09-15.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps({k:v for k,v in out.items() if k not in ['sources','markets','unresolved']},indent=2))
    db.close()

if __name__=='__main__': main()
