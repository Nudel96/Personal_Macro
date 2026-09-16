"""Compare every original source cell with native cache/commands in an isolated test profile."""
from pathlib import Path
import json
import os
import sqlite3
from datetime import datetime

ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / 'apps/desktop/.tmp/atlas-validation/commodities'
PROFILE = 'com.personal-macro.atlas-commodities-20260909'
DB = Path(os.environ['APPDATA']) / PROFILE / 'PersonalMacro/database/journal.sqlite'


def check(snapshot):
    reference = json.loads((REVIEW / 'reference.json').read_text(encoding='utf-8'))
    assert snapshot['points'] == reference['points']
    numeric = sum(v is not None for p in snapshot['points'] for v in p['values'].values())
    missing = sum(v is None for p in snapshot['points'] for v in p['values'].values())
    assert (numeric, missing) == (10310, 910)
    return {'years': len(snapshot['points']), 'numeric': numeric, 'missing': missing}


def main():
    result = {'originalFileRoundtrip': check(json.loads((REVIEW / 'native-review.json').read_text(encoding='utf-8')))}
    assert PROFILE in DB.parts
    if not DB.exists():
        print(json.dumps(result)); return
    process_file = REVIEW / 'restart-process.json'
    if not process_file.exists():
        print(json.dumps({**result, 'actualProcessRestart':'pending'})); return
    process = json.loads(process_file.read_text(encoding='utf-8-sig'))
    assert process['identifier'] == PROFILE and process['pid'] != process['previousPid']
    with sqlite3.connect(DB.as_uri()+'?mode=ro',uri=True) as connection:
        phases = {}
        for phase in ('first','restart'):
            row = connection.execute('SELECT value_json FROM app_settings WHERE key=?',(f'atlas.commodities.validation.{phase}',)).fetchone()
            if not row:
                print(json.dumps({**result,phase:'pending'})); return
            proof = json.loads(row[0])
            (REVIEW / f'{phase}.json').write_text(json.dumps(proof,ensure_ascii=False),encoding='utf-8')
            assert proof['ok'], proof.get('error')
            assert proof['identifier'] == PROFILE
            result[phase] = {**check(proof['snapshot']), 'runAt':proof['runAt'], 'jobs':proof['jobs']}
            phases[phase] = proof
        assert phases['first']['snapshot'] == phases['restart']['snapshot']
        assert datetime.fromisoformat(phases['restart']['runAt']) >= datetime.fromisoformat(process['createdAt'])
        assert phases['first']['note'] == phases['restart']['note']
        assert not phases['restart']['jobs']
        note = phases['first']['note']
        assert note['context']['params']['commodityCompare'] == 'nickel'
        assert any(s['scope']=='Internationale Referenzpreise' for s in note['sources'])
        result['identifier'] = PROFILE
        result['restartProcess'] = process
        result['notebookAndFixedPictureUnchangedAfterProcessRestart'] = True
        result['nativeUiClickAcceptance'] = False
    Path(__file__).with_name('commodity-native-readiness.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__': main()
