"""Audit and append five UN SDG service slices without rebuilding older definitions.

Independent full-series downloads are compared with the exact paginated native
query. Run without --apply to research; --apply installs only these definitions.
"""
import argparse
import collections
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'apps/desktop/src/features/world-atlas/data'
TMP = ROOT / 'apps/desktop/.tmp/atlas-remaining-40'
EVIDENCE = Path(__file__).resolve().parent
cfg = json.loads((DATA / 'sdg-catalog.json').read_text(encoding='utf-8'))
metadata = {x['code']: x for x in json.loads((ROOT / 'apps/desktop/.tmp/atlas-expansion/sdg-series.json').read_text(encoding='utf-8'))}
spec = importlib.util.spec_from_file_location('sdg_audit', EVIDENCE / 'audit_sdg_expansion.py')
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)

definitions = []
common = {'Age': 'ALLAGE', 'Sex': 'BOTHSEX', 'Reporting Type': 'G', 'Disability status': '_T'}
for suffix, label, meaning in [
    ('GOV', 'Zufriedenheit mit Behördenleistungen', 'Gesamtzufriedenheit mit Verwaltungsleistungen wie Ausweisen und Personenstandsregistrierung.'),
    ('HLTH', 'Zufriedenheit mit Gesundheitsdiensten', 'Gesamtzufriedenheit mit der Gesundheitsversorgung. Der UN-Zielstandard betrifft die grundlegende öffentliche Versorgung; einzelne Ursprungsbefragungen grenzen Gesundheitsdienste weiter ab.'),
    ('PRM', 'Zufriedenheit mit Primarschulen', 'Gesamtzufriedenheit mit der Primarschulbildung. Einzelne Länder melden das gesamte Bildungssystem als Ersatz; diese Abweichung bleibt am Quellenjahr sichtbar.'),
    ('SEC', 'Zufriedenheit mit Sekundarschulen', 'Gesamtzufriedenheit mit der Sekundarschulbildung. Die tatsächlich erfasste Schulstufe und Befragung stehen in den Quellenhinweisen.'),
]:
    code = 'SP_PSR_OSATIS_' + suffix
    definitions.append(dict(
        id='unsdg:' + code, topicId='institutions:public_services', sourceId='unsdg',
        providerCode=code, providerLabel=metadata[code]['description'], label=label,
        unit='Anteil der erfassten Befragten (%)', observationKind='source_estimates', throughYear=2025,
        explanation=meaning + ' Veröffentlicht wird die Antwort auf die Gesamtfrage, kein selbst berechneter Durchschnitt einzelner Qualitätsmerkmale.',
        scopeNote='UN-SDG-Ausgabe 2026.Q2.G.02, Indikator 16.6.2. Befragungen von Statistikämtern, OECD und Gallup unterscheiden sich in Fragen, Teilnehmerkreis und Antwortskala. Zufriedenheit beschreibt eine Erfahrung oder Wahrnehmung; sie ist kein objektiver Leistungsindex. Die Ansichten bleiben deshalb pro Land getrennt. Einzelne Erhebungsjahre werden nicht verbunden. Ursprungsbefragung, Fußnoten und Datenart bleiben je Jahr erhalten.',
        dimensions={**common, 'Location': 'ALLAREA', 'Population Group': 'TOTAL', 'Quantile': '_T'},
        indicator='16.6.2', connect=False, compare=False, unfiltered=True,
    ))
code = 'SP_TRN_PUBL'
definitions.append(dict(
    id='unsdg:' + code, topicId='transport:public_transport', sourceId='unsdg',
    providerCode=code, providerLabel=metadata[code]['description'], label='Erreichbarkeit öffentlicher Verkehrsmittel',
    unit='Anteil der erfassten Bevölkerung (%)', observationKind='source_estimates', throughYear=2025,
    explanation='Veröffentlichte Länder- und Weltwerte zur Erreichbarkeit öffentlicher Verkehrsmittel. Der UN-Standard misst Fußwege von bis zu 500 Metern zu kleineren Verkehrssystemen oder einem Kilometer zu Bahn, Metro und Fähre. Die jeweilige städtische oder nationale Abgrenzung steht am Quellenjahr.',
    scopeNote='UN-SDG-Ausgabe 2026.Q2.G.02, Indikator 11.2.1. Nur veröffentlichte Gesamtzeilen ohne einzelne Stadt oder Sonderuntergruppe werden übernommen. Länderwerte können auf Stadtstichproben beruhen; sie beschreiben weder Fahrgastzahlen noch Umsatz oder den Anteil am Verkehr. Nationale Methoden und die Erfassung informeller Haltestellen unterscheiden sich. Einzelne Erhebungsjahre bleiben unverbunden. Die Weltreihe stammt unverändert von der UN, nicht aus einer eigenen Ländermittelung.',
    dimensions={**common, 'Cities': 'NOCITI'}, indicator='11.2.1', connect=False, compare=True, unfiltered=True,
))


