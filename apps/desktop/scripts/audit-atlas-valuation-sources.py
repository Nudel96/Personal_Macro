"""Read-only audit of explicitly published Damodaran workbook links."""
import argparse
import hashlib
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--download', action='store_true')
parser.add_argument('--inspect', action='store_true')
options = parser.parse_args()
ROOT = options.output.resolve()
ROOT.mkdir(parents=True, exist_ok=True)
ALLOWED = {"pages.stern.nyu.edu", "www.stern.nyu.edu", "people.stern.nyu.edu"}


def get(url, path):
    if urllib.parse.urlparse(url).hostname not in ALLOWED:
        raise ValueError("Unexpected source host")
    if path.exists():
        return path.read_bytes()
    with urllib.request.urlopen(url, timeout=35) as response:
        if urllib.parse.urlparse(response.url).hostname not in ALLOWED:
            raise ValueError("Unexpected redirect host")
        data = response.read(4 * 1024 * 1024 + 1)
        if len(data) > 4 * 1024 * 1024:
            raise ValueError("Source response too large")
    path.write_bytes(data)
    return data


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.href = None
        self.text = ""

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href")
            self.text = ""

    def handle_data(self, data):
        if self.href:
            self.text += data

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.links.append((self.href, self.text.strip()))
            self.href = None


manifest = []
for page in ["datacurrent", "dataarchived"]:
    url = f"https://pages.stern.nyu.edu/~adamodar/New_Home_Page/{page}.html"
    data = get(url, ROOT / f"{page}.html")
    parser = Links()
    parser.feed(data.decode("utf-8", errors="replace"))
    for href, label in parser.links:
        resolved = urllib.parse.urljoin(url, href).replace("http://", "https://", 1)
        name = pathlib.PurePosixPath(urllib.parse.urlparse(resolved).path).name
        if name.lower().startswith("countrystats") or re.fullmatch(r"(?:pbvdata|pbveurope|pbvjapan|pbvemerg|pbvglobal|pedata|peeurope|pejapan|peemerg|peglobal)\d{2}\.xls", name.lower()) or (
            page == "datacurrent" and name.lower().startswith(("pedata", "peindia", "pechina", "peglobal", "peeurope", "pejapan", "peemerg", "pbv"))
        ):
            if name.endswith((".xls", ".xlsx")) and resolved not in [x["url"] for x in manifest]:
                manifest.append({"url": resolved, "label": label, "page": page, "file": name})

# The Japan 1/25 archive cell incorrectly links to peEurope24.xls. The original
# Japan workbook is publicly reachable at the consistent archive location; its
# own date (2025-01-05), region (Japan) and reviewed bytes were checked directly.
manifest.append({
    "url": "https://pages.stern.nyu.edu/~adamodar/pc/archives/peJapan24.xls",
    "label": "1/25",
    "page": "dataarchived",
    "file": "peJapan24.xls",
    "archiveLinkCorrection": {
        "publishedTarget": "https://pages.stern.nyu.edu/~adamodar/pc/archives/peEurope24.xls",
        "verifiedWorkbookDate": "2025-01-05",
        "verifiedRegion": "Japan",
        "verifiedSha256": "fffc02a2575cb8962a85b01d945cc8b1151f286dc0898bcf597191c40db20df5",
    },
})
(ROOT / "published-links.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
if options.download:
    for item in manifest:
        path = ROOT / item["file"]
        try:
            data = get(item["url"], path)
            item["bytes"] = len(data)
            item["sha256"] = hashlib.sha256(data).hexdigest()
            if correction := item.get("archiveLinkCorrection"):
                if item["sha256"] != correction["verifiedSha256"]:
                    raise ValueError("The corrected Japan source needs a new review")
            item["signature"] = data[:8].hex()
            print(f'{item["file"]}: {len(data)} bytes', flush=True)
        except Exception as exc:
            item["error"] = type(exc).__name__
            print(f'{item["file"]}: {type(exc).__name__}', flush=True)
    (ROOT / "download-audit.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
elif not options.inspect:
    print(json.dumps(manifest, indent=2))

if options.inspect:
    sys.path.insert(0, str(ROOT / "python-deps"))
    import xlrd
    audit = []
    subject_names = {"countries": set(), "industries": set()}
    extracted = []
    for item in manifest:
        path = ROOT / item["file"]
        if not path.exists():
            continue
        book = xlrd.open_workbook(path)
        sheets = []
        for sheet in book.sheets():
            if sheet.nrows > 10000 or sheet.ncols > 256:
                raise ValueError(f"Unexpected sheet dimensions: {item['file']} / {sheet.name}: {sheet.nrows} x {sheet.ncols}")
            def value(cell):
                if cell.ctype == xlrd.XL_CELL_ERROR:
                    return {"error": xlrd.error_text_from_code[cell.value]}
                if cell.ctype == xlrd.XL_CELL_DATE:
                    return xlrd.xldate_as_datetime(cell.value, book.datemode).isoformat()[:10]
                return cell.value
            rows = [[value(cell) for cell in sheet.row(r)] for r in range(sheet.nrows)]
            for row in rows:
                while row and row[-1] == "":
                    row.pop()
            output = {"name": sheet.name, "rows": sheet.nrows, "columns": sheet.ncols, "header": rows[:10], "sample": [r[:19] for r in rows if r and r[0] in ["Germany", "India", "China", "United States", "Total Market", "Total Market (without financials)"]]}
            sheets.append(output)
        data_sheet = next(s for s in book.sheets() if s.name != "Variables & FAQ")
        header_row = next((i for i in range(min(12, data_sheet.nrows)) if " ".join(str(data_sheet.cell_value(i, 1)).lower().split()) in ["number of firms", "numebr of firms", "count"]), None)
        if header_row is None:
            raise ValueError(f"Unknown header in {item['file']} / {data_sheet.name}: {[data_sheet.cell_value(i,0) for i in range(min(12,data_sheet.nrows))]}")
        kind = "countries" if item["file"].startswith("countrystats") else "industries"
        source_rows = []
        for i in range(header_row + 1, data_sheet.nrows):
            name = str(data_sheet.cell_value(i, 0)).strip()
            count = data_sheet.cell(i, 1)
            if not name or count.ctype != xlrd.XL_CELL_NUMBER:
                continue
            source_rows.append([value(cell) for cell in data_sheet.row(i)])
            subject_names[kind].add(name)
        extracted.append({"file":item["file"], "headerRow":header_row, "headers":data_sheet.row_values(header_row), "rows":source_rows})
        audit.append({"file": item["file"], "label": item["label"], "sheets": sheets})
    (ROOT / "workbook-audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
    (ROOT / "subject-names.json").write_text(json.dumps({k:sorted(v) for k,v in subject_names.items()}, indent=2), encoding="utf-8")
    (ROOT / "extracted.json").write_text(json.dumps(extracted), encoding="utf-8")
    for item in audit:
        sheet = next((s for s in item["sheets"] if s["name"] != "Variables & FAQ"), None)
        print(json.dumps({"file": item["file"], "rows": sheet["rows"], "date": sheet["header"][0][:2]}))
