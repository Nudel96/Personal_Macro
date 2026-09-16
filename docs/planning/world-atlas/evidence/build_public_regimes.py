"""Audit original JST peg classifications; no inferred gold/fiat or numeric ratings."""
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile
import openpyxl

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
RAW = ROOT / 'apps/desktop/.tmp/atlas-remaining-40'
ID = 'jst-exchange-regimes'
FILE = 'jst-regimes-r6.xlsx'
VERSION = '2026-09-11.20'

def read(p):
    return json.loads(p.read_text(encoding='utf-8'))

def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

original = ROOT / 'apps/desktop/.tmp/atlas-validation/macrohistory/raw/JSTdatasetR6.xlsx'
cfg = read(DATA / 'macrohistory-catalog.json')
assert hashlib.sha256(original.read_bytes()).hexdigest() == cfg['sha256']
(RAW / FILE).write_bytes(original.read_bytes())
book = openpyxl.load_workbook(original, read_only=True, data_only=True)
rows = list(book.active.values)
assert book.sheetnames == [cfg['sheet']] and list(rows[0]) == cfg['headers'] and len(rows) == 2719
header = list(rows[0])
base_labels = {'GBR': 'Vereinigtes Königreich', 'USA': 'Vereinigte Staaten', 'DEU': 'Deutschland',
               'HYBRID': 'Gemischte Modellbasis (HYBRID)', 'NA': 'Keine eigene Bezugsbasis angegeben (NA)'}
type_labels = {'PEG': 'Gebundene Modellrolle (PEG)', 'FLOAT': 'Schwankende Modellrolle (FLOAT)',
               'BASE': 'Basisland im Modell (BASE)'}
scope = ('Historische JST-R6-Klassifikation für 18 entwickelte Volkswirtschaften, 1870–2020. '
         'Jahreseinordnungen statt stetiger Messgröße: keine Bewertung, Prognose oder wiederkehrende Sinusphase. '
         'Die weite Bindungsdefinition umfasst auch gleitende Bindungen (crawling pegs), die strenge Definition schließt sie aus. '
         'Modellrolle und Bezugsbasis sind zusätzliche Originalfelder; auch frei schwankenden Ländern kann im Forschungsmodell eine Bezugsbasis zugeteilt sein. '
         'BASE kann in der Bindungsvariable sowohl 0 als auch 1 tragen. NA ist eine Quellenangabe und keine leere Zelle. '
         'Die Bindung an ein Bezugsland beweist keine Golddeckung. Historische Staats- und Quellengebietsgrenzen bleiben relevant. '
         'Quelle: Òscar Jordà, Moritz Schularick und Alan M. Taylor (2017), Macrofinancial History and the New Business Cycle Facts, NBER Macroeconomics Annual 2016, Band 31. '
         'JST Release 6; CC BY-NC-SA 4.0, persönlicher nichtkommerzieller Gebrauch, Quellenstand geprüft am 11.09.2026.')
metrics = []
columns = []
for code, label, explanation, note in [
    ('peg', 'Wechselkursbindung · weite Definition', 'Wann ordnet die historische Quelle ein Land als wechselkursgebunden ein?',
     'Weite Originaldefinition, einschließlich gleitender Bindungen. Jahresklasse 1 bedeutet gebunden, 0 nicht gebunden nach dieser Definition.'),
    ('peg_strict', 'Wechselkursbindung · strenge Definition', 'Wann erfüllt die Wechselkursordnung die strengere Bindungsdefinition der Quelle?',
     'Strenge Originaldefinition, ohne gleitende Bindungen. Jahresklasse 0 bedeutet keine strenge Bindung und kann dennoch eine weite Bindung enthalten.'),
]:
    title = 'Peg dummy' if code == 'peg' else 'Strict peg dummy'
    columns.append({'code': code, 'index': header.index(code), 'title': title, 'note': note})
    metrics.append({'id': ID + ':' + code, 'sourceId': ID, 'topicId': 'long_history:monetary_systems',
                    'providerCode': code, 'label': label, 'unit': 'Historische Einordnung je Jahr', 'frequency': 'annual',
                    'kind': 'binary_regime', 'comparison': 'same_definition', 'connectAdjacent': False,
                    'explanation': explanation, 'scopeNote': note + ' ' + scope})
areas = []
for a in cfg['areas']:
    areas.append({'code': a['code'], 'label': a['providerLabel'], 'geographyId': a['geographyId'],
                   'seriesTitles': {c['code']: c['title'] for c in columns}})