def selected(rows, definition):
    result = [r for r in rows if r['dimensions'] == definition['dimensions']
              and r['geoAreaCode'] in audit_module.areas
              and r['timePeriodStart'] <= 2025
              and definition['indicator'] in r['indicator']]
    return sorted(result, key=lambda r: (r['geoAreaCode'], r['timePeriodStart']))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    results, expected = [], []
    for definition in definitions:
        result = audit_module.run(definition)
        assert result['units'] == ['PERCENT'] and not result['conflicts']
        rows = []
        for page in range(1, len(result['urls']) + 1):
            path = audit_module.TMP / (definition['id'].replace(':', '_') + f'-slice-{page}.json')
            rows.extend(json.loads(path.read_text(encoding='utf-8'))['data'])
        native_slice = selected(rows, definition)
        full_rows = json.loads((TMP / (definition['providerCode'] + '-all.json')).read_text(encoding='utf-8'))
        assert native_slice == selected(full_rows, definition), 'Filtered and full original queries differ'
        for row in native_slice:
            assert row['valueType'] in ('Integer', 'Float')
            assert 0 <= float(row['value']) <= 100
            flag = dict(provider='unsdg', value=row['value'], valueType=row['valueType'],
                        lowerBound=row['lowerBound'], upperBound=row['upperBound'],
                        timeDetail=row.get('time_detail'), timeCoverage=row['timeCoverage'],
                        basePeriod=row['basePeriod'], source=row['source'], footnotes=row['footnotes'],
                        attributes=row['attributes'], dimensions=row['dimensions'])
            expected.append(dict(seriesId=definition['id'], geographyId=audit_module.areas[row['geoAreaCode']]['geographyId'],
                                 year=int(row['timePeriodStart']), value=float(row['value']), sourceFlag=flag))
        definition.update(expectedUnit='PERCENT', expectedRows=result['requestedRows'],
                          expectedNumeric=result['numericRows'], areaCount=result['areaCount'])
        result.update(first=min(r['timePeriodStart'] for r in native_slice),
                      natures=dict(collections.Counter(r['attributes'].get('Nature') for r in native_slice)),
                      independentFullSeriesMatched=True,
                      metadataUrl='https://unstats.un.org/sdgs/metadata/files/Metadata-' + '-'.join(f'{int(part):02d}' for part in definition['indicator'].split('.')) + '.pdf')
        results.append(result)
    (TMP / 'sdg-services-expected.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2), encoding='utf-8')
    (TMP / 'sdg-services-definitions.json').write_text(json.dumps(definitions, ensure_ascii=False, indent=2), encoding='utf-8')
    (EVIDENCE / 'sdg-services-audit.json').write_text(json.dumps(dict(checkedAt='2026-09-11', release=cfg['release'], results=results), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.apply:
        ids = {d['id'] for d in definitions}
        cfg['series'] = [d for d in cfg['series'] if d['id'] not in ids] + definitions
        cfg['version'] = '2026-09-11.1'
        (DATA / 'sdg-catalog.json').write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        catalog = json.loads((DATA / 'catalog.json').read_text(encoding='utf-8'))
        catalog['series'] = [d for d in catalog['series'] if d['id'] not in ids] + definitions
        catalog['version'] = '2026-09-11.8'
        for definition in definitions:
            topic = next(t for t in catalog['topics'] if t['id'] == definition['topicId'])
            group = next(g for g in catalog['groups'] if g['id'] == topic['groupId'])
            if 'unsdg' not in group['sourceIds']:
                group['sourceIds'].append('unsdg')
        (DATA / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(definitions)} service perspectives, {len(expected)} original observations; applied={args.apply}', flush=True)


if __name__ == '__main__':
    main()
