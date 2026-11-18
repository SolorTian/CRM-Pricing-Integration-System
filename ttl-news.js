(function(){
'use strict';
const desktop=window.matchMedia('(min-width:1024px) and (pointer:fine)');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safe(s){try{const u=new URL(s);return u.protocol==='https:'&&['www.ttl.com.tw','eshop.ttl.com.tw','www.p9.com.tw'].includes(u.hostname)?u.href:null}catch{return null}}
const stamp=s=>s?new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚無資料';
let rail,data,dialog,loading=false,dayTimer;
const readKey='crm-news-read-v1';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let readDay=today(),readUrls=new Set();
function restoreRead(){try{const v=JSON.parse(localStorage.getItem(readKey)||'{}');readUrls=new Set(v.day===today()&&Array.isArray(v.urls)?v.urls:[])}catch{}}
restoreRead();
function resetDay(){const d=today();if(d!==readDay){readDay=d;readUrls.clear()} }
function trackRead(e){
 const a=e.target.closest('a[data-news-url]');if(!a||!(e.type==='click'||e.button===1))return;
 resetDay();readUrls.add(a.dataset.newsUrl);
 try{localStorage.setItem(readKey,JSON.stringify({day:readDay,urls:[...readUrls]}))}catch{}
 [rail,dialog].filter(Boolean).forEach(root=>root.querySelectorAll('a[data-news-url]').forEach(link=>{if(link.dataset.newsUrl===a.dataset.newsUrl){link.closest('li').classList.remove('news-unread');link.closest('li').querySelector('.unread-badge')?.remove()}}));
}
function scheduleDay(){
 clearTimeout(dayTimer);
 const now=Date.now(),offset=8*60*60*1000,next=Math.floor((now+offset)/86400000)*86400000+86400000-offset;
 dayTimer=setTimeout(()=>{resetDay();render();scheduleDay()},next-now+50);
}
function expand(){
 if(!dialog){dialog=document.createElement('dialog');dialog.id='newsReader';dialog.setAttribute('aria-labelledby','newsReaderTitle');
 dialog.innerHTML='<header><div><h2 id="newsReaderTitle">酒類新聞</h2><p>台酒官網・台酒購物網・P9｜依日期排序，淡黃色表示今日未讀</p></div><button type="button" id="newsReaderClose" aria-label="關閉全畫面新聞">關閉 ✕</button></header><ul class="feed-list" id="expandedNewsList"></ul>';
 document.body.appendChild(dialog);dialog.querySelector('#newsReaderClose').onclick=()=>dialog.close();dialog.addEventListener('click',trackRead);dialog.addEventListener('auxclick',trackRead);
 dialog.addEventListener('close',()=>rail.querySelector('#ttlFeedExpand').focus());}
 render();dialog.showModal();
}
function init(){
 if(!desktop.matches||rail)return;
 const workspace=document.getElementById('crmWorkspace');if(!workspace)return;
 const style=document.createElement('style');style.textContent=`#ttlNewsRail{display:none}@media(min-width:1024px) and (pointer:fine){#crmWorkspace{grid-template-columns:210px minmax(0,1fr) 290px}#ttlNewsRail{display:grid;grid-template-rows:minmax(190px,1.2fr) minmax(150px,1fr) minmax(190px,1fr);gap:16px;min-width:0;height:max(650px,calc(100dvh - 130px));position:sticky;top:24px;align-self:start}.table-wrap{overflow-x:auto}#ttlNewsRail .feed-card{min-height:0;display:flex;flex-direction:column;background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}#ttlNewsRail .feed-head{padding:14px 14px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px}#ttlNewsRail h2{margin:0;font-size:15px;font-weight:800;color:#312e81}#ttlNewsRail .feed-tabs{padding:0 12px 8px;display:flex;gap:5px}#ttlNewsRail button{border:0;background:#f1f5f9;color:#475569;border-radius:7px;padding:5px 8px;font-size:11px;cursor:pointer}#ttlNewsRail button[aria-pressed=true]{background:#e0e7ff;color:#4338ca}#ttlNewsRail .feed-list{list-style:none;margin:0;padding:0 14px;overflow:auto;flex:1;min-height:0}#ttlNewsRail li{border-top:1px solid #f1f5f9;padding:10px 0}#ttlNewsRail a{color:#334155;text-decoration:none;line-height:1.6;font-size:12px;display:block}#ttlNewsRail a:hover{color:#4338ca;text-decoration:underline}#ttlNewsRail .feed-meta{color:#64748b;font-size:10px;margin-bottom:5px}#ttlNewsRail .feed-foot{padding:9px 14px;background:#f8fafc;color:#64748b;font-size:10px;line-height:1.6}#ttlNewsRail .feed-foot a{display:inline;font-size:10px;color:#4f46e5}#ttlNewsRail .feed-price{color:#b45309;font-weight:800;font-size:13px;margin-top:5px}#ttlNewsRail .feed-price del{font-weight:400;font-size:10px;color:#94a3b8;margin-left:7px}#ttlNewsRail .feed-warning{color:#b45309}#ttlNewsRail .feed-empty{font-size:12px;color:#64748b;padding:14px 0}}@media(min-width:1600px) and (pointer:fine){#mainContent>div:first-child{max-width:1900px}#crmWorkspace{grid-template-columns:240px minmax(0,1fr) 310px}}`;
 style.textContent+=`
#ttlNewsRail li.news-unread,#newsReader li.news-unread{background:#fff7d6;border-left:3px solid #eab308;padding-left:10px;padding-right:8px}
.unread-badge{display:inline-block;margin-left:6px;color:#92400e;font-size:10px;font-weight:700}
#newsReader{box-sizing:border-box;position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;background:#f8fafc;color:#334155}
#newsReader[open]{display:flex;flex-direction:column}#newsReader::backdrop{background:#0f172acc}
#newsReader header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 32px;background:white;border-bottom:1px solid #e2e8f0}
#newsReader h2{margin:0;color:#312e81;font-size:24px}#newsReader p{margin:8px 0 0;color:#64748b;font-size:13px}
#newsReader button{border:0;border-radius:8px;padding:10px 18px;background:#e0e7ff;color:#3730a3;cursor:pointer}
#newsReader .feed-list{list-style:none;overflow:auto;flex:1;margin:0;padding:20px max(24px,calc((100vw - 1100px)/2))}
#newsReader li{padding:18px;border-bottom:1px solid #e2e8f0;background:white}
#newsReader .feed-meta{color:#64748b;font-size:12px;margin-bottom:7px}
#newsReader a{color:#334155;font-size:18px;line-height:1.7;text-decoration:none}#newsReader a:hover{text-decoration:underline;color:#4338ca}
#newsReader a:focus-visible,#newsReader button:focus-visible{outline:3px solid #6366f1;outline-offset:3px}
`;document.head.appendChild(style);rail=document.createElement('aside');rail.id='ttlNewsRail';rail.setAttribute('aria-label','酒類新聞、熱門話題與即期促銷');
 rail.innerHTML=`<section class="feed-card"><div class="feed-head"><h2>酒類新聞</h2><div><button id="ttlFeedExpand" type="button" aria-haspopup="dialog">放大</button> <button id="ttlFeedRefresh" title="讀取最近同步資料">更新</button></div></div><ul class="feed-list" id="ttlNewsList"><li class="feed-empty">載入中…</li></ul><div class="feed-foot" id="ttlNewsStatus"></div></section><section class="feed-card"><div class="feed-head"><h2>熱門話題</h2></div><ul class="feed-list" id="p9TopicsList"><li class="feed-empty">載入中…</li></ul><div class="feed-foot" id="p9TopicsStatus"></div></section><section class="feed-card"><div class="feed-head"><h2>即期促銷商品</h2></div><ul class="feed-list" id="ttlDealList"><li class="feed-empty">載入中…</li></ul><div class="feed-foot" id="ttlDealsStatus"></div></section>`;
 workspace.appendChild(rail);rail.querySelector('#ttlFeedRefresh').onclick=load;
 rail.querySelector('#ttlFeedExpand').onclick=expand;
 rail.addEventListener('click',trackRead);rail.addEventListener('auxclick',trackRead);
 scheduleDay();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){resetDay();render();scheduleDay()}});
 window.addEventListener('storage',e=>{if(e.key===readKey){resetDay();restoreRead();render()}});
 load();
}
function note(s){if(!s)return '尚無同步資料';return (s.status==='error'?'上次更新失敗；':'')+(Date.now()-new Date(s.updatedAt).getTime()>86400000?'資料超過一天；':'')+'同步 '+stamp(s.updatedAt)}
function render(){
 if(!rail||!data)return;const sources=data.sources||{};
 resetDay();const news=['corporate','shop','p9news'].flatMap(k=>(sources[k]?.items||[]).map(p=>({...p,source:sources[k].label}))).filter(p=>safe(p.url)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const newsHTML=news.map(p=>'<li class="'+(p.date===today()&&!readUrls.has(safe(p.url))?'news-unread':'')+'"><div class="feed-meta">'+esc(p.source)+' · '+esc(p.date)+(p.date===today()&&!readUrls.has(safe(p.url))?'<span class="unread-badge">今日未讀</span>':'')+'</div><a data-news-url="'+esc(safe(p.url))+'" href="'+esc(safe(p.url))+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a></li>').join('')||'<li class="feed-empty">目前無可顯示的消息，請查看官網。</li>';
 rail.querySelector('#ttlNewsList').innerHTML=newsHTML;
 if(dialog)dialog.querySelector('#expandedNewsList').innerHTML=newsHTML;
 rail.querySelector('#ttlNewsStatus').innerHTML=['corporate','shop','p9news'].map(k=>'<div>'+esc(sources[k]?.label||k)+'：'+esc(note(sources[k]))+'</div>').join('')+'<br><a href="https://www.p9.com.tw/News/NewsList.aspx" target="_blank" rel="noopener noreferrer">P9 品酒網 ↗</a> · <a href="https://www.ttl.com.tw/index.aspx" target="_blank" rel="noopener noreferrer">台酒官網 ↗</a> · <a href="https://eshop.ttl.com.tw/news" target="_blank" rel="noopener noreferrer">購物網 ↗</a> · 每 4 小時同步';
 const topics=(sources.p9topics?.items||[]).filter(p=>safe(p.url));
 rail.querySelector('#p9TopicsList').innerHTML=topics.map(p=>'<li><a href="'+esc(safe(p.url))+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a></li>').join('')||'<li class="feed-empty">暫無話題資料，請前往 P9 首頁查看。</li>';
 rail.querySelector('#p9TopicsStatus').innerHTML=esc(note(sources.p9topics))+'<br><a href="https://www.p9.com.tw/Index.aspx" target="_blank" rel="noopener noreferrer">P9 首頁・熱門話題 ↗</a>';
 const d=sources.deals,items=(d?.items||[]).filter(p=>safe(p.url));
 rail.querySelector('#ttlDealList').innerHTML=items.map(p=>'<li><a href="'+esc(safe(p.url))+'" target="_blank" rel="noopener noreferrer">'+esc(p.title)+'</a>'+(p.price?'<div class="feed-price">'+esc(p.price)+(p.originalPrice&&p.originalPrice!==p.price?'<del>'+esc(p.originalPrice)+'</del>':'')+'</div>':'')+(p.expiry?'<div class="feed-meta">效期 '+esc(p.expiry)+'</div>':'')+'</li>').join('')||'<li class="feed-empty">'+(d?.status==='ok'?'官網目前沒有列出的即期商品。':'商品資料暫時無法載入，請查看官網。')+'</li>';
 rail.querySelector('#ttlDealsStatus').innerHTML=esc(note(d))+'<br>官網零售價與庫存以結帳頁為準。<br><a href="https://eshop.ttl.com.tw/即期惜福" target="_blank" rel="noopener noreferrer">查看全部即期惜福 ↗</a>';
}
async function load(){if(!desktop.matches||loading)return;loading=true;const b=rail.querySelector('#ttlFeedRefresh');b.disabled=true;try{const r=await fetch('ttl-feeds.json',{cache:'no-cache'});if(!r.ok)throw Error();data=await r.json();render()}catch{rail.querySelector('#p9TopicsStatus').innerHTML='<a href="https://www.p9.com.tw/Index.aspx" target="_blank" rel="noopener noreferrer">前往 P9 熱門話題 ↗</a>';rail.querySelector('#ttlNewsStatus').textContent='暫時無法讀取同步資料，請稍後按更新。';rail.querySelector('#ttlDealsStatus').innerHTML='<a href="https://eshop.ttl.com.tw/即期惜福" target="_blank" rel="noopener noreferrer">前往即期惜福官網 ↗</a>'}finally{loading=false;b.disabled=false}}
desktop.addEventListener('change',init);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
