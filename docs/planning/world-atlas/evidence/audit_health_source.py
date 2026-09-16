"""Independently audit already downloaded public WHO workbooks with openpyxl. No journal access."""
from pathlib import Path
import json, math, hashlib, openpyxl
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'apps/desktop/.tmp/atlas-validation/ghed'
CAT=ROOT/'apps/desktop/src/features/world-atlas/data/health-finance-catalog.json'
groups=[('volume','Umfang & Priorität'),('funding','Herkunft der Mittel'),('schemes','Versicherungen & Systeme'),('primary','Grundversorgung & Vorsorge'),('care','Versorgung & Arzneimittel'),('investment','Investitionen'),('conditions','Gesundheitsbereiche')]
choices=[
('che_gdp','Gesundheitsausgaben zur Wirtschaftsleistung','volume','percent_gdp','Laufende Gesundheitsausgaben im Verhältnis zum BIP. Investitionen sind gesondert erfasst.'),
('che_pc_usd','Gesundheitsausgaben je Einwohner','volume','current_usd_per_capita','Laufende US-Dollar je Einwohner. Preis- und Wechselkursänderungen wirken mit; kein reales Wachstum.'),
('gghed_gdp','Öffentliche Inlandsmittel zur Wirtschaftsleistung','volume','percent_gdp','Finanzierung aus inländischen Staatsmitteln und Sozialversicherungsbeiträgen. Der Nenner ist das BIP.'),
('gghed_gge','Gesundheit im öffentlichen Budget','volume','percent_gge','Inländische öffentliche Gesundheitsausgaben im Verhältnis zu allen Staatsausgaben.'),
('gghed_che','Öffentliche Mittel aus dem Inland','funding','percent_che','Anteil aus inländischen Staatsmitteln und Sozialversicherungsbeiträgen an den laufenden Gesundheitsausgaben.'),
('pvtd_che','Private Mittel aus dem Inland','funding','percent_che','Private Finanzierungsquellen einschließlich eigener Haushaltszahlungen. Keine Einnahmen nur privater Kliniken.'),
('ext_che','Finanzierung aus dem Ausland','funding','percent_che','Ausländische Transfers für laufende Gesundheitsausgaben, einschließlich staatlich verteilter Mittel.'),
('oops_che','Direkte Zahlungen der Haushalte','funding','percent_che','Direkt selbst bezahlte Gesundheitsleistungen. Versicherungsbeiträge sind darin nicht enthalten.'),
('vpp_che','Freiwillige Vorauszahlungen','funding','percent_che','Freiwillige Vorauszahlungen als Finanzierungsquelle. Dies ist keine Quote versicherter Menschen.'),
('dom_che','Alle Mittel aus dem Inland','funding','percent_che','Öffentliche und private Inlandsmittel zusammen. Diese Reihe überlappt mit ihren Untergruppen.'),
('cfa_che','Staatliche und verpflichtende Systeme','schemes','percent_che','Staatliche Systeme und obligatorische beitragsfinanzierte Systeme zusammen; Untergruppen nicht hinzuaddieren.'),
('gfa_che','Staatliche Finanzierungssysteme','schemes','percent_che','Ausgaben staatlicher Systeme. Die Gliederung nach Systemen unterscheidet sich von der Herkunft der Mittel.'),
('chi_che','Verpflichtende Krankenversicherung','schemes','percent_che','Obligatorische beitragsfinanzierte Krankenversicherungssysteme, einschließlich sozialer Krankenversicherung.'),
('shi_che','Soziale Krankenversicherung','schemes','percent_che','Ausgaben sozialer Krankenversicherungssysteme. Eine Untergruppe der verpflichtenden Versicherung.'),
('vhi_che','Freiwillige Krankenversicherung','schemes','percent_che','Ausgaben freiwilliger Krankenversicherungssysteme; keine Zahl oder Quote der Versicherten.'),
('row_che','Finanzierung durch ausländische Systeme','schemes','percent_che','Ausgaben nicht ansässiger Finanzierungssysteme für die Bevölkerung dieses Landes. Nicht gleich allen ausländischen Geldquellen.'),
('phc_che','Grundversorgung im Gesundheitsbudget','primary','percent_che','WHO-Abgrenzung der Grundversorgung, einschließlich fest zugeteilter Anteile von Gütern und Verwaltung. Keine reine Hausarztstatistik.'),
('phc_usd_pc','Grundversorgung je Einwohner','primary','current_usd_per_capita','Ausgaben nach der WHO-Abgrenzung der Grundversorgung in laufenden US-Dollar je Einwohner.'),
('gghed_phc_phc','Öffentlicher Anteil an der Grundversorgung','primary','percent_phc','Inländische öffentliche Mittel im Verhältnis zu den Ausgaben der Grundversorgung.'),
('ext_phc_phc','Auslandsanteil an der Grundversorgung','primary','percent_phc','Ausländische Mittel im Verhältnis zu den Ausgaben der Grundversorgung.'),
('pvtd_phc_phc','Privater Anteil an der Grundversorgung','primary','percent_phc','Private Inlandsmittel im Verhältnis zu den Ausgaben der Grundversorgung.'),
('hc62_che','Impfprogramme im Gesundheitsbudget','primary','percent_che','Ausgaben für Impfprogramme. Dies ist keine Impfquote und umfasst mehr als den Kauf von Impfstoffen.'),
('hc1_usd_pc','Behandlungsausgaben je Einwohner','care','current_usd_per_capita','Kurative Versorgung nach Gesundheitszweck, unabhängig von der Art des Anbieters.'),
('hc2_usd_pc','Rehabilitationsausgaben je Einwohner','care','current_usd_per_capita','Rehabilitative Gesundheitsversorgung in laufenden US-Dollar je Einwohner.'),
('hc3_usd_pc','Gesundheitliche Pflegeausgaben je Einwohner','care','current_usd_per_capita','Gesundheitlicher Teil der Langzeitpflege. Rein soziale Betreuung ist nicht vollständig enthalten.'),
('hcri1_usd_pc','Arzneimittelausgaben insgesamt je Einwohner','care','current_usd_per_capita','Gesamter Arzneimittelverbrauch innerhalb und außerhalb von Behandlungsleistungen; zusätzlicher Merkposten, kein separater addierbarer Versorgungsblock.'),
('hc6_usd_pc','Präventionsausgaben je Einwohner','care','current_usd_per_capita','Präventive Gesundheitsleistungen in laufenden US-Dollar je Einwohner. Ausgaben messen keine Wirksamkeit.'),
('hp1_usd_pc','Krankenhausausgaben je Einwohner','care','current_usd_per_capita','Ausgaben bei Krankenhausanbietern unabhängig von Eigentum und Finanzierung. Überschneidet sich mit der Gliederung nach Gesundheitszweck.'),
('hk_usd_pc','Gesundheitsinvestitionen je Einwohner','investment','current_usd_per_capita','Erwerb von Vermögensgütern durch Gesundheitsanbieter; separat von laufenden Ausgaben. Fehlende Investitionen werden von der WHO nicht geschätzt.'),
('hk111_usd_pc','Infrastrukturinvestitionen je Einwohner','investment','current_usd_per_capita','Investitionen in Infrastruktur von Gesundheitsanbietern, keine Bewertung von Krankenhausimmobilien.'),
('hk112_usd_pc','Investitionen in Ausstattung je Einwohner','investment','current_usd_per_capita','Investitionen in Maschinen und Ausstattung von Gesundheitsanbietern. Keine Umsätze der gesamten Medizintechnikbranche.'),
('hk113_usd_pc','Wissensbasierte Investitionsgüter je Einwohner','investment','current_usd_per_capita','Investitionen der Gesundheitsanbieter in geistiges Eigentum, etwa Software. Kein allgemeiner Innovationsindex.'),
('dis1_che','Infektions- und parasitäre Krankheiten','conditions','percent_che','Ausgaben für diese Krankheitsgruppe als Anteil der laufenden Gesundheitsausgaben; keine Erkrankungshäufigkeit.'),
('dis2_che','Reproduktive Gesundheit','conditions','percent_che','Ausgaben für reproduktive Gesundheit einschließlich mütterlicher und perinataler Versorgung sowie Familienplanung.'),
('dis3_che','Ernährungsbedingte Mangelzustände','conditions','percent_che','Ausgaben für ernährungsbedingte Mangelzustände; keine Quote mangelernährter Menschen.'),
('dis4_che','Nicht übertragbare Krankheiten','conditions','percent_che','Ausgaben für nicht übertragbare Krankheiten als Anteil der laufenden Gesundheitsausgaben.'),
('dis5_che','Verletzungen','conditions','percent_che','Ausgaben für Verletzungen als Anteil der laufenden Gesundheitsausgaben.'),
('disnec_che','Andere oder nicht zugeordnete Bereiche','conditions','percent_che','Andere und nicht näher bezeichnete Krankheiten und Zustände. Die WHO verteilt nicht krankheitsspezifische Ausgaben teilweise auf die übrigen Gruppen.'),
]
downloads=json.loads((OUT/'downloads.json').read_text())
book=openpyxl.load_workbook(OUT/'data.xlsx',read_only=True,data_only=True)
codebook=list(book['Codebook'].values);by_code={r[0]:r for r in codebook[1:]}
headers=next(book['Data'].values)
metrics=[]
for field,label,group,unit,note in choices:
    definition=by_code[field];assert definition[5] == ('Ones' if unit=='current_usd_per_capita' else 'Percentage')
    assert definition[6] == ('US$' if unit=='current_usd_per_capita' else '-')
    metrics.append({'id':field,'field':field,'label':label,'group':group,'unit':unit,'scopeNote':note,'column':headers.index(field),'definition':list(definition)})
