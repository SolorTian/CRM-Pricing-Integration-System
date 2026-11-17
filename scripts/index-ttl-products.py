import json, re, time
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
BASE = "https://sale.ttl.com.tw/04product/pro_a_list.aspx"
session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (compatible; ProductCatalogIndex/1.0)"
def get(url, data=None):
    r = session.post(url, data=data, timeout=45) if data is not None else session.get(url, timeout=45)
    r.raise_for_status()
    r.encoding = r.apparent_encoding
    return BeautifulSoup(r.text, "html.parser")
page = get(BASE)
links = set()
seen = set()
for number in range(1, 101):
    found = {urljoin(BASE, a["href"]) for a in page.select("a[href]") if "pro_a_main.aspx?sn=" in a["href"]}
    signature = tuple(sorted(found))
    if not found or signature in seen:
        break
    seen.add(signature)
    links.update(found)
    print("Listing", number, "products", len(found), flush=True)
    candidates = []
    for a in page.select("a[href]"):
        label = a.get_text(strip=True)
        if label == str(number + 1) or label in ("下一頁", "下頁", ">", "›", "Next"):
            candidates.append(a)
    if not candidates:
        print("Pagination controls:", [(a.get_text(strip=True), a.get("href")) for a in page.select("a[href]") if "__doPostBack" in a["href"]], flush=True)
        break
    a = candidates[0]
    href = a["href"]
    post = re.search(r"__doPostBack\('([^']*)','([^']*)'\)", href)
    if post:
        data = {x["name"]: x.get("value", "") for x in page.select("input[name]") if x.get("type", "").lower() not in ("submit", "button", "image", "checkbox", "radio")}
        data["__EVENTTARGET"], data["__EVENTARGUMENT"] = post.groups()
        page = get(BASE, data)
    else:
        page = get(urljoin(BASE, href))
    time.sleep(.2)
path = Path("ttl-product-images.json")
catalog = json.loads(path.read_text("utf-8")) if path.exists() else {}
matched = 0
for url in sorted(links):
    try:
        doc = get(url)
        text = doc.get_text(" ", strip=True)
        match = re.search(r"產品編碼[：:\s]*([A-Za-z0-9]+)", text)
        images = [urljoin(url, i["src"]) for i in doc.select("img[src]") if "/product_files/" in i["src"]]
        if match and images:
            code = match[1].strip().upper()
            catalog[code] = {"url": url, "image": images[0]}
            matched += 1
    except Exception as e:
        print("Failed", url, str(e), flush=True)
    time.sleep(.15)
if not matched:
    raise SystemExit("No verified products; keeping existing catalog")
path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Verified", matched, "products across", len(seen), "listing pages; total", len(catalog), flush=True)
