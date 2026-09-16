"""Table 1 of the EU advanced-materials report: one explicit 2010–2024 window."""
import hashlib
import json
import re
from pathlib import Path
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
DATA=ROOT/'apps/desktop/src/features/world-atlas/data'
RAW=ROOT/'apps/desktop/.tmp/atlas-remaining-40'
ID='eu-advanced-materials'
FILE='eu-materials-2026.pdf'
VERSION='2026-09-11.21'
URL='https://op.europa.eu/o/opportal-service/download-handler?identifier=18eaba28-a5ac-11f1-b25c-01aa75ed71a1&format=pdf&language=en&productionSystem=cellar&part='
DOC='https://op.europa.eu/en/publication-detail/-/publication/18eaba28-a5ac-11f1-b25c-01aa75ed71a1/language-en'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def norm(s):return ' '.join(s.split())

pdf=PdfReader(RAW/FILE)
assert len(pdf.pages)==106
page=norm(pdf.pages[16].extract_text())
assert 'Company data (2010-2024)' in page and 'EU US China' in page
table=page.split('Construction ',1)[1].split('Source: PATSTAT data.',1)[0]
table='Construction '+table
labels=[('construction','Construction','Bau'),('electronics','Electronics','Elektronik'),('energy','Energy','Energie'),
        ('medical',r'Medical devices \(NACE 3250\)','Medizintechnik · Tabellenlabel NACE 3250'),
        ('mobility','Mobility','Mobilität'),('total',r'Total of unique patents\s*11','Gesamt · eindeutige Patentfamilien')]
rows=[]
for code,pattern,label in labels:
    captures=re.findall(pattern+r'\s+([0-9,]+)\s+([0-9.]+)%\s+([0-9,]+)\s+([0-9.]+)%\s+([0-9,]+)\s+([0-9.]+)%',table)
    assert len(captures)==1
    v=captures[0]
    values={g:{'count':v[2*i].replace(',',''),'triadic':v[2*i+1]} for i,g in enumerate(['EU','US','China'])}
    for g in values.values():assert int(g['count'])>=0 and 0<=float(g['triadic'])<=100
    rows.append({'code':code,'label':label,'pattern':pattern,'values':values})
assert next(r for r in rows if r['code']=='total')['values']['China']['count']=='194216'
assert sum(int(r['values']['EU']['count']) for r in rows if r['code']!='total') != 28865
methods=norm(pdf.pages[69].extract_text())
for s in ['Company > University > Public Research Organisation > Individual','European Patent Office (EP)',
          'not limited strictly to the EU-27 member states','single priority region among the EU, the US, or China']:
    assert s in methods
assert 'European Patent Office (EPO), the United States Patent and Trademark Office (USPTO) and the Japan Patent Office (JPO)' in norm(pdf.pages[15].extract_text())

main=read(DATA/'catalog.json')
geo={'id':'eu:am_priority','label':'EU-Patentämter und EPA · Prioritätsgebiet','iso3':'','regionId':'Europe','kind':'aggregate'}
if not any(g['id']==geo['id'] for g in main['geographies']):main['geographies'].append(geo)
else:assert next(g for g in main['geographies'] if g['id']==geo['id'])==geo
areas=[{'code':'EU','label':'EU priority jurisdiction','geographyId':geo['id'],'seriesTitles':{}},
       {'code':'US','label':'US priority jurisdiction','geographyId':'m49:840','seriesTitles':{}},
       {'code':'China','label':'China priority jurisdiction','geographyId':'m49:156','seriesTitles':{}}]
scope=('Europäische Kommission, Patent landscape analysis in the field of advanced materials, 2026, DOI 10.2777/0610738, '
       'Tabelle 1 (PDF-Seite 17), PATSTAT-Auswertung. Ein zusammengefasstes Quellenfenster 2010–2024, keine Jahresreihe. '
       'Die Studie grenzt fortgeschrittene Werkstoffe über Patentklassen und prioritäre Sektoren ab; keine Gesamtheit aller Chemie- oder Metallurgiepatente. '
       'DOCDB-Patentfamilien mit mindestens einem Unternehmensanmelder; keine Umsätze oder nachgewiesene kommerzielle Nutzung. '
       'Herkunft bedeutet erste Patentzuständigkeit, nicht Firmensitz oder Wohnort von Erfindern. '
       'EU umfasst die 27 nationalen Ämter plus EPA und besitzt deshalb ein eigenes Quellengebiet. '
       'US entspricht USPTO, China CNIPA. Familien mit mehrdeutiger Prioritätsregion werden in dieser Tabelle ausgeschlossen. '
       'Mehrfachzuordnung zu Sektoren ist möglich; die fünf Sektorwerte dürfen nicht zur veröffentlichten eindeutigen Gesamtsumme addiert werden. '
       'Triadische Familien wurden bei EPA, USPTO und JPO angemeldet. Ihr Anteil beschreibt internationale Schutzstrategien, keine allgemeine technische Qualitätsnote. '
       'Keine Interpolation, Jahresaufteilung oder Zusammenführung mit den getrennten Tabellen zu Universitäten oder Unternehmensstandorten. '
       'Tabellenzahlen unverändert; deutsche Beschriftungen ergänzt. CC BY 4.0, Europäische Union 2026.')
