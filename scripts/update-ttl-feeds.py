import json, re, os
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

SOURCES={'corporate':('https://www.ttl.com.tw/index.aspx','台酒官網'),'shop':('https://eshop.ttl.com.tw/news','台酒購物網'),'deals':('https://eshop.ttl.com.tw/即期惜福','即期惜福')}
STAMP=datetime.now(timezone.utc).isoformat()
def text(el): return ' '.join(el.stripped_strings) if el else ''
def date(s):
 m=re.search(r'(20\d{2})[./-](\d{1,2})[./-](\d{1,2})',s)
 if not m:return ''
 try:return datetime(*map(int,m.groups())).date().isoformat()
 except ValueError:return ''
def safe(base,href):
 u=urljoin(base,href);p=urlparse(u)
 return u if p.scheme=='https' and p.hostname==urlparse(base).hostname else None
def news(html,base,kind):
 soup=BeautifulSoup(html,'html.parser');items=[];seen=set()
 for a in soup.select('a[href]'):
  href=safe(base,a.get('href',''));title=text(a) or a.get('title','').strip()
  if not href or not title or len(title)<5 or href in seen:continue
  if kind=='corporate' and not re.search(r'news_(?:view|detail)\.aspx',href,re.I):continue
  if kind=='shop' and not (a.select_one('.news-title') or 'news-title' in a.get('class',[]) or a.find_parent(class_=re.compile(r'news-item|news-list-item'))):continue
  container=a;published=''
  for _ in range(5):
   if container is None:break
   published=date(text(container))
   if published:break
   container=container.parent
  if not published:continue
  seen.add(href);items.append({'title':title,'url':href,'date':published})
 if not items:raise ValueError('沒有辨識到帶日期的消息')
 return sorted(items,key=lambda x:x['date'],reverse=True)[:30]
def products(html,base):
 soup=BeautifulSoup(html,'html.parser');items=[]
 for card in soup.select('.product-item'):
  a=card.select_one('.product-title a') or card.select_one('h2 a')
  if not a:continue
  url=safe(base,a.get('href',''));title=text(a)
  if not url or not title:continue
  price=text(card.select_one('.actual-price'));old=text(card.select_one('.old-price'))
  items.append({'title':title,'url':url,'price':price,'originalPrice':old,'expiry':date(title)})
 if not items:
  for a in soup.select('a[href]'):
   title=text(a);url=safe(base,a.get('href',''))
   if not url or len(title)<8 or not re.search(r'即期|賞味|出清',title):continue
   node=a
   for _ in range(5):
    node=node.parent
    if node is None:break
    content=text(node)
    if len(content)>1500:break
    prices=re.findall(r'NT\$\s*([\d,]+)',content)
    if prices:
     items.append({'title':title,'url':url,'price':'NT$'+prices[-1],'originalPrice':'NT$'+prices[0] if len(prices)>1 else '', 'expiry':date(title)})
     break
 if not items and not soup.select_one('.no-result,.no-products'):raise ValueError('沒有辨識到商品清單')
 pages=[safe(base,a['href']) for a in soup.select('.pager a[href]')]
 return items,[u for u in pages if u and urlparse(u).path==urlparse(base).path]
def fetch(url):
 r=requests.get(url,timeout=(15,45),headers={'User-Agent':'Mozilla/5.0 (compatible; TTL-news-index/1.0)'})
 r.raise_for_status();r.encoding='utf-8';return r.text
def main():
 path='ttl-feeds.json'
 old=json.load(open(path,encoding='utf-8')) if os.path.exists(path) else {'sources':{}}
 result={'updatedAt':STAMP,'sources':{}}
 for key,(url,label) in SOURCES.items():
  previous=old.get('sources',{}).get(key,{})
  try:
   html=fetch(url)
   if key=='deals':
    items,pages=products(html,url);visited={url}
    for page in pages[:8]:
     if page in visited:continue
     visited.add(page);extra,_=products(fetch(page),url);items+=extra
    items=list({p['url']:p for p in items}.values())
   else:items=news(html,url,key)
   result['sources'][key]={'label':label,'url':url,'checkedAt':STAMP,'updatedAt':STAMP,'status':'ok','items':items}
   print(key,len(items),'items')
  except Exception as e:
   print(key,'failed:',type(e).__name__,str(e)[:160])
   result['sources'][key]={**previous,'label':label,'url':url,'checkedAt':STAMP,'status':'error','items':previous.get('items',[]),'error':'官網暫時無法更新，顯示上次成功資料。'}
 with open(path,'w',encoding='utf-8')as f:json.dump(result,f,ensure_ascii=False,indent=2)
if __name__=='__main__':main()
