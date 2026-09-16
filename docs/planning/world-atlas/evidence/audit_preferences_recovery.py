"""Audit real Tauri preference recovery against independent SQLite-lock timings.

Reads only the task's named isolated profile and public test artifacts. Run
without arguments after the three recovery cases, then --restart after a real
process restart. The first evidence is retained when adding restart evidence.
"""
from pathlib import Path
from datetime import datetime
import argparse
import json
import os
import sqlite3
from urllib.parse import parse_qsl

ROOT = Path(__file__).resolve().parents[4]
TEMP = ROOT / 'apps/desktop/.tmp/atlas-validation/preferences-recovery'
TARGET = Path(__file__).with_name('preferences-recovery-readiness.json')
IDENTIFIER = 'com.personal-macro.atlas-preferences-recovery-20260909'
PROFILE = Path(os.environ['APPDATA']) / IDENTIFIER / 'PersonalMacro/database/journal.sqlite'


def at(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def audit(restart=False):
    with sqlite3.connect(PROFILE.as_uri() + '?mode=ro', uri=True) as db:
        row = db.execute("SELECT value_json FROM app_settings WHERE key='atlas.preferences.recovery.proof'").fetchone()
        assert row, 'Native proof has not been committed'
        proof = json.loads(row[0])
        stored = json.loads(db.execute('SELECT last_context_json FROM atlas_personal_preferences WHERE id=1').fetchone()[0])
    assert proof['identifier'] == IDENTIFIER and proof['ok'], proof
    assert stored == {'version': 1, 'params': {'area': 'm49:276', 'historySince': '1800', 'historyProportional': '0', 'numbers': '0'}}
    if restart:
        original = json.loads(TARGET.read_text(encoding='utf-8-sig'))
        assert proof['mode'] == 'restart' and proof['noPreferenceWrites']
        assert proof['calls'] == [] and proof['restored'] == stored
        assert at(proof['runAt']) > at(original['native']['completedAt'])
        first_process = json.loads((TEMP / 'first-process.json').read_text(encoding='utf-8-sig'))
        restarted_process = json.loads((TEMP / 'restart-process.json').read_text(encoding='utf-8-sig'))
        assert first_process['Id'] != restarted_process['Id']
        original['restart'] = dict(native=proof, firstProcess=first_process, restartedProcess=restarted_process,
                                   storedPreferenceEqual=True, noRedundantPreferenceWrites=True)
        result = original
    else:
        assert proof['mode'] == 'recovery'
        locks = json.loads((TEMP / 'lock-events.json').read_text(encoding='utf-8'))
        assert [lock['case'] for lock in locks] == ['unchanged', 'superseded', 'reopen']
        assert len(proof['calls']) == 6
        for lock in locks:
            calls = [c for c in proof['calls'] if c['case'] == lock['case']]
            assert len(calls) == 2
            first, successful = calls
            assert first['code'] == 'ATLAS_PREFERENCES_BUSY' and not first.get('ok')
            assert successful['ok'] and 'code' not in successful
            assert at(lock['acquiredAt']) < at(first['startedAt']) < at(first['finishedAt']) < at(lock['releasedAt'])
            assert at(first['finishedAt']) <= at(successful['startedAt']) < at(lock['releasedAt']) <= at(successful['finishedAt'])
            assert (at(first['finishedAt']) - at(first['startedAt'])).total_seconds() >= 5
            assert (at(lock['releasedAt']) - at(lock['acquiredAt'])).total_seconds() >= 9
            if lock['case'] != 'superseded':
                assert first['context'] == successful['context']
        assert proof['cases'][1]['attempted'] == ['m49:840', 'm49:156']
        assert proof['cases'][-1]['stored'] == stored
        assert dict(parse_qsl(proof['cases'][-1]['rendered'])) == stored['params']
        last_write = [c for c in proof['calls'] if c['case'] == 'reopen'][-1]
        reopen_reads = [r for r in proof['reads'] if r['case'] == 'reopen']
        assert len(reopen_reads) == 2
        assert at(reopen_reads[-1]['startedAt']) >= at(last_write['finishedAt'])
        for previous, following in zip(proof['calls'], proof['calls'][1:]):
            assert at(previous['finishedAt']) <= at(following['startedAt'])
        result = dict(native=proof, independentLocks=locks, sqlitePreference=stored,
                      checks=dict(actualBusyResponses=3, recoveredWrites=3, staleIntermediateWriteSkipped=True,
                                  rereadAfterPriorWrite=True, allWritesSerialized=True),
                      scope='Real Tauri commands and production React preference hook with independent nine-second SQLite write locks in the named isolated profile. Programmatic selection changes; not a full native click acceptance.')
    TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(ok=True, restart=restart, identifier=IDENTIFIER, storedArea=stored['params']['area'])))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--restart', action='store_true')
    audit(parser.parse_args().restart)
