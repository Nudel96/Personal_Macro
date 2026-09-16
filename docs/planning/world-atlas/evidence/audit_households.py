"""Read the public UN 2026 workbook independently; never modify a workbook or user journal.

--write-catalog writes reviewed metadata only. --cache accepts the isolated test profile only.
"""
import argparse
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sqlite3
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[4]
PROFILE = 'com.personal-macro.atlas-households-20260909'
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
SHA = 'fde0eedd2d3e7f32ad5d8bd8f9ba694dae7f4046190e9adb12175adcce0fb63c'
UNWEIGHTED = {'1912', '2894', '1905', '1920', '5243', '1924', '1938', '1917'}
# Source positions are fixed, one-based and independently checked against the full headers.
SPECS = [
 ('averageSize','size','Menschen pro Haushalt','persons','Durchschnitt der üblichen Bewohner je Haushalt. Besucher zählen nicht mit.'),
 ('size1','size','Eine Person','percent','Anteil der Haushalte mit genau einer Person.'),
 ('size2to3','size','Zwei bis drei Personen','percent','Anteil der Haushalte mit zwei oder drei Personen.'),
 ('size4to5','size','Vier bis fünf Personen','percent','Anteil der Haushalte mit vier oder fünf Personen.'),
 ('size6plus','size','Sechs oder mehr Personen','percent','Anteil der Haushalte mit mindestens sechs Personen.'),
 ('femaleHead','head','Weibliche Bezugsperson','percent','Haushalte mit einer als weiblich erfassten Haushaltsbezugsperson. Die Erhebungsrolle sagt nichts über Entscheidungsmacht aus.'),
 ('headUnder20','head','Bezugsperson unter 20','percent','Haushalte mit einer Bezugsperson im Alter von 0 bis 19 Jahren.'),
 ('head20to64','head','Bezugsperson von 20 bis 64','percent','Haushalte mit einer Bezugsperson im Alter von 20 bis 64 Jahren.'),
 ('head60plus','head','Bezugsperson ab 60','percent','Haushalte mit einer Bezugsperson ab 60 Jahren; die Gruppe ab 65 ist darin enthalten.'),
 ('head65plus','head','Bezugsperson ab 65','percent','Haushalte mit einer Bezugsperson ab 65 Jahren.'),
 ('memberUnder15','members','Mit Menschen unter 15','percent','Haushalte mit mindestens einer Person im Alter von 0 bis 14 Jahren.'),
 ('memberUnder18','members','Mit Menschen unter 18','percent','Haushalte mit mindestens einer Person im Alter von 0 bis 17 Jahren.'),
 ('memberUnder20','members','Mit Menschen unter 20','percent','Haushalte mit mindestens einer Person im Alter von 0 bis 19 Jahren.'),
 ('member60plus','members','Mit Menschen ab 60','percent','Haushalte mit mindestens einer Person ab 60 Jahren.'),
 ('member65plus','members','Mit Menschen ab 65','percent','Haushalte mit mindestens einer Person ab 65 Jahren.'),
 ('under15and60','sharedAges','Unter 15 und ab 60','percent','Haushalte mit mindestens einer Person unter 15 und einer ab 60. Verwandtschaft ist nicht vorausgesetzt.'),
 ('under15and65','sharedAges','Unter 15 und ab 65','percent','Haushalte mit mindestens einer Person unter 15 und einer ab 65. Verwandtschaft ist nicht vorausgesetzt.'),
 ('under18and60','sharedAges','Unter 18 und ab 60','percent','Haushalte mit mindestens einer Person unter 18 und einer ab 60. Verwandtschaft ist nicht vorausgesetzt.'),
 ('under18and65','sharedAges','Unter 18 und ab 65','percent','Haushalte mit mindestens einer Person unter 18 und einer ab 65. Verwandtschaft ist nicht vorausgesetzt.'),
 ('under20and60','sharedAges','Unter 20 und ab 60','percent','Haushalte mit mindestens einer Person unter 20 und einer ab 60. Verwandtschaft ist nicht vorausgesetzt.'),
 ('under20and65','sharedAges','Unter 20 und ab 65','percent','Haushalte mit mindestens einer Person unter 20 und einer ab 65. Verwandtschaft ist nicht vorausgesetzt.'),
 ('meanUnder15All','ageCounts','Unter 15 · alle Haushalte','persons','Durchschnittliche Zahl der Menschen unter 15, bezogen auf alle Haushalte, auch ohne Kinder.'),
 ('meanUnder15Present','ageCounts','Unter 15 · nur Haushalte mit dieser Altersgruppe','persons','Durchschnittliche Zahl der Menschen unter 15, nur in Haushalten mit mindestens einer Person unter 15.'),
 ('meanUnder20All','ageCounts','Unter 20 · alle Haushalte','persons','Durchschnittliche Zahl der Menschen unter 20, bezogen auf alle Haushalte.'),
 ('meanUnder20Present','ageCounts','Unter 20 · nur Haushalte mit dieser Altersgruppe','persons','Durchschnittliche Zahl der Menschen unter 20, nur in Haushalten mit mindestens einer Person unter 20.'),
 ('mean20to64All','ageCounts','20 bis 64 · alle Haushalte','persons','Durchschnittliche Zahl der Menschen von 20 bis 64, bezogen auf alle Haushalte. Das ist keine Erwerbstätigenzahl.'),
 ('onePerson','types','Allein wohnend','percent','Haushalte mit genau einer Person. Gleicher Begriff wie die Größenklasse, aber eine eigene veröffentlichte Spalte mit eigener Verfügbarkeit.'),
 ('coupleOnly','types','Paar ohne weitere Personen','percent','Verheiratetes oder in Partnerschaft lebendes Paar, ohne weitere Haushaltsmitglieder.'),
 ('coupleChildren','types','Paar mit Kindern','percent','Paar und seine Kinder, ohne weitere Personen. Kinder können erwachsen sein; leibliche, Stief-, Adoptiv- und Pflegekinder sind eingeschlossen.'),
 ('singleParent','types','Ein Elternteil mit Kindern','percent','Ein Elternteil und seine Kinder, ohne weitere Personen. Die Kinder können erwachsen sein.'),
 ('singleMother','types','Mutter mit Kindern','percent','Teilgruppe der Haushalte mit einem Elternteil: Mutter und ihre Kinder, ohne weitere Personen. Kinder jeder Altersstufe.'),
 ('singleFather','types','Vater mit Kindern','percent','Teilgruppe der Haushalte mit einem Elternteil: Vater und seine Kinder, ohne weitere Personen. Kinder jeder Altersstufe.'),
 ('extendedFamily','types','Erweiterte Familie','percent','Verwandte außerhalb der Kernfamilie leben zusammen; alle Mitglieder sind miteinander verwandt.'),
 ('nonRelatives','types','Auch nicht verwandte Personen','percent','Mindestens zwei Haushaltsmitglieder sind nicht miteinander verwandt; weitere Mitglieder können verwandt sein.'),
 ('unknownType','types','Verwandtschaft unklar','percent','Mindestens eine Beziehung zur Haushaltsbezugsperson ist unbekannt oder nicht angegeben. Ein veröffentlichter Anteil, kein Ersatz für fehlende Daten.'),
 ('nuclear','generations','Kernfamilienhaushalte','percent','Veröffentlichte Summe aus Paaren ohne weitere Personen, Paaren mit Kindern und einem Elternteil mit Kindern. Keine Aussage über eine einzige Generation.'),
 ('multiGeneration','generations','Mehrere erwachsene Generationen','percent','Mindestens zwei Generationen verwandter Menschen ab 20 Jahren leben zusammen.'),
 ('threeGeneration','generations','Drei oder mehr Generationen','percent','Mindestens drei verwandte Generationen leben zusammen, unabhängig vom Alter.'),
 ('skipGeneration','generations','Großeltern und Enkel ohne Eltern','percent','Großeltern leben mit Enkeln zusammen, ohne einen Elternteil dieser Enkel im Haushalt.'),
]
GROUPS = [
 ('size','Haushaltsgröße'), ('types','Formen des Zusammenlebens'),
 ('generations','Generationen unter einem Dach'), ('members','Altersgruppen im Haushalt'),
 ('sharedAges','Jüngere und Ältere zusammen'), ('ageCounts','Menschen nach Altersgruppen'),
 ('head','Haushaltsbezugsperson'),
]

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'), parse_float=Decimal)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=ROOT/'apps/desktop/.tmp/atlas-validation/households/source.xlsx')
    parser.add_argument('--write-catalog',action='store_true')
    parser.add_argument('--cache',type=Path)
    parser.add_argument('--native',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    raw=args.source.read_bytes();assert hashlib.sha256(raw).hexdigest()==SHA and len(raw)==399250
    book=load_workbook(args.source,read_only=True,data_only=True)
    sheet=book['HH size and composition 2026']
    allrows=list(sheet.iter_rows(values_only=True))
    assert len(allrows)==1134 and all(all(v is None for v in row[49:]) for row in allrows)
    headers=list(allrows[4][:49]); assert headers[:3]==['Country and area','Location ID','ISO3 Code']
    assert headers[10]=='Average household size (number of members)' and headers[48]=='Skip generation'
    assert len(SPECS)==39
    geo={g['iso3']:g['id'] for g in read(DATA/'catalog.json')['geographies'] if g['iso3'] and g['kind']!='aggregate'}
    profiles=defaultdict(list);areas={};counts=Counter();yearcounts=Counter();seen=set()
    for rownumber,r in enumerate(allrows[5:],6):
        code=r[2];year=int(r[8]);cat=str(r[6]);sid=str(r[7]); key=(cat,sid)
        assert code in geo and key not in seen and 1959<=year<=2025
        seen.add(key);yearcounts[(code,year)]+=1
        m49=int(r[1]);assert geo[code]==('provider:XKX' if code=='XKX' else f'm49:{m49:03}')
        values={}
        for col,(field,group,label,unit,explanation) in enumerate(SPECS,10):
            token=r[col];value=None if token=='..' else Decimal(str(token))
            assert value is None or (value.is_finite() and 0<=value<=(100 if unit=='percent' else 30))
            values[field]=value
            counts['missing' if value is None else 'numeric']+=1
            counts['zero']+=int(value==0)
        unweighted=cat=='MICS' and sid in UNWEIGHTED
        counts['unweightedObservations']+=unweighted
        profiles[code].append(dict(recordId=f'unhh2026:{rownumber}',sourceRow=rownumber,year=year,sourceCategory=cat,
                                   sourceCatalogId=sid,sourceName=r[9],unweighted=unweighted,values=values))
        a=areas.setdefault(code,dict(code=code,locationId=m49,geographyId=geo[code],providerLabels=set(),years=set(),rowCount=0))
        assert a['locationId']==m49
        a['providerLabels'].add(r[0]);a['years'].add(year);a['rowCount']+=1
    book.close();assert len(profiles)==200 and len(seen)==1129 and counts['unweightedObservations']==8
    for a in areas.values():
        a['years']=sorted(a['years']);a['providerLabels']=sorted(a['providerLabels'])
    cfg=dict(version='2026-09-09.1',datasetId='un-households-2026',release='UN DESA · August 2026 · verarbeitet bis 30. Juni 2026',
             url='https://population.un.org/household/assets/UNDESA_PD_2026_hh-size-composition.xlsx',
             sourcePage='https://population.un.org/household/',
             documentationUrl='https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/undesa_pd_2026_methodology-report_hh-size-composition.pdf',
             documentationSha256='a0235739117d56a37aa0daf57ed206b89590d4db3c854038044a168577e993d2',
             licenseUrl='https://creativecommons.org/licenses/by/3.0/igo/',
             sha256=SHA,fileSize=len(raw),recipe='un-households-2026-original-observations-v1',sheet='HH size and composition 2026',
             sheets=['Important Note','Definitions','Data Sources','HH size and composition 2026','Footnote'],
             firstYear=1959,lastYear=2025,rowCount=1129,numericCellCount=counts['numeric'],headers=headers,
             topicId='demography:households',groups=[dict(id=i,label=l) for i,l in GROUPS],
             metrics=[dict(id=f,group=g,label=l,unit=u,column=i+11,explanation=e) for i,(f,g,l,u,e) in enumerate(SPECS)],
             sourceCategories=sorted({r['sourceCategory'] for rs in profiles.values() for r in rs}),
             unweightedMicsCatalogIds=sorted(UNWEIGHTED),areas=[areas[c] for c in sorted(areas)])
    if args.write_catalog:
        (DATA/'households-catalog.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    else: assert read(DATA/'households-catalog.json')==cfg
    native=None
    if args.native:
        native={r['profile']['providerCode']:r for r in read(args.native) if r['status']=='available'}
    if args.cache:
        assert not args.native
        path=args.cache.resolve(strict=True)
        assert PROFILE in path.parts and path.name=='cache.sqlite' and path.parent.name=='atlas'
        with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
            prov=json.loads(db.execute('SELECT provenance_json FROM atlas_households_dataset WHERE id=?',(cfg['datasetId'],)).fetchone()[0],parse_float=Decimal)
            native={}
            for (text,) in db.execute('SELECT profile_json FROM atlas_households_areas WHERE dataset_id=?',(cfg['datasetId'],)):
                profile=json.loads(text,parse_float=Decimal);native[profile['providerCode']]={'profile':profile,'provenance':prov,'status':'available'}
    if native is not None:
        assert set(native)==set(profiles)
        for code,points in profiles.items():
            row=native[code];p=row['profile'];prov=row['provenance']
            assert p['geographyId']==geo[code] and p['providerLabels']==areas[code]['providerLabels']
            assert prov['sha256']==SHA and prov['recipe']==cfg['recipe'] and prov['url']==cfg['url']
            expected=sorted(points,key=lambda p:(p['year'],p['sourceRow']))
            assert p['observations']==expected,code
    result=dict(status='native_exact_match' if native is not None else 'source_reviewed',sourceUrl=cfg['url'],sha256=SHA,
                areas=len(profiles),observations=1129,metrics=39,firstYear=1959,lastYear=2025,counts=counts,
                multipleSourceCountryYears=sum(n>1 for n in yearcounts.values()),
                geographyCatalogVersion=read(DATA/'catalog.json')['version'],
                coverage=[dict(code=code,**{k:v for k,v in a.items() if k!='code'}) for code,a in sorted(areas.items())])
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='coverage'},ensure_ascii=True))

if __name__=='__main__':main()