version=[r[0] for r in book['Version'].values]
catalog=json.loads((ROOT/'apps/desktop/src/features/world-atlas/data/catalog.json').read_text(encoding='utf-8'))
geographies={g['iso3']:g for g in catalog['geographies'] if g.get('iso3')}
areas={};profiles={};numbers=0;missing=0;minmax={m['field']:[None,None,0] for m in metrics};abnormal=[]
for rowno,row in enumerate(book['Data'].iter_rows(min_row=2,values_only=True),2):
    label,code,region,income,year=row[:5]
    assert isinstance(code,str) and code in geographies,(rowno,code,label)
    assert isinstance(year,int) and 2000<=year<=2024
    area={'code':code,'label':label,'region':region,'income':income,'geographyId':geographies[code]['id']}
    assert code not in areas or areas[code]==area
    areas[code]=area;points=profiles.setdefault(code,[])
    assert all(p['year']!=year for p in points)
    values={}
    for m in metrics:
        value=row[m['column']]
        if value is None:missing+=1
        else:
            assert isinstance(value,(int,float)) and math.isfinite(value),(rowno,m['field'],value)
            numbers+=1;r=minmax[m['field']];r[0]=value if r[0] is None else min(r[0],value);r[1]=value if r[1] is None else max(r[1],value);r[2]+=1
            if value<0 or (m['unit'].startswith('percent_') and value>100.00001):abnormal.append([code,year,m['field'],value])
        values[m['field']]=value
    points.append({'year':year,'values':values})