area_map = {a['code']: a for a in areas}
identities = {a['code']: {'label': a['providerLabel'], 'ifs': a['ifs'], 'geographyId': a['geographyId']} for a in cfg['areas']}
profiles, seen, distributions = {}, set(), defaultdict(Counter)
for row in rows[1:]:
    year, name, iso, ifs = row[:4]
    assert isinstance(year,int) and 1870 <= year <= 2020 and (iso,year) not in seen
    seen.add((iso,year)); a = area_map[iso]
    assert name == a['label'] and ifs == identities[iso]['ifs']
    peg, strict, typ, base = row[35:39]
    assert peg in (None,0,1) and strict in (None,0,1)
    if peg is None:
        assert strict is None and typ == '' and base == '' and iso == 'IRL' and year <= 1919
    else:
        assert strict is not None and strict <= peg and typ in type_labels and base in base_labels
        assert (typ != 'PEG' or peg == 1) and (typ != 'FLOAT' or peg == 0)
    for key, value in zip(['peg','peg_strict','peg_type','peg_base'],[peg,strict,typ,base]):
        distributions[key][str(value)] += 1
    for c, m in zip(columns,metrics):
        value = row[c['index']]
        p = profiles.setdefault((m['id'],a['geographyId']), {'metricId':m['id'],'geographyId':a['geographyId'],
            'providerArea':iso,'providerLabel':name,'providerTitle':c['title'],'unit':m['unit'],'points':[]})
        # Explicit source role/base, not a newly inferred legal anchor or metal standard.
        notes = [c['note']]
        if value is not None: notes += ['Modellrolle: ' + type_labels[typ], 'Modell-Bezugsbasis: ' + base_labels[base]]
        p['points'].append({'period':str(year),'value':None if value is None else str(value),
            'status':'Keine Quellenklassifikation' if value is None else ('Gebunden nach Quellenregel' if value == 1 else 'Nicht gebunden nach Quellenregel'),
            'breakBefore':False,'notes':notes,'lowerBound':None,'upperBound':None})
profiles = sorted(profiles.values(),key=lambda p:(p['metricId'],p['geographyId']))
for p in profiles: p['points'].sort(key=lambda p:p['period'])
assert len(profiles) == 36 and len(seen) == 2718
numeric = sum(p['value'] is not None for a in profiles for p in a['points'])
assert numeric == 5336
source = {'id':ID,'label':'JST R6 · Historische Wechselkursregime','adapter':'jst_regimes',
          'url':cfg['resolvedUrl'],'documentationUrl':'https://www.macrohistory.net/database/',
          'licenseUrl':'https://creativecommons.org/licenses/by-nc-sa/4.0/','publishedAt':'2022-07','reviewedAt':'2026-09-11',
          'recipe':'jst-r6-original-peg-classifications-v1','observationKind':'historical_classification',
          'expectedSha256':cfg['sha256'],'expectedRows':2718,'expectedNumeric':numeric,
          'firstPeriod':'1870','lastPeriod':'2020','areas':areas}
z=ZipFile(original)
contract={'sourceId':ID,'file':FILE,'sheet':cfg['sheet'],'header':header,'columns':columns,'countries':identities,
          'typeLabels':type_labels,'baseLabels':base_labels,'distributions':dict(distributions),
          'zipEntries':len(z.infolist()),'uncompressedBytes':sum(a.file_size for a in z.infolist()),'sourceUrl':cfg['url']}
catalog=read(DATA/'public-series-catalog.json');catalog['sources']=[s for s in catalog['sources'] if s['id']!=ID]+[source]
catalog['metrics']=[m for m in catalog['metrics'] if m['sourceId']!=ID]+metrics;catalog['version']=VERSION
write(DATA/'public-series-catalog.json',catalog);main=read(DATA/'catalog.json');main['version']=VERSION;write(DATA/'catalog.json',main)
write(DATA/'public-regimes-contract.json',contract);write(RAW/'regimes-expected-profiles.json',profiles)
write(HERE/'public-regimes-audit.json',{'reviewedAt':'2026-09-11','source':source,'contract':contract,'profiles':36,'numeric':numeric,'missing':100,'scope':scope})
ledger=read(HERE/'remaining-40-ledger.json');topic=next(t for t in ledger['topics'] if t['id']=='long_history:monetary_systems')
topic['research']=[{'sourceId':ID,'reviewedAt':'2026-09-11','evidence':'public-regimes-audit.json'}]
if topic['status']=='research_pending':topic['status']='source_validated'
write(HERE/'remaining-40-ledger.json',ledger)
print(json.dumps({'source':ID,'areas':18,'profiles':36,'classifiedYears':5336,'missing':100}))
