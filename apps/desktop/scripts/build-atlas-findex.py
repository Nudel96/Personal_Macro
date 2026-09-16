"""Build the Findex catalog from the downloaded public CSV and glossary.

Run from apps/desktop with the bundled Python. No network or personal data.
The output contains definitions and geography mappings, never observations.
"""
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.tmp/atlas-validation/findex'
BASE = 'https://thedocs.worldbank.org/en/doc/be6615202d1f08a25855c8ac2d615122-0050012025/related/'
csv_path = SOURCE / 'GlobalFindexDatabase2025.csv'
glossary_path = SOURCE / 'GlobalFindex2025-glossary.xlsx'
with csv_path.open(encoding='utf-8-sig', newline='') as file:
    reader = csv.DictReader(file)
    rows = list(reader)
    headers = reader.fieldnames
book = openpyxl.load_workbook(glossary_path, read_only=True, data_only=True)
glossary = {r[0]: (r[1], r[2]) for r in list(book['Glossary'].values)[1:] if r[0]}
catalog = json.loads((ROOT/'src/features/world-atlas/data/catalog.json').read_text(encoding='utf-8-sig'))
iso = {a['iso3']: a for a in catalog['geographies'] if a['iso3']}

groups = [
    ('accounts', 'Konten & Karten'), ('barriers', 'Zugangshürden'),
    ('payments', 'Digitale Zahlungen'), ('saving', 'Sparen & Leihen'),
    ('resilience', 'Finanzielle Reserven'), ('transfers', 'Geld empfangen & senden'),
    ('digital', 'Digitale Teilhabe'),
]
# All fields below use adults aged 15+ as their denominator, or the selected
# published demographic subgroup. Never substitute conditional *_s fields.
specs = [
    ('accounts','account.t.d','Ein Konto besitzen','Bank-, ähnliches Finanzinstituts- oder Mobile-Money-Konto; nicht zu einer Summe addieren.'),
    ('accounts','fiaccount.t.d','Konto bei einem Finanzinstitut','Eigener oder gemeinsamer Kontobesitz bei einer Bank oder einem ähnlichen Finanzinstitut.'),
    ('accounts','mobileaccount.t.d','Mobile Money nutzen','Persönliche Nutzung eines Mobile-Money-Dienstes im vergangenen Jahr; kein gewöhnliches Onlinebanking.'),
    ('accounts','fin2.t.d','Debitkarte nutzen','Veröffentlichte Nutzung einer Debitkarte; nicht mit dem Besitz einer Kreditkarte gleichsetzen.'),
    ('accounts','fin10','Kreditkarte besitzen','Besitz einer Kreditkarte; keine Aussage über Schuldenhöhe oder Kartennutzung.'),
    ('accounts','fin9b','Kontostand digital prüfen','Kontostand im vergangenen Jahr per Mobiltelefon oder Internet geprüft.'),
    ('barriers','fin11a','Finanzinstitut zu weit entfernt','Kein Konto wegen großer Entfernung. Bezogen auf alle Erwachsenen, nicht nur Menschen ohne Konto.'),
    ('barriers','fin11b','Finanzdienste zu teuer','Kein Konto wegen hoher Kosten. Mehrere Gründe können gleichzeitig genannt werden.'),
    ('barriers','fin11c','Erforderliche Dokumente fehlen','Kein Konto wegen fehlender Unterlagen, beispielsweise Ausweis oder Einkommensnachweis.'),
    ('barriers','fin11f','Vertrauen fehlt','Kein Konto wegen fehlenden Vertrauens in Banken oder ähnliche Finanzinstitute.'),
    ('barriers','fin11d','Zu wenig Geld für ein Konto','Kein Konto wegen unzureichender finanzieller Mittel. Das ist keine amtliche Armutsquote.'),
    ('barriers','fin11e','Jemand in der Familie hat ein Konto','Kein eigenes Konto, weil bereits ein Familienmitglied eines besitzt.'),
    ('payments','g20.any','Digital gezahlt oder Geld erhalten','Mindestens eine digitale Zahlung gesendet oder empfangen; Personenanteil, kein Zahlungsvolumen.'),
    ('payments','g20.made','Digital bezahlt','Im vergangenen Jahr digital bezahlt oder Geld über ein Konto gesendet.'),
    ('payments','g20.received','Digital Geld erhalten','Im vergangenen Jahr Geld digital erhalten, etwa Lohn, Überweisungen oder staatliche Zahlungen.'),
    ('payments','merchant.pay','Beim Händler digital bezahlt','Im Geschäft per Karte oder Mobiltelefon beziehungsweise bei einem Onlinekauf digital bezahlt.'),
    ('payments','fin26a','Rechnungen digital bezahlt','Im vergangenen Jahr Rechnungen per Mobiltelefon oder Internet beglichen.'),
    ('payments','fin26b','Online eingekauft','Im vergangenen Jahr per Mobiltelefon oder Internet etwas gekauft. Das misst keine Umsätze des Onlinehandels.'),
    ('saving','save.any.t.d','Geld zurückgelegt','Im vergangenen Jahr auf irgendeine Weise gespart oder Geld zurückgelegt; kein Sparbetrag.'),
    ('saving','fin17a.17a1.d','Über ein Konto gespart','Bei einer Bank, einem ähnlichen Finanzinstitut oder über Mobile Money gespart.'),
    ('saving','fin17f','Für das Alter gespart','Von der Quelle veröffentlichtes Sparen für das Alter; keine Höhe oder ausreichende Altersvorsorge.'),
    ('saving','borrow.any.t.d','Geld geliehen','Im vergangenen Jahr aus irgendeiner Quelle Geld geliehen; keine Schuldenquote.'),
    ('saving','fin22a.22a1.22g.d','Über Finanzdienste geliehen','Kredit von einem Finanzinstitut, per Kreditkarte oder Mobile Money; keine ausstehende Kreditsumme.'),
    ('saving','fin22b','Bei Familie oder Freunden geliehen','Im vergangenen Jahr Geld von Familie, Verwandten oder Freunden geliehen.'),
    ('resilience','fin24aP','Notgeld beschaffen möglich','Nach eigener Einschätzung den im Fragebogen genannten Notbetrag innerhalb von 30 Tagen beschaffen können.'),
    ('resilience','fin24aN','Notgeld nicht als möglich angegeben','Enthält laut Quelle auch „weiß nicht“ und verweigerte Antworten; nicht ausschließlich nachgewiesene Unmöglichkeit.'),
    ('resilience','fin24aND','Notgeld ohne Schwierigkeiten','Den genannten Notbetrag innerhalb von 30 Tagen nach eigener Einschätzung ohne Schwierigkeiten beschaffen können.'),
    ('resilience','fin24sav','Notgeld aus Ersparnissen','Ersparnisse als hauptsächliche Notgeldquelle, wenn Beschaffung innerhalb von 30 Tagen möglich ist. Nenner sind alle Erwachsenen.'),
    ('resilience','fin24fam','Notgeld von Familie oder Freunden','Familie, Verwandte oder Freunde als hauptsächliche Notgeldquelle. Keine tatsächlich erfolgte Überweisung.'),
    ('resilience','fin24work','Notgeld durch Arbeit','Arbeit als hauptsächliche Quelle für einen kurzfristigen Notbetrag. Selbstbericht, kein gesichertes zukünftiges Einkommen.'),
    ('transfers','fin32.acc','Lohn auf ein Konto erhalten','Lohn im vergangenen Jahr auf ein Finanzinstitutskonto, eine Karte oder per Mobiltelefon erhalten; Nenner sind alle Erwachsenen.'),
    ('transfers','fing2p.acc','Staatliche Zahlung auf ein Konto','Transfer, öffentliche Rente oder Staatslohn auf ein Konto, eine Karte oder per Mobiltelefon erhalten.'),
    ('transfers','fin42.acc','Agrarerlöse auf ein Konto erhalten','Erlöse aus Agrarprodukten, Ernten oder Vieh auf ein Konto, eine Karte oder per Mobiltelefon erhalten.'),
    ('transfers','fh1.fh2','Geld innerhalb des Landes gesendet oder erhalten','Geld an beziehungsweise von Familie oder Freunden in einem anderen Landesteil; unterschiedliche Vorgänge können dieselben Personen betreffen.'),
    ('transfers','fin28.29','Inländisches Geld über Konten transferiert','Solche inländischen Überweisungen über ein Finanzinstituts- oder Mobile-Money-Konto abgewickelt.'),
    ('transfers','fh2a','Geld aus dem Ausland erhalten','Im vergangenen Jahr internationale Rücküberweisungen erhalten; Personenanteil, kein Geldbetrag.'),
    ('digital','con1','Ein Mobiltelefon besitzen','Ein eigenes Mobiltelefon für persönliche Anrufe besitzen; kein Zählen von SIM-Karten oder Verträgen.'),
    ('digital','internet','Internet genutzt','Internet in den vergangenen drei Monaten genutzt; andere Bezugsperiode als die WDI-Internetreihe.'),
    ('digital','con9a','Smartphone als Haupttelefon','Das hauptsächlich genutzte Mobiltelefon ist ein Smartphone; Nenner sind alle Erwachsenen.'),
    ('digital','con30e','Online gelernt','In den vergangenen drei Monaten online Informationen zum Lernen oder zur Weiterbildung aufgerufen.'),
    ('digital','con30f','Mit Apps oder Webseiten verdient','In den vergangenen drei Monaten Apps oder Webseiten zum Geldverdienen genutzt; kein gemessenes Einkommen.'),
    ('digital','con30g','Staatliche Informationen online genutzt','In den vergangenen drei Monaten staatliche Dienste oder Informationen online genutzt.'),
]
populations = [
    {'id':'all','group':'all','value':'all','label':'Alle ab 15 Jahren'},
    {'id':'women','group':'gender','value':'women','label':'Frauen ab 15 Jahren'},
    {'id':'men','group':'gender','value':'men','label':'Männer ab 15 Jahren'},
    {'id':'poorest','group':'income','value':'poorest 40%','label':'Ärmere 40 % der Haushalte · Erwachsene'},
    {'id':'richest','group':'income','value':'richest 60%','label':'Wohlhabendere 60 % der Haushalte · Erwachsene'},
]
regions = {
    'LMY':('developing','Entwicklungsländer · Findex','world'),
    'EAP':('east_asia_pacific','Ostasien & Pazifik ohne hohe Einkommen · Findex','world'),
    'ECA':('europe_central_asia','Europa & Zentralasien ohne hohe Einkommen · Findex','world'),
    'MNA':('middle_east_north_africa','Nahost & Nordafrika ohne hohe Einkommen · Findex','world'),
    'SSA':('sub_saharan_africa','Afrika südlich der Sahara ohne hohe Einkommen · Findex','Africa'),
    'LAC':('latin_america_caribbean','Lateinamerika & Karibik ohne hohe Einkommen · Findex','Americas'),
    'SAS':('south_asia','Südasien · Findex','Asia'),
    'HIC':('high_income','Hohe Einkommen · Findex','world'),
    'LIC':('low_income','Niedrige Einkommen · Findex','world'),
    'LMC':('lower_middle_income','Untere mittlere Einkommen · Findex','world'),
    'UMC':('upper_middle_income','Obere mittlere Einkommen · Findex','world'),
}
source_areas = {}
for r in rows:
    if r['codewb'] in source_areas: assert source_areas[r['codewb']] == r['countrynewwb']
    source_areas[r['codewb']] = r['countrynewwb']
