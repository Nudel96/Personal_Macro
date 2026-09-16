"""Inspect public UNSD SDG metadata; raw downloads stay in the ignored workspace."""
import concurrent.futures
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[4]
CACHE = ROOT / 'apps/desktop/.tmp/atlas-expansion'
CODES = '''SL_ISV_IFEM SL_ISV_IFEM_19ICLS EN_EWT_RCYR EN_MWT_RCYR ST_GDP_ZS ST_EMP_TRSMN
SP_ROD_R2KM SP_TRN_PUBL SI_POV_DAY1 SI_POV_NAHC GC_GOB_TAXD GC_TAX_TOTL_GD_ZS
EN_ATM_CO2GDP ER_RSK_LST SG_DSR_LGRGSR SG_DSR_SILS DC_TOF_INFRAL GF_COM_PPPI
EG_IFF_RANDN SP_PSR_SATIS_HLTH SP_PSR_SATIS_GOV SP_PSR_SATIS_PRM
VC_DTH_TOTR IS_RDP_FRGVOL IS_RDP_PFVOL EG_FEC_RNEW EN_MAT_DOMCMPC EN_MAT_FTPRPC
SH_H2O_SAFE SH_SAN_SAFE'''.split()

def get(code):
    target = CACHE / f'{code}-probe.json'
    if not target.exists():
        query = urllib.parse.urlencode(dict(seriesCode=code, releaseCode='2026.Q2.G.02', pageSize=3, page=1))
        url = 'https://unstats.un.org/SDGAPI/v1/sdg/Series/Data?' + query
        target.write_bytes(urllib.request.urlopen(url, timeout=90).read())
    data = json.loads(target.read_text(encoding='utf8'))
    return dict(code=code, count=data['totalElements'], dimensions=data['dimensions'],
                attributes=data['attributes'], sample=data['data'][:1])

if __name__ == '__main__':
    CACHE.mkdir(exist_ok=True, parents=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        jobs = {executor.submit(get, code): code for code in CODES}
        for future in concurrent.futures.as_completed(jobs):
            try:
                row = future.result()
                results.append(row)
                print(row['code'], row['count'], flush=True)
            except Exception as error:
                print(jobs[future], type(error).__name__, str(error)[:180], flush=True)
    (CACHE / 'sdg-probes.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
