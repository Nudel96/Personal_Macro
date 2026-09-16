"""Curate explicit SDG slices; never combine population/sector disaggregations."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[4]
TMP = ROOT / 'apps/desktop/.tmp/atlas-expansion'
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
source = {x['code']: x for x in json.loads((TMP/'sdg-series.json').read_text(encoding='utf8'))}
catalog = json.loads((DATA/'catalog.json').read_text(encoding='utf8'))
areas = []
known = {x['id']: x for x in catalog['geographies']}
for row in json.loads((TMP/'sdg-areas.json').read_text(encoding='utf8')):
    code = row['geoAreaCode']
    ident = 'world' if code == '1' else f'm49:{int(code):03}'
    if ident in known and (ident == 'world' or known[ident]['kind'] == 'area'):
        areas.append(dict(code=code, providerLabel=row['geoAreaName'], geographyId=ident))

metrics = []
def metric(code, topic, title, unit, note, dimensions=None, suffix='', connect=False, compare=True):
    original = source[code]
    metrics.append(dict(
        id='unsdg:'+code+(':'+suffix if suffix else ''), topicId=topic, sourceId='unsdg',
        providerCode=code, label=title, providerLabel=original['description'], unit=unit,
        observationKind='source_estimates', throughYear=2025, explanation=note,
        scopeNote='UN-SDG-Ausgabe 2026.Q2.G.02. Die jeweilige Ursprungsquelle, Datenart, Fußnoten und gegebenenfalls Unsicherheitsgrenzen bleiben erhalten. Keine Markt- oder Anlagebewertung.',
        dimensions={'Reporting Type':'G', **(dimensions or {})},
        indicator=original['indicator'][0], connect=connect, compare=compare,
    ))

metric('SL_ISV_IFEM','labor:informal_work','Informelle Beschäftigung · 13. ICLS','Anteil an der Beschäftigung (%)','Informelle Beschäftigung ab 15 Jahren, beide Geschlechter und alle Wirtschaftszweige. Die Definition nach 13. ICLS bleibt getrennt von der neueren 19. ICLS.', {'Age':'15+','Sex':'BOTHSEX','Activity':'TOTAL'})
metric('SL_ISV_IFEM_19ICLS','labor:informal_work','Informelle Beschäftigung · 19. ICLS','Anteil an der Beschäftigung (%)','Informelle Beschäftigung nach 19. ICLS; beide Geschlechter ab 15 Jahren und alle Wirtschaftszweige. Die ältere Reihe wird nicht angehängt.', {'Age':'15+','Sex':'BOTHSEX','Activity':'TOTAL'})
metric('EN_EWT_RCYR','materials:recycling','Elektroschrott · Recyclinganteil','Anteil am Elektroschrott (%)','Dokumentiert gesammelter und recycelter Elektroschrott relativ zur erzeugten Menge. Diese Quote beschreibt nur Elektroschrott.')
metric('EN_MWT_RCYR','materials:recycling','Siedlungsabfälle · Recyclinganteil','Anteil an Siedlungsabfällen (%)','Veröffentlichter Recyclinganteil der Siedlungsabfälle. Abfalldefinitionen und Erfassung können sich zwischen Ländern unterscheiden.')
metric('ST_GDP_ZS','consumer_services:tourism','Tourismus · direkter Beitrag zum BIP','Anteil am BIP (%)','Veröffentlichter direkter Tourismusbeitrag. Einzelne Länder melden touristische Bruttowertschöpfung als Ersatzgröße; die jeweilige Abgrenzung steht am Quellenpunkt. Indirekte Effekte sind nicht als Gesamtbeitrag enthalten.')
metric('ST_EMP_TRSMN','consumer_services:tourism','Beschäftigte in Tourismusbranchen','Personen','Beschäftigte in den abgegrenzten Tourismusbranchen. Diese Branchen bedienen auch Einheimische; die Zahl ist keine ausschließlich durch Reisende ausgelöste Beschäftigung.')
metric('SP_ROD_R2KM','transport:roads','Ländlicher Zugang zu ganzjährig nutzbaren Straßen','Anteil der ländlichen Bevölkerung (%)','Menschen im ländlichen Raum in höchstens zwei Kilometern Entfernung zu einer ganzjährig nutzbaren Straße. Einzelne Erhebungsjahre; kein Straßennetzbestand.', {'Location':'RURAL'})
metric('SI_POV_DAY1','institutions:poverty','Armut unter 3 Dollar pro Tag · Kaufkraftbasis 2021','Bevölkerungsanteil (%)','Bevölkerung unter der internationalen Armutsgrenze von 3 Dollar pro Tag auf Kaufkraftbasis 2021. Ländererhebungen verwenden Einkommen oder Konsum; Erhebungsjahr und Grundlage stehen am Quellenpunkt.', {'Age':'ALLAGE','Location':'ALLAREA','Sex':'BOTHSEX'})
metric('SI_POV_NAHC','institutions:poverty','Nationale Armutsgrenze','Bevölkerungsanteil (%)','Armut nach der jeweiligen nationalen Grenze. Länder verwenden unterschiedliche Grenzen; diese Reihe wird deshalb nur für ein Land angezeigt.', {'Location':'ALLAREA'}, compare=False)
metric('GC_GOB_TAXD','institutions:tax_structure','Steuern zur Finanzierung des Staatshaushalts','Anteil am Staatshaushalt (%)','Anteil des Haushalts, der durch inländische Steuern finanziert wird. Die institutionelle Abgrenzung der Originalquelle bleibt maßgeblich.')
metric('GC_TAX_TOTL_GD_ZS','institutions:tax_structure','Steuereinnahmen im Verhältnis zum BIP','Anteil am BIP (%)','Veröffentlichte Steuerquote. Sie beschreibt die in der Quelle erfasste staatliche Ebene, nicht zwangsläufig sämtliche gesamtstaatlichen Abgaben.')
metric('EN_ATM_CO2GDP','environment:emission_intensity','CO₂-Intensität der Wirtschaftsleistung','kg CO₂ je internationalem Dollar (Kaufkraftbasis 2021)','CO₂ im Verhältnis zur kaufkraftbereinigten Wirtschaftsleistung auf Basis 2021. Sinkende Intensität bedeutet nicht zwingend sinkende Gesamtemissionen.', connect=True)
metric('ER_RSK_LST','environment:biodiversity_context','Red List Index · Aussterberisiko','Index · 1 = geringeres, 0 = höchstes Risiko','Veröffentlichter Index des Aussterberisikos bewerteter Arten. Höher bedeutet geringeres Risiko; Unsicherheitsgrenzen gehören zur Quellenangabe.', connect=True)
metric('SG_DSR_LGRGSR','environment:adaptation','Umsetzung nationaler Katastrophenvorsorge','Index','Selbstberichteter Umsetzungsstand nationaler Strategien zur Katastrophenrisikominderung nach dem Sendai-Rahmen. Das ist keine Messung vermiedener Schäden.')
metric('SG_DSR_SILS','environment:adaptation','Lokale Strategien zur Katastrophenvorsorge','Anteil lokaler Regierungen (%)','Anteil lokaler Regierungen mit abgestimmten Strategien zur Katastrophenrisikominderung. Die nationale Verwaltungsstruktur beeinflusst den Nenner.')
metric('DC_TOF_INFRAL','transport:infrastructure_spending','Öffentliche internationale Infrastrukturfinanzierung','Mio. US-Dollar (Preisbasis 2024)','Offizielle Entwicklungs- und weitere öffentliche Finanzflüsse an Empfängerländer für Infrastruktur. Das sind keine gesamten inländischen Infrastrukturinvestitionen.')
metric('GF_COM_PPPI','transport:infrastructure_spending','Infrastrukturprojekte mit privater Beteiligung','Mio. laufende US-Dollar','Zugesagte Investitionen in Infrastrukturprojekte mit privater Beteiligung. Zusagen beim Finanzierungsabschluss sind keine tatsächlich im jeweiligen Jahr ausgezahlten Gesamtausgaben.')
for tech, label in [('ALL','Insgesamt'),('SOLAR','Solar'),('WIND','Wind'),('HYDROPOWER','Wasserkraft'),('BIOENERGY','Bioenergie'),('GEOTHERMAL','Geothermie')]:
    metric('EG_IFF_RANDN','energy_systems:energy_investment',f'Internationale Erneuerbaren-Finanzierung · {label}','Mio. US-Dollar (Preisbasis 2023)','Internationale Finanzierungszusagen an Entwicklungsländer für saubere Energieforschung und erneuerbare Erzeugung, preisbereinigt auf 2023 mit den Deflatoren der Geber. Zusagen sind keine tatsächlichen Auszahlungen und keine gesamten Energieinvestitionen.', {'Type of renewable technology':tech}, suffix=tech)
metric('VC_DTH_TOTR','institutions:conflict_context','Dokumentierte konfliktbedingte Todesfälle','Todesfälle je 100.000 Menschen','Veröffentlichte konfliktbedingte Sterberate. Erfassungsgrenzen und Unsicherheit stehen in der Quelle; fehlende Länderjahre bedeuten keine Konfliktfreiheit.', {'Age':'ALLAGE','Sex':'BOTHSEX','Cause of death':'_T'})
for code, kind, unit in [('IS_RDP_FRGVOL','Güterverkehr','Tonnenkilometer'),('IS_RDP_PFVOL','Personenverkehr','Personenkilometer')]:
    for transport, label, topic in [('ROA','Straße','transport:roads'),('RAI','Schiene','transport:rail'),('AIR','Luftverkehr','transport:aviation')]:
        metric(code, topic, f'{kind} · {label}', unit, 'Verkehrsleistung des ausdrücklich gewählten Verkehrsträgers. Entfernung und beförderte Menge werden gemeinsam erfasst; der Wert ist weder Umsatz noch ein Bestand an Infrastruktur.', {'Mode of transportation':transport}, suffix=transport)
metric('EG_FEC_RNEW','energy_systems:energy_efficiency','Erneuerbare am gesamten Endenergieverbrauch','Anteil am Endenergieverbrauch (%)','Erneuerbare Energie über Strom, Wärme und Verkehr im Verhältnis zum gesamten Endenergieverbrauch. Diese Perspektive ist von einem reinen Strommix getrennt.', connect=True)
metric('SH_H2O_SAFE','food_water:drinking_water','Sicher bewirtschaftetes Trinkwasser','Bevölkerungsanteil (%)','Sicher bewirtschaftete Trinkwasserversorgung für die Gesamtbevölkerung nach der JMP-Definition. Dies stellt strengere Anforderungen als eine grundlegende Versorgung.', {'Location':'ALLAREA'}, connect=True)
metric('SH_SAN_SAFE','food_water:sanitation','Sicher bewirtschaftete Sanitärversorgung','Bevölkerungsanteil (%)','Sicher bewirtschaftete Sanitärversorgung der Gesamtbevölkerung; veröffentlichte JMP-Schätzungen.', {'Location':'ALLAREA'}, connect=True)

topic_ids = {x['id'] for x in catalog['topics']}
invalid = [x['topicId'] for x in metrics if x['topicId'] not in topic_ids]
if invalid:
    print('Unknown topic ids:', sorted(set(invalid)))
    print('Candidates:', [t for t in catalog['topics'] if t['groupId'] in ['transport','food_water','energy_systems']])
    raise SystemExit(1)
result = dict(version='2026-09-10.1', release='2026.Q2.G.02', sourceUrl='https://unstats.un.org/SDGAPI/swagger/', areas=areas, series=metrics)
audit_file = TMP/'sdg-source-audit.json'
if audit_file.exists():
    audit = json.loads(audit_file.read_text(encoding='utf8'))
    verified = {row['id']: row for row in audit['results']}
    assert not audit['failures'], audit['failures']
    for item in metrics:
        row = verified[item['id']]
        assert not row['conflicts'] and row['numericRows'] > 0 and len(row['units']) == 1, row['id']
        item.update(expectedUnit=row['units'][0],expectedRows=row['requestedRows'],expectedNumeric=row['numericRows'],areaCount=row['areaCount'])
(DATA/'sdg-catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f'{len(metrics)} SDG perspectives, {len(set(x["topicId"] for x in metrics))} topics, {len(areas)} mapped countries/areas')
