"""Independently compare every FAOSTAT original row with native stored values.

Run after the explicit Rust original-source test. --native additionally reads
only the named isolated validation profile, never the user's production journal.
"""
import argparse
import base64
import collections
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import zipfile

ROOT=Path(__file__).resolve().parents[4]
TEMP=ROOT/'apps/desktop/.tmp/atlas-validation/agriculture'
CONFIG=ROOT/'apps/desktop/src/features/world-atlas/data/agriculture-catalog.json'
def audit(native=False):
    config=json.loads(CONFIG.read_text(encoding='utf-8-sig'))
    root=TEMP/'rust-profiles'
    native_proof=None
    if native:
        profile=Path(os.environ['APPDATA'])/'com.personal-macro.atlas-agriculture-validation'/'PersonalMacro'
        with sqlite3.connect((profile/'atlas/cache.sqlite').as_uri()+'?mode=ro',uri=True) as db:
            metadata=db.execute('SELECT provenance_json FROM atlas_agriculture_dataset WHERE id=?',(config['datasetId'],)).fetchone()
            assert metadata, 'Native dataset is missing'
            provenance=json.loads(metadata[0]); root=TEMP/'native-profiles';root.mkdir(exist_ok=True)
            catalog=json.loads((ROOT/'apps/desktop/src/features/world-atlas/data/catalog.json').read_text(encoding='utf-8-sig'))
            geographies={g['id']:g for g in catalog['geographies']}
            for gid,raw in db.execute('SELECT geography_id,profile_json FROM atlas_agriculture_areas WHERE dataset_id=?',(config['datasetId'],)):
                response=dict(geography=geographies[gid],status='available',profile=json.loads(raw),provenance=provenance)
                (root/(gid.replace(':','-')+'.json')).write_text(json.dumps(response,ensure_ascii=False),encoding='utf-8')
        with sqlite3.connect((profile/'database/journal.sqlite').as_uri()+'?mode=ro',uri=True) as db:
            proof=db.execute('SELECT value_json FROM app_settings WHERE key=?',('atlas.agriculture.validation',)).fetchone()
            assert proof, 'Native harness has not completed'
            native_proof=json.loads(proof[0]);assert native_proof.get('ok'),native_proof
        picture=native_proof.pop('picture',None)
        if picture:
            (TEMP/'agriculture-native-picture.png').write_bytes(base64.b64decode(picture))
    snapshots=[json.loads(f.read_text(encoding='utf-8')) for f in root.glob('*.json')]
    assert len(snapshots)==len(config['areas'])==234
    areas={r['profile']['providerCode']:r for r in snapshots}
    assert len(areas)==234
    values={code:{key:{p['year']:p for p in points} for key,points in r['profile']['series'].items()} for code,r in areas.items()}
    keys=set(); count=0; zeros=0; missing=0; maximum=0; counts=collections.Counter();last={}
    raw=(TEMP/'source.zip').read_bytes(); sha=hashlib.sha256(raw).hexdigest()
    assert all(r['provenance']['sha256']==sha for r in snapshots)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        with z.open('Production_Indices_E_All_Data_(Normalized).csv') as f:
            for row in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
                code,item,year,element=row['Area Code'],row['Item Code'],int(row['Year']),row['Element Code']
                assert row['Area']==areas[code]['profile']['providerLabel']
                field={'432':'total','434':'perCapita'}[element]
                key=(code,item,year,field);assert key not in keys;keys.add(key)
                expected=float(row['Value']) if row['Value'] else None;actual=values[code][item][year][field]
                assert row['Flag']=='E'
                if expected is None: assert actual is None;missing+=1
                else:
                    assert actual is not None
                    maximum=max(maximum,abs(expected-actual))
                    assert abs(expected-actual)<=max(1,abs(expected))*1e-14,(key,expected,actual)
                    count+=1;zeros+=expected==0
                counts[code]+=1;last[(code,item)]=max(last.get((code,item),year),year)
    actual_keys={(code,item,year,field) for code,items in values.items() for item,points in items.items() for year,p in points.items() for field in ['total','perCapita'] if p[field] is not None}
    assert actual_keys==keys # This release has no missing raw values.
    assert count==1_995_192 and zeros==426 and missing==0
    assert all(r['provenance']['numericCellCount']==count for r in snapshots)
    output=dict(sourceSha256=sha,sourceRows=count+missing,numericValues=count,sourceMissingValues=missing,
        zeroValues=zeros,areas=len(areas),items=len(config['items']),maximumAbsoluteDifference=maximum,
        provenanceEqualAcrossProfiles=all(r['provenance']==snapshots[0]['provenance'] for r in snapshots),
        selectedHistory=[dict(area=a,item=i,lastYear=last.get((a,i))) for a in ['79','100','41','231','5100'] for i in ['2051','15','661']],
        native=native_proof,scope='All original numeric keys, published zeroes, provider labels, and native cached source identity.')
    target=Path(__file__).with_name('agriculture-native-readiness.json' if native else 'agriculture-parser-readiness.json')
    target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:output[k] for k in ['numericValues','zeroValues','areas','items','maximumAbsoluteDifference']}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--native',action='store_true');audit(parser.parse_args().native)
