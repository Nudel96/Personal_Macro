"""Audit editorial topic links against independently parsed, reviewed NYU XLS files.

Run from the repository root. Requires xlrd and the original public workbooks in
apps/desktop/.tmp/atlas-validation/valuation; reads no personal databases.
"""
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(__file__).resolve().parent
DATA = ROOT / "apps/desktop/src/features/world-atlas/data"
ORIGINALS = ROOT / "apps/desktop/.tmp/atlas-validation/valuation"
sys.path.insert(0, str(ORIGINALS / "python-deps"))
import xlrd


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


links = read(DATA / "valuation-topic-links.json")
catalog = read(DATA / "valuation-catalog.json")
atlas = read(DATA / "catalog.json")
downloads = {Path(row["file"]).name: row for row in read(ORIGINALS / "download-audit.json")}
topics = {topic["id"]: topic for topic in atlas["topics"]}
bindings = links["bindings"]
names = {name for link in bindings for name in link["providerLabels"]}
assert len({link["topicId"] for link in bindings}) == len(bindings)
for link in bindings:
    assert topics[link["topicId"]]["label"] == link["topicLabel"]
    assert len(set(link["providerLabels"])) == len(link["providerLabels"])
    assert link["scopeNote"]
assert not names.intersection({"Total Market", "Total Market (without financials)", "Grand Total"})
audits = []
for dataset in catalog["datasets"]:
    if dataset["kind"] != "industries":
        continue
    file = max(dataset["files"], key=lambda f: f["publicationYear"])
    path = ORIGINALS / file["fileName"]
    digest = sha256(path.read_bytes()).hexdigest()
    assert digest == downloads[path.name]["sha256"], path.name
    sheet = xlrd.open_workbook(path).sheet_by_name(file["sheetName"])
    header_index = next(r for r in range(sheet.nrows) if file["subjectHeader"] in sheet.row_values(r))
    column = sheet.row_values(header_index).index(file["subjectHeader"])
    source_names = {str(sheet.cell_value(r, column)).strip() for r in range(header_index + 1, sheet.nrows)}
    missing = sorted(names - source_names)
    assert not missing, (dataset["id"], missing)
    audits.append({"datasetId": dataset["id"], "fileName": path.name, "publicationYear": file["publicationYear"], "sha256": digest, "matchedIndustryNames": len(names), "unmatched": missing})

report = {
    "reviewedOn": links["reviewedAt"],
    "linkVersion": links["version"],
    "linkSha256": sha256((DATA / "valuation-topic-links.json").read_bytes()).hexdigest(),
    "classificationSource": links["classificationSource"],
    "industrySource": links["industrySource"],
    "classification": "Editorial navigation over separate NYU industries; no aggregate valuation or GICS classification.",
    "topicCount": len(bindings),
    "distinctIndustryCount": len(names),
    "topicIndustryLinks": sum(len(link["providerLabels"]) for link in bindings),
    "sourceIdentityChecks": audits,
    "nativeNumericData": "Reuses previously independently audited NYU observations; this audit adds no data and makes no new numerical accuracy claim.",
    "scopeLimits": "Own country industry scopes only USA, Japan, India and China. Other countries explicitly open the global sample. No hydrogen, nuclear, Africa-solar, lithium or cybersecurity valuation is inferred.",
}
(EVIDENCE / "valuation-topic-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: report[key] for key in ["topicCount", "distinctIndustryCount", "topicIndustryLinks"]}))