metrics=[];profiles=[]
for r in sorted(rows,key=lambda r:(r['code']!='total',next(i for i,x in enumerate(rows) if x['code']==r['code']))):
    for field in ['count','triadic']:
        code=r['code']+'_'+field
        title=f"Table 1 · {r['code']} · {'Number of AM patent families' if field=='count' else 'Share of triadic families'} · Companies · 2010–2024"
        label=r['label']+' · '+('Patentfamilien' if field=='count' else 'Triadenanteil')
        unit='Patentfamilien (Anzahl)' if field=='count' else 'Anteil triadischer Patentfamilien (%)'
        note=('Veröffentlichte Anzahl unterschiedlicher Patentfamilien im gesamten 15-Jahres-Fenster.' if field=='count'
              else 'Veröffentlichter Anteil mit Schutz in Europa, USA und Japan, bezogen auf die Patentfamilien dieser Tabellenzelle.')
        metrics.append({'id':ID+':'+code,'sourceId':ID,'topicId':'innovation:advanced_materials','providerCode':code,
            'label':label,'unit':unit,'frequency':'period_total','kind':'period_snapshot','comparison':'same_definition',
            'connectAdjacent':False,'explanation':note,'scopeNote':scope})
        for a in areas:
            a['seriesTitles'][code]=title
            area_note={'EU':'Priorität bei einem EU27-Patentamt oder beim EPA; keine ausschließliche EU-Erfinderherkunft.',
                       'US':'Priorität beim USPTO; kein Nachweis eines US-Unternehmenssitzes.',
                       'China':'Priorität bei CNIPA; kein Nachweis eines chinesischen Unternehmenssitzes.'}[a['code']]
            profiles.append({'metricId':ID+':'+code,'geographyId':a['geographyId'],'providerArea':a['code'],'providerLabel':a['label'],
                'providerTitle':title,'unit':unit,'points':[{'period':'2010/2024','value':r['values'][a['code']][field],
                'status':'Veröffentlichter Zeitraumwert 2010–2024','breakBefore':False,'notes':[note,area_note],
                'lowerBound':None,'upperBound':None}]})
profiles.sort(key=lambda p:(p['metricId'],p['geographyId']))
source={'id':ID,'label':'EU-Studie · Neue Materialien · Patentfamilien','adapter':'eu_materials_pdf','url':URL,
        'documentationUrl':DOC,'licenseUrl':'https://creativecommons.org/licenses/by/4.0/','publishedAt':'2026-09-01',
        'reviewedAt':'2026-09-11','recipe':'eu-am-2026-table1-companies-priority-period2010to2024-v1',
        'observationKind':'period_aggregate','expectedSha256':hashlib.sha256((RAW/FILE).read_bytes()).hexdigest(),
        'expectedRows':6,'expectedNumeric':36,'firstPeriod':'2010','lastPeriod':'2024','areas':areas}
contract={'sourceId':ID,'file':FILE,'pages':106,'tablePage':17,'tableTitle':'Table 1. Number of AM patents in selected AM sectors and share of triadic families per priority jurisdiction.',
          'period':'2010/2024','rows':rows,'geographies':areas,'scope':scope,'profileNotes':{p['metricId']+':'+p['geographyId']:p['points'][0]['notes'] for p in profiles}}
catalog=read(DATA/'public-series-catalog.json');catalog['sources']=[s for s in catalog['sources'] if s['id']!=ID]+[source]
catalog['metrics']=[m for m in catalog['metrics'] if m['sourceId']!=ID]+metrics;catalog['version']=VERSION
write(DATA/'public-series-catalog.json',catalog);main['version']=VERSION;write(DATA/'catalog.json',main)
write(DATA/'public-materials-contract.json',contract);write(RAW/'materials-expected-profiles.json',profiles)
write(HERE/'public-materials-audit.json',{'reviewedAt':'2026-09-11','source':source,'contract':contract,'profiles':36,'values':36,
    'visualTableReview':['output/eu-materials-page-17.png','output/eu-materials-page-70.png'],'nativePdfExtraction':'106 pages; page 17 checked independently with pdf-extract 0.12.0',
    'excluded':'Other tables use different ownership/priority/residence populations; table 5 has an ambiguous printed percentage. No inferred yearly series.'})
ledger=read(HERE/'remaining-40-ledger.json');topic=next(t for t in ledger['topics'] if t['id']=='innovation:advanced_materials')
topic['research']=[{'sourceId':ID,'reviewedAt':'2026-09-11','evidence':'public-materials-audit.json'}]
if topic['status']=='research_pending':topic['status']='source_validated'
write(HERE/'remaining-40-ledger.json',ledger)
print(json.dumps({'source':ID,'areas':3,'metrics':12,'periodFacts':36,'calendar':'2010/2024'}))
