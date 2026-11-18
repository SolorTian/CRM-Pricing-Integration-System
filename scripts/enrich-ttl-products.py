import json,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
path=Path("ttl-product-images.json")
catalog=json.loads(path.read_text("utf-8"))
def enrich(pair):
    code,entry=pair
    try:
        response=requests.get(entry["url"],timeout=15)
        response.raise_for_status()
        response.encoding=response.apparent_encoding
        doc=BeautifulSoup(response.text,"html.parser")
        body=doc.get_text(" ",strip=True)
        actual=re.search(r"產品編碼[：:\s]*([A-Za-z0-9]+)",body)
        if not actual or actual[1].upper()!=code: return code,entry
        category=re.search(r"產品分類[：:\s]*(.*?)\s*產品編碼",body)
        if category:entry["category"]=category[1].strip()
        for row in doc.select("tr"):
            cells=row.find_all(["td","th"],recursive=False)
            if len(cells)>=2 and re.sub(r"\s","",cells[0].get_text())=="備註":
                entry["notes"]=cells[1].get_text("\n",strip=True)
        return code,entry
    except Exception as e:
        print("Metadata unavailable",code,type(e).__name__,flush=True)
        return code,entry
with ThreadPoolExecutor(max_workers=6) as pool:
    result=dict(pool.map(enrich,catalog.items()))
path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Categories",sum(bool(e.get("category")) for e in result.values()),"of",len(result))
