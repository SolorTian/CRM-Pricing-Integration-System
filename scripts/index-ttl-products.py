import json, re, time
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
BASE = "https://www.ttl.com.tw/products/products_list.aspx?sn=22"
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
    found = {urljoin(BASE, a["href"]) for a in page.select("a[href]") if "products_view.aspx?" in a["href"]}
    signature = tuple(sorted(found))
    if not found or signature in seen:
        break
    seen.add(signature)
    links.update(found)
    print("Listing", number, "products", len(found), flush=True)
    pager = page.select_one("select[name$='$Pageer1$CurrentPage']")
    if not pager or not pager.select_one('option[value="' + str(number + 1) + '"]'):
        break
    data = {x["name"]: x.get("value", "") for x in page.select("input[name]") if x.get("type", "").lower() not in ("submit", "button", "image", "checkbox", "radio")}
    for select in page.select("select[name]"):
        option = select.select_one("option[selected]") or select.select_one("option")
        data[select["name"]] = option.get("value", "") if option else ""
    data[pager["name"]] = str(number + 1)
    data["ctl00$ContentArea$Pageer1$Button1"] = "GO!"
    page = get(BASE, data)
    time.sleep(.2)
path = Path("ttl-product-images.json")
catalog = {}
matched = 0
for url in sorted(links):
    try:
        doc = get(url)
        text = doc.get_text(" ", strip=True)
        match = re.search(r"產品編碼[：:\s]*([A-Za-z0-9]+)", text)
        images = [urljoin(url, i["src"]) for i in doc.select("img[src]") if "/product_files/" in i["src"]]
        if match and images:
            code = match[1].strip().upper()
            title = next((i.get("alt", "").strip() for i in doc.select("img[src]") if "/product_files/" in i["src"]), "")
            body = doc.get_text("\n", strip=True)
            description = body.split(title, 1)[-1] if title else ""
            description = re.split(r"產品分類|產品編碼", description)[0].strip()
            description = description.replace("本網站公告之酒品售價，以各營業據點之實際售價為準。", "").strip()
            image = images[0].replace("http://", "https://")
            response = session.get(image, timeout=25, stream=True)
            valid = response.ok and response.headers.get("Content-Type", "").lower().startswith("image/")
            response.close()
            if not valid:
                print("Image unavailable", code, flush=True)
                continue
            catalog[code] = {"url": url, "image": image, "title": title, "description": description}
            matched += 1
    except Exception as e:
        print("Failed", url, str(e), flush=True)
    time.sleep(.15)
if not matched:
    raise SystemExit("No verified products; keeping existing catalog")
path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Verified", matched, "products across", len(seen), "listing pages; total", len(catalog), flush=True)