areas = []
for code, label in sorted(source_areas.items()):
    if code in regions:
        slug, title, region_id = regions[code]
        areas.append({'code':code,'label':label,'geographyId':f'findex:{slug}','iso3':'','title':title,'regionId':region_id,'aggregate':True})
    else:
        assert code in iso, (code,label)
        area=iso[code]
        areas.append({'code':code,'label':label,'geographyId':area['id'],'iso3':code,'title':area['label'],'regionId':area['regionId'],'aggregate':code=='WLD'})
metrics=[]
for group, code, label, note in specs:
    assert code in glossary,code
    field=code.replace('.','_')
    assert field in headers,field
    metrics.append({'id':field,'field':field,'group':group,'label':label,'note':note,'sourceCode':code,'sourceLabel':glossary[code][0],'sourceDefinition':glossary[code][1]})
selected={(p['group'],p['value']) for p in populations}
selected_rows=[r for r in rows if (r['group'],r['group2']) in selected]
keys=set();numeric=0
for r in selected_rows:
    key=(r['codewb'],r['year'],r['group'],r['group2'])
    assert key not in keys,key
    keys.add(key)
    for m in metrics:
        value=r[m['field']]
        if value=='NA':continue
        assert Decimal(0)<=Decimal(value)<=Decimal(1),(key,m['field'],value)
        numeric+=1
