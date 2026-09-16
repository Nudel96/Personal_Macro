"""Verify complete SDG slices, geography identity, units, duplicates and source flags."""
import concurrent.futures, collections, hashlib, json, math, pathlib, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[4]
TMP = ROOT/'apps/desktop/.tmp/atlas-expansion'
DATA = ROOT/'apps/desktop/src/features/world-atlas/data'
cfg = json.loads((DATA/'sdg-catalog.json').read_text(encoding='utf8'))
areas = {a['code']: a for a in cfg['areas']}

def run(definition):
    rows, hashes, urls = [], [], []
    page = 1
    while True:
        params = dict(seriesCode=definition['providerCode'], releaseCode=cfg['release'],page=page,pageSize=1000)
        # The API's combined dimension and time-bound filters can return false
        # empty responses/HTTP 500. Use at most one dimension and validate the
        # exact complete slice locally; never interpret a failed request as data.
        for name in ([] if definition.get('unfiltered', False) else ['Sex','Type of renewable technology','Location','Mode of transportation']):
            if name in definition['dimensions']:
                params['dimensions'] = json.dumps([{'name':name,'values':[definition['dimensions'][name]]}],separators=(',', ':'))
                break
        url = 'https://unstats.un.org/SDGAPI/v1/sdg/Series/Data?' + urllib.parse.urlencode(params)
        target = TMP / f'{definition["id"].replace(":","_")}-slice-{page}.json'
        if not target.exists():
            target.write_bytes(urllib.request.urlopen(url,timeout=120).read())
        raw = target.read_bytes()
        data = json.loads(raw)
        assert data['pageNumber'] == page
        rows.extend(data['data'])
        hashes.append(hashlib.sha256(raw).hexdigest()); urls.append(url)
        if page >= data['totalPages']: break
        page += 1
    assert len(rows) == data['totalElements']
    selected = [r for r in rows if r['dimensions']==definition['dimensions'] and r['geoAreaCode'] in areas and r['timePeriodStart'] <= 2025 and definition['indicator'] in r['indicator']]
    for row in selected:
        assert row['seriesDescription'] == definition['providerLabel'], row['seriesDescription']
        assert row['geoAreaName'] == areas[row['geoAreaCode']]['providerLabel'], row['geoAreaName']
        assert row['timePeriodStart'] == int(row['timePeriodStart'])
    keys = collections.Counter((r['geoAreaCode'],r['timePeriodStart']) for r in selected)
    conflicts = [k for k,c in keys.items() if c>1]
    numbers = [r for r in selected if r['value'] is not None and r['valueType'] in ('Float','Integer') and math.isfinite(float(r['value']))]
    result = dict(id=definition['id'], requestedRows=len(rows), selectedRows=len(selected), numericRows=len(numbers),
                  areaCount=len(set(r['geoAreaCode'] for r in numbers)),
                  through=max((r['timePeriodStart'] for r in numbers),default=None),
                  units=sorted(set(r['attributes'].get('Units','') for r in selected)),
                  multipliers=sorted(set(r['attributes'].get('UnitMultiplier','') for r in selected)),
                  types=sorted(set(r['valueType'] for r in selected)),
                  conflicts=conflicts,
                  hashes=hashes, urls=urls,
                  sample=next((r for r in numbers if r['geoAreaCode']=='276'),numbers[0] if numbers else None))
    (TMP/(definition['id'].replace(':','_')+'-audit.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(definition['id'],len(numbers),'numbers',result['areaCount'],'areas','conflicts',len(conflicts),'units',result['units'], flush=True)
    return result

if __name__ == '__main__':
    results, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(run,d): d['id'] for d in cfg['series']}
        for future in concurrent.futures.as_completed(futures):
            try: results.append(future.result())
            except Exception as error:
                failures.append(dict(id=futures[future], error=str(error)))
                print('ERROR',futures[future],type(error).__name__,str(error),flush=True)
    (TMP/'sdg-source-audit.json').write_text(json.dumps(dict(results=results,failures=failures),ensure_ascii=False,indent=2),encoding='utf8')
