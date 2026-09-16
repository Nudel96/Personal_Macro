"""Build the reviewed FAOSTAT QI crosswalk from its public original ZIP.

Usage: python scripts/build-atlas-agriculture-catalog.py [--download]
No personal database or journal is accessed. Source labels remain unchanged.
"""
import argparse
import collections
import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.tmp/atlas-validation/agriculture'
DATA = ROOT / 'src/features/world-atlas/data'
EVIDENCE = ROOT.parent.parent / 'docs/planning/world-atlas/evidence'
SOURCE = 'https://bulks-faostat.fao.org/production/Production_Indices_E_All_Data_(Normalized).zip'
INDEX = 'https://bulks-faostat.fao.org/production/datasets_E.json'
GROUPS = {'overview': 'Überblick', '011': 'Getreide', '012': 'Gemüse', '013': 'Obst und Nüsse',
          '014': 'Ölpflanzen', '015': 'Wurzeln und Knollen', '016': 'Genussmittel und Gewürze',
          '017': 'Hülsenfrüchte', '018': 'Zuckerpflanzen', '019': 'Fasern und weitere Pflanzen',
          '02': 'Tierische Erzeugnisse', '211': 'Fleisch'}
REGIONS = {
 '351': ('China · gesamtes FAO-Quellengebiet', 'Asia'),
 '5000': ('Welt', 'world'), '5100': ('Afrika','Africa'), '5101': ('Ostafrika','Africa'),
 '5102': ('Zentralafrika','Africa'), '5103': ('Nordafrika','Africa'), '5104': ('Südliches Afrika','Africa'),
 '5105': ('Westafrika','Africa'), '5200': ('Amerika','Americas'), '5203': ('Nordamerika','Americas'),
 '5204': ('Zentralamerika','Americas'), '5206': ('Karibik','Americas'), '5207': ('Südamerika','Americas'),
 '5300': ('Asien','Asia'), '5301': ('Zentralasien','Asia'), '5302': ('Ostasien','Asia'),
 '5303': ('Südasien','Asia'), '5304': ('Südostasien','Asia'), '5305': ('Westasien','Asia'),
 '5400': ('Europa','Europe'), '5401': ('Osteuropa','Europe'), '5402': ('Nordeuropa','Europe'),
 '5403': ('Südeuropa','Europe'), '5404': ('Westeuropa','Europe'), '5500': ('Ozeanien','Oceania'),
 '5501': ('Australien und Neuseeland','Oceania'), '5502': ('Melanesien','Oceania'),
 '5503': ('Mikronesien','Oceania'), '5504': ('Polynesien','Oceania'),
 '5707': ('Europäische Union · 27 Länder','Europe'),
 '5801': ('Am wenigsten entwickelte Länder','world'),
 '5802': ('Binnenentwicklungsländer','world'), '5803': ('Kleine Inselentwicklungsländer','world'),
 '5815': ('Einkommensarme Länder mit Nahrungsmitteldefizit','world'),
 '5817': ('Entwicklungsländer mit Netto-Nahrungsmittelimporten','world'),
}
def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def build(download=False):
    OUT.mkdir(parents=True, exist_ok=True)
    if download:
        with urllib.request.urlopen(INDEX, timeout=40) as r:
            info = next(d for d in json.load(r)['Datasets']['Dataset'] if d['DatasetCode']=='QI')
        assert info['FileLocation']==SOURCE
        write(OUT/'dataset.json', info)
        with urllib.request.urlopen(SOURCE, timeout=60) as r:
            raw = r.read(32*1024*1024+1)
        assert len(raw)<=32*1024*1024
        (OUT/'source.zip').write_bytes(raw)
    info = json.loads((OUT/'dataset.json').read_text(encoding='utf-8-sig'))
    labels = dict(csv.reader((ROOT/'scripts/atlas-agriculture-labels.tsv').open(encoding='utf-8'), delimiter='\t'))
    catalog=json.loads((DATA/'catalog.json').read_text(encoding='utf-8-sig'))
    ids={g['id'] for g in catalog['geographies']}
    areas={};items={};elements={};flags=collections.Counter();counts=collections.Counter();bounds={};rows=0;zeros=0
    raw=(OUT/'source.zip').read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        with z.open('Production_Indices_E_All_Data_(Normalized).csv') as f:
            for row in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
                rows+=1
                a=row['Area Code']; i=row['Item Code']; y=int(row['Year'])
                identity=(row['Area Code (M49)'],row['Area'])
                assert a not in areas or areas[a]==identity
                areas[a]=identity
                identity=(row['Item Code (CPC)'],row['Item'])
                assert i not in items or items[i]==identity
                items[i]=identity;elements[row['Element Code']]=row['Element']
                assert row['Unit']=='' and row['Year Code']==row['Year'] and row['Flag']=='E'
                flags[row['Flag']]+=1; counts[a]+=1; zeros+=float(row['Value'])==0
                bounds[a]=[min(bounds.get(a,[y,y])[0],y),max(bounds.get(a,[y,y])[1],y)]
        directory=list(csv.DictReader(io.StringIO(z.read('Production_Indices_E_AreaCodes.csv').decode('utf-8-sig'))))
    assert set(labels)==set(items), {'missing':sorted(set(items)-set(labels)), 'extra':sorted(set(labels)-set(items))}
    definitions=[]
    for code,(cpc,label) in items.items():
        prefix=cpc.lstrip("'")
        group='overview' if prefix.startswith('F') else ('02' if prefix.startswith('02') else prefix[:3])
        assert group in GROUPS
        definitions.append(dict(code=code,cpc=cpc,providerLabel=label,title=labels[code],group=group))
    area_defs=[];regions=[]
    for code,(m49,label) in areas.items():
        gid='provider:TWN' if code=='214' else 'm49:'+m49.lstrip("'")
        if code in REGIONS:
            title,region=REGIONS[code];gid='fao:'+code
            regions.append(dict(geographyId=gid,title=title+' · FAO',regionId=region))
        else:
            assert gid in ids, (code,m49,label)
        area_defs.append(dict(code=code,m49=m49,providerLabel=label,geographyId=gid))
    result=dict(version='2026-09-09.1',datasetId='fao-production-indices',url=SOURCE,
        metadataUrl='https://files-faostat.fao.org/production/QI/QI_e.pdf',release=info['DateUpdate'],
        topicIds=['food_water:crop_production','food_water:livestock','food_water:food_security'],
        groups=[dict(id=k,title=v) for k,v in GROUPS.items()],items=definitions,areas=area_defs,regions=regions,
        elements=elements,sourceFlags={'E':'FAO-Schätzwert'},recipe='fao-qi-gross-2014-2016-v1')
    write(DATA/'agriculture-catalog.json',result)
    write(EVIDENCE/'agriculture-source-audit.json',dict(source=SOURCE,metadata=info,sha256=hashlib.sha256(raw).hexdigest(),
        bytes=len(raw),rowCount=rows,items=len(items),areaCount=len(areas),countries=len(areas)-len(regions),
        sourceRegions=len(regions),flags=dict(flags),zeroValues=zeros,
        areas=[dict(**a,rows=counts[a['code']],years=bounds[a['code']]) for a in area_defs],
        directoryAreasWithoutRows=[r for r in directory if r['Area Code'] not in areas],
        boundaries=['Mainland China uses 41/156; the distinct China group uses 351/159.',
                    'Regions are provider aggregates, never averages of national indices.',
                    'Former countries listed only in the directory do not have rows in this release.',
                    'All values are flagged E (estimated). Zero is retained.',
                    'The original element labels say gross. The general PDF describes net deductions; do not recalculate or label these rows as net.']))
    print(json.dumps(dict(rows=rows,items=len(items),areas=len(areas),regions=len(regions),zeroValues=zeros)))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--download',action='store_true')
    build(parser.parse_args().download)