cfg={
    'datasetId':'worldbank-findex-2025','recipe':'worldbank-findex-survey-v1',
    'release':'Global Findex 2025 · Länderdatei, geprüft am 9. September 2026',
    'sourceUrl':'https://www.worldbank.org/en/publication/globalfindex/download-data',
    'url':BASE+csv_path.name,'bytes':csv_path.stat().st_size,'sha256':hashlib.sha256(csv_path.read_bytes()).hexdigest(),
    'glossaryUrl':BASE+glossary_path.name,'glossarySha256':hashlib.sha256(glossary_path.read_bytes()).hexdigest(),
    'methodologyUrl':'https://www.worldbank.org/en/publication/globalfindex/methodology',
    'delayedSurveyUrl':'https://microdata.worldbank.org/index.php/catalog/4607',
    'years':sorted({int(r['year']) for r in rows}), 'headers':headers,
    'expectedRows':len(rows),'expectedSelectedRows':len(selected_rows),'expectedNumericCells':numeric,
    'groups':[{'id':id,'label':label} for id,label in groups], 'populations':populations,
    'metrics':metrics,'areas':areas,
    'sourceGroups':[{'group':g,'value':v,'rows':n} for (g,v),n in sorted(Counter((r['group'],r['group2']) for r in rows).items())],
}
output=ROOT/'src/features/world-atlas/data/findex-catalog.json'
output.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'profiles':len(areas),'countries':sum(not a['aggregate'] for a in areas),'metrics':len(metrics),'rows':len(rows),'selectedRows':len(selected_rows),'numericCells':numeric,'years':cfg['years']}))
