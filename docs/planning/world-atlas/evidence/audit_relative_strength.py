"""Read only the public Atlas monthly cache; independently calculate all 25 ratios."""
import datetime, decimal, hashlib, json, pathlib, sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[4]
TEMP = ROOT/'apps/desktop/.tmp/atlas-remaining-40'
CACHE = pathlib.Path('C:/Users/schmi/AppData/Roaming/com.personal-macro.app/PersonalMacro/atlas/cache.sqlite')
proxies = json.loads((ROOT/'apps/desktop/src/features/world-atlas/data/market-proxies.json').read_text(encoding='utf-8'))
rows = {}
with sqlite3.connect(CACHE.as_uri()+'?mode=ro', uri=True) as db:
    db.execute('BEGIN')
    for proxy in proxies:
        provenance = json.loads(db.execute('SELECT provenance_json FROM atlas_market_datasets WHERE proxy_id=?',(proxy['id'],)).fetchone()[0])
        months = db.execute('SELECT month,adjusted_close FROM atlas_market_months WHERE proxy_id=? ORDER BY month',(proxy['id'],)).fetchall()
        assert months and provenance['adjustment'].startswith('EODHD adjusted_close:')
        rows[proxy['id']] = dict(proxy=proxy,status='available',provenance=provenance,analysis=dict(recipe='original-monthly-cache',points=[dict(month=m,adjustedClose=v,wave=None,percentile=None) for m,v in months],state='insufficient_history',historyMonths=len(months),waveMonths=0,missingMonths=sum(v is None for m,v in months),stale=False,lastObservation=max(m for m,v in months if v is not None),parameterSensitive=None))
decimal.getcontext().prec = 40
def month(s):
    year,number=map(int,s.split('-')); return year*12+number-1
def label(n): return f'{n//12:04d}-{n%12+1:02d}'
current=datetime.datetime.now(datetime.timezone.utc)
cutoff=current.year*12+current.month-2
expected=[]
for proxy in proxies:
    if proxy['symbol']=='ACWI.US': continue
    benchmark='eodhd:SPY.US' if 'market_context:sector_equities' in proxy['topicIds'] else 'eodhd:ACWI.US'
    a=rows[proxy['id']]; b=rows[benchmark]
    av={month(p['month']):p['adjustedClose'] for p in a['analysis']['points']}
    bv={month(p['month']):p['adjustedClose'] for p in b['analysis']['points']}
    last=min(max(av),max(bv),cutoff)
    breaks=[month(p) for p in a['proxy']['breaks']+b['proxy']['breaks'] if month(p)<=last]
    for horizon in (10,20,None):
        first=max(min(av),min(bv),max(breaks,default=-1)+1,last-horizon*12+1 if horizon else 0)
        while first<=last and (av.get(first) is None or bv.get(first) is None):first+=1
        assert first<last
        points=[]
        for m in range(first,last+1):
            value=None
            if av.get(m) is not None and bv.get(m) is not None:
                value=float(decimal.Decimal(str(av[m]))/decimal.Decimal(str(av[first]))/(decimal.Decimal(str(bv[m]))/decimal.Decimal(str(bv[first])))*100)
            points.append(dict(month=label(m),value=value))
        expected.append(dict(proxyId=proxy['id'],benchmarkId=benchmark,geographyId=proxy['geographyId'],horizon=horizon,first=label(first),last=label(last),points=points))
TEMP.mkdir(parents=True,exist_ok=True)
(TEMP/'relative-original-cache.json').write_text(json.dumps(dict(rows=rows,expected=expected),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
proof=dict(checkedAt=current.isoformat(),status='independent_oracle_prepared',cacheReadOnly=True,cache=str(CACHE),sourceCount=len(rows),pairCount=len(expected)//3,horizons=[10,20,'all'],computedPoints=sum(len(e['points']) for e in expected),calculation='Python Decimal ratios from actual monthly adjusted closes; common month, no wave values',sources=[dict(proxyId=id,months=len(r['analysis']['points']),provenance=r['provenance']) for id,r in rows.items()],newDownloads=0)
(ROOT/'docs/planning/world-atlas/evidence/relative-strength-local-data-2026-09-11.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in proof.items() if k not in ['sources','cache']}))
