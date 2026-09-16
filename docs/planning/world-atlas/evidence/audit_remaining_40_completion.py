"""Verify the original 40 topic IDs against the real public cache and acceptance files."""
import argparse, datetime, hashlib, json, pathlib, sqlite3

ROOT=pathlib.Path(__file__).resolve().parents[4]
EVIDENCE=pathlib.Path(__file__).resolve().parent
DATA=ROOT/'apps/desktop/src/features/world-atlas/data'
CACHE=pathlib.Path('C:/Users/schmi/AppData/Roaming/com.personal-macro.app/PersonalMacro/atlas/cache.sqlite')
def read(path): return json.loads(path.read_text(encoding='utf-8'))
args=argparse.ArgumentParser();args.add_argument('--data-only',action='store_true');options=args.parse_args()
ledger=read(EVIDENCE/'remaining-40-ledger.json');catalog=read(DATA/'catalog.json');public=read(DATA/'public-series-catalog.json')
assert len(ledger['topics'])==40 and len({t['id'] for t in ledger['topics']})==40
catalog_topics={t['id']:t for t in catalog['topics']}
records=[];packages=[]
with sqlite3.connect(CACHE.as_uri()+'?mode=ro',uri=True) as db:
    db.execute('BEGIN')
    profiles={}
    for source in public['sources']:
        value=db.execute('SELECT provenance_json FROM atlas_public_datasets WHERE id=?',(source['id'],)).fetchone()
        assert value,source['id']
        provenance=json.loads(value[0])
        assert provenance['sha256']==source['expectedSha256'],source['id']
        assert provenance['recipe']==source['recipe'],source['id']
        values=0
        for metric_id,payload in db.execute('SELECT metric_id,profile_json FROM atlas_public_series WHERE dataset_id=?',(source['id'],)):
            p=json.loads(payload);profiles.setdefault(metric_id,[]).append(p)
            values+=sum(v['value'] is not None for v in p['points'])
        assert values==provenance['numericValues'],source['id']
        packages.append(dict(sourceId=source['id'],numericValues=values,sha256=provenance['sha256'],recipe=provenance['recipe']))
    for topic in ledger['topics']:
        assert topic['id'] in catalog_topics
        metrics=[m for m in public['metrics'] if m['topicId']==topic['id']]
        statistics=[s for s in catalog['series'] if s['topicId']==topic['id']]
        areas=set();periods=[];values=0
        for m in metrics:
            for p in profiles.get(m['id'],[]):
                valid=[v for v in p['points'] if v['value'] is not None]
                if valid:areas.add(p['geographyId'])
                periods.extend(v['period'] for v in valid);values+=len(valid)
        for s in statistics:
            assert db.execute('SELECT provenance_json FROM atlas_datasets WHERE series_id=?',(s['id'],)).fetchone()
            for area,year in db.execute('SELECT geography_id,year FROM atlas_observations WHERE series_id=? AND value IS NOT NULL AND (? IS NULL OR year<=?)',(s['id'],s.get('throughYear'),s.get('throughYear'))):
                areas.add(area);periods.append(str(year));values+=1
        if topic['id']=='market_context:relative_strength':
            original=read(EVIDENCE/'relative-strength-original-checks-2026-09-11.json')
            local=read(EVIDENCE/'relative-strength-local-data-2026-09-11.json')
            assert original['status']=='passed' and len(original['checks'])==75
            for source in local['sources']:
                provenance=json.loads(db.execute('SELECT provenance_json FROM atlas_market_datasets WHERE proxy_id=?',(source['proxyId'],)).fetchone()[0])
                assert provenance==source['provenance']
            for check in original['checks']:
                if check['horizon'] is None:
                    values+=check['points'];periods.extend([check['first'],check['last']])
            market_catalog=read(DATA/'market-proxies.json')
            areas={p['geographyId'] for p in market_catalog if p['symbol']!='ACWI.US'}
        assert values>0 and areas,(topic['id'],'no real local values')
        impl=topic.get('implementation') or {};verify=topic.get('verification') or {}
        evidence=dict(local=topic.get('localEvidence') or impl.get('localImport') or verify.get('localFill') or verify.get('localImport'),nativeUi=verify.get('nativeUi') or impl.get('nativeUi'),windowsRelease=verify.get('windowsRelease') or impl.get('windowsRelease'))
        if not options.data_only:
            assert topic['status']=='implemented_native_verified',topic['id']
            for kind,name in evidence.items():
                assert name and (EVIDENCE/name).is_file(),(topic['id'],kind,name)
                read(EVIDENCE/name)
        records.append(dict(topicId=topic['id'],label=catalog_topics[topic['id']]['label'],publicPerspectives=len(metrics),statisticalPerspectives=len(statistics),localValues=values,sourceAreas=len(areas),first=min(periods),last=max(periods),evidence=evidence))
proof=dict(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='data_verified' if options.data_only else 'passed',catalogVersion=catalog['version'],originalTopics=40,topicsWithRealLocalValues=len(records),publicPerspectives=len(public['metrics']),publicPackages=len(packages),publicNumericValues=sum(p['numericValues'] for p in packages),readOnlyCache=str(CACHE),journalRead=False,topics=records,packages=packages)
if not options.data_only:
    release=read(EVIDENCE/'relative-strength-windows-release-2026-09-11.json')
    artifact=pathlib.Path(release['artifact']);assert hashlib.sha256(artifact.read_bytes()).hexdigest()==release['sha256']
    proof['finalWindowsSha256']=release['sha256']
name='remaining-40-local-data-audit-2026-09-11.json' if options.data_only else 'remaining-40-completion-2026-09-11.json'
(EVIDENCE/name).write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in proof.items() if k not in ['topics','packages','readOnlyCache']}))
