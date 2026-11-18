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
print("PRODUCT_PARENT", str(page.select_one(".product_img").parent.parent.parent), flush=True)
print("PRODUCT_SCRIPTS", [str(x) for x in page.select("script") if any(t in str(x).lower() for t in ["product", "fancybox", "modal"])], flush=True)
raise SystemExit("Inspect main catalog product links")