metadata={}
for n,row in enumerate(book['Metadata'].iter_rows(min_row=2,values_only=True),2):
    assert row[1] in areas,(n,row[:3])
    metadata.setdefault(row[1],[]).append(list(row))
book.close()
notesbook=openpyxl.load_workbook(OUT/'country-notes.xlsx',read_only=True,data_only=True)
notes={r[2]:list(r) for r in notesbook.active.iter_rows(min_row=2,values_only=True) if r[2]}
notesbook.close()
for code in areas:assert code in notes
with ZipFile(OUT/'data.xlsx') as z:
    zipinfo=[{'name':f.filename,'bytes':f.file_size} for f in z.infolist()]
config={'version':'2026-09-09.1','datasetId':'who-health-finance','recipe':'who-ghed-april-2026-v1','release':'WHO GHED · Korrektur 1. April 2026','sourceUrl':'https://apps.who.int/nha/database/DocumentationCentre/en','methodologyUrl':downloads[1]['url'],'files':[downloads[0],downloads[4]],'workbookVersion':version,'expectedRows':4612,'expectedColumns':4120,'metadataRows':sum(map(len,metadata.values())),'metrics':metrics,'groups':[{'id':id,'label':label} for id,label in groups],'areas':sorted(areas.values(),key=lambda a:a['code']),'firstYear':2000,'lastYear':2024,'preliminarySince':2024}
assert json.loads(CAT.read_text(encoding='utf-8')) == config, 'Catalog differs from the independently read WHO source'
reference={'areas':areas,'profiles':profiles,'metadata':metadata,'notes':notes}
(OUT/'reference.json').write_text(json.dumps(reference,ensure_ascii=False),encoding='utf-8')
report={'release':config['release'],'downloads':downloads,'areas':len(areas),'metrics':len(metrics),'rows':sum(map(len,profiles.values())),'numericCells':numbers,'missingCells':missing,'metadataRows':config['metadataRows'],'abnormal':abnormal,'coverage':{field:{'min':values[0],'max':values[1],'numericCells':values[2]} for field,values in minmax.items()},'zip':zipinfo,'countries':{code:{'years':[min(p['year'] for p in points),max(p['year'] for p in points)],'rows':len(points),'numericCells':sum(v is not None for p in points for v in p['values'].values())} for code,points in profiles.items()},'referenceSha256':hashlib.sha256((OUT/'reference.json').read_bytes()).hexdigest()}
(OUT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report['areaCrosswalk']=config['areas']
report['methodologyPagesVisuallyReviewed']=[9,18,19,20,26]
(ROOT/'docs/planning/world-atlas/evidence/health-source-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:report[k] for k in ['release','areas','metrics','rows','numericCells','missingCells','metadataRows']},ensure_ascii=True))
