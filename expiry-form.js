
(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const col=a=>{let n=0;for(const c of a.match(/^[A-Z]+/)[0])n=n*26+c.charCodeAt(0)-64;return n};
const row=a=>Number(a.match(/\d+$/)[0]);
const addr=(n,r)=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s+r};
const norm=s=>String(s).replace(/[\s\u3000]/g,'');
function mapTemplate(cells,merges){
 const headers={id:'代號',name:'名稱',qty:'本批屆期數量',unit:'單位',shelf:'保存期限',expiry:'到期年月日',cat:'產品類別',period:'距保存期限情形',base:'原價',rate:'折扣',sale:'銷售價',notes:'備註'};
 const columns={},entries=Object.entries(cells);
 for(const [key,label]of Object.entries(headers)){
  const hits=entries.filter(([a,v])=>row(a)<20&&(key==='base'||key==='rate'||key==='sale'||key==='notes'?norm(v).startsWith(label):norm(v)===label));
  if(hits.length!==1)throw Error('無法確認範本的「'+label+'」欄位，請使用原始即期品簽核單 Excel。');
  columns[key]=col(hits[0][0]);
 }
 const first=Math.min(...Object.values(columns));
 const slots=[1,2,3,4].map(n=>entries.filter(([a,v])=>col(a)<first&&norm(v)===String(n)));
 if(slots.some(s=>s.length!==1))throw Error('範本需有原表的 1～4 項明細列。');
 const rows=slots.map(s=>row(s[0][0]));
 if(rows.some((r,i)=>i&&r<=rows[i-1]))throw Error('範本明細順序無法辨識。');
 const anchors=merges.map(m=>m.split(':'));
 function anchor(c,r){const a=addr(c,r);const m=anchors.find(([x,y=x])=>col(x)<=c&&col(y)>=c&&row(x)<=r&&row(y)>=r);return m?m[0]:a}
 return {columns,rows,anchor};
}
function salePrice(p){return window.ExpiryRules.calculate(p)}
function patchCell(xml,ref,value){
 const numeric=typeof value==='number';
 const content=numeric?'<v>'+value+'</v>':'<is><t xml:space="preserve">'+esc(value)+'</t></is>';
 const re=new RegExp('<c\\b([^>]*\\br="'+ref+'"[^>]*)(?:/>|>([\\s\\S]*?)</c>)');
 const hit=xml.match(re);
 if(hit){const attrs=hit[1].replace(/\s+t="[^"]*"/,'');return xml.replace(re,'<c'+attrs+(numeric?'':' t="inlineStr"')+'>'+content+'</c>')}
 const r=row(ref),rr=new RegExp('(<row\\b[^>]*\\br="'+r+'"[^>]*>)([\\s\\S]*?)(</row>)');
 if(!rr.test(xml))throw Error('範本缺少明細列 '+r);
 return xml.replace(rr,(_,start,body,end)=>{
  const cell='<c r="'+ref+'"'+(numeric?'':' t="inlineStr"')+'>'+content+'</c>';
  let inserted=false;
  body=body.replace(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,(v,a)=>{if(!inserted&&col(a)>col(ref)){inserted=true;return cell+v}return v});
  return start+body+(inserted?'':cell)+end;
 });
}
let zipPromise;
function loadZip(){if(window.JSZip)return Promise.resolve(window.JSZip);if(!zipPromise)zipPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';script.onload=()=>resolve(window.JSZip);script.onerror=()=>{zipPromise=null;script.remove();reject(Error('範本元件載入失敗，請確認網路後重試。'))};document.head.appendChild(script)});return zipPromise}
function xmlDoc(s){const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('Excel 範本內容無法解析。');return d}
function textOf(el){return [...el.getElementsByTagName('t')].map(x=>x.textContent).join('')}
async function parseTemplate(file){
 const Zip=await loadZip(),buffer=await file.arrayBuffer(),zip=await Zip.loadAsync(buffer);
 const shared=zip.file('xl/sharedStrings.xml'),strings=shared?[...xmlDoc(await shared.async('string')).getElementsByTagName('si')].map(textOf):[];
 const workbook=xmlDoc(await zip.file('xl/workbook.xml').async('string'));
 const relations=xmlDoc(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
 for(const sheet of workbook.getElementsByTagName('sheet')){
  const id=sheet.getAttribute('r:id'),rel=[...relations.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===id);
  if(!rel)continue;
  let path=rel.getAttribute('Target').replace(/^\//,'');if(!path.startsWith('xl/'))path='xl/'+path;
  const source=zip.file(path);if(!source)continue;
  const xml=await source.async('string'),doc=xmlDoc(xml),cells={};
  for(const c of doc.getElementsByTagName('c')){
   const type=c.getAttribute('t'),v=c.getElementsByTagName('v')[0]?.textContent||'';
   cells[c.getAttribute('r')]=type==='s'?strings[Number(v)]||'':type==='inlineStr'?textOf(c):v;
  }
  if(!Object.values(cells).some(v=>norm(v).includes('將屆保存期限產品銷售價簽核單')))continue;
  const merges=[...doc.getElementsByTagName('mergeCell')].map(x=>x.getAttribute('ref'));
  return {buffer,path,xml,cells,merges,map:mapTemplate(cells,merges),filename:file.name};
 }
 throw Error('這份 Excel 沒有找到「將屆保存期限產品銷售價簽核單」。');
}
function changesFor(t,items,month,office){
 if(!items.length)throw Error('請先加入產品。');
 if(items.length>4)throw Error('每張依原表填寫 4 項，請分張申請。');
 const changes={},m=t.map;
 for(let i=0;i<4;i++){
  const r=m.rows[i],p=items[i];
  const fields=['id','name','qty','unit','shelf','expiry','base','rate','sale','notes'];
  for(const field of fields)changes[m.anchor(m.columns[field],r)]='';
  const endRow=i<3?m.rows[i+1]:r+(m.rows[1]-m.rows[0]);
  for(const [a,v]of Object.entries(t.cells))if(row(a)>=r&&row(a)<endRow&&col(a)>=m.columns.cat&&col(a)<m.columns.base&&/[☑■]/.test(v))changes[a]=v.replace(/[☑■]/g,'□');
  if(!p)continue;
  if(!office)throw Error('請填寫營業所。');
  if(!p.id.trim()||!p.name.trim()||!p.unit.trim()||!p.shelf.trim()||!p.expiry||!p.cat||!p.period)throw Error('請補齊產品料號、品名、單位、保存期限、到期日、類別及距保存期限情形。');
  if(!Number.isInteger(Number(p.qty))||Number(p.qty)<=0)throw Error('屆期數量須為正整數。');
  if(!window.ExpiryRules.parseDate(p.expiry)||p.expiry<window.ExpiryRules.today())throw Error('請填寫有效且尚未過期的到期日。');
  if(p.base==='')throw Error('請填寫原價。');
  const values={...p,qty:Number(p.qty),base:Number(p.base),sale:salePrice(p),rate:p.rate+'折',expiry:p.expiry.replaceAll('-','/'),notes:[p.notes,p.cat==='菸'?'批發價扣除健康捐及菸稅 '+p.tax+' 元後，按 '+p.rate+' 折計算再加回稅捐':''].filter(Boolean).join('；')};
  for(const field of fields)changes[m.anchor(m.columns[field],r)]=values[field];
  for(const field of ['cat','period']){
   const c=m.columns[field],next=Math.min(...Object.values(m.columns).filter(n=>n>c));
   const end=i<3?m.rows[i+1]:r+(m.rows[1]-m.rows[0]);
   const target=Object.entries(t.cells).filter(([a,v])=>col(a)>=c&&col(a)<next&&row(a)>=r&&row(a)<end&&/[□☑■]/.test(v));
   if(!target.length)throw Error('無法辨識原表的勾選欄，已停止匯出，避免更動格式。');
   let selected=false;
   for(const [a,v]of target){
    let val=v.replace(/[☑■]/g,'□');
    const labels=field==='cat'?['非菸酒','啤酒','菸','酒']:['1個月內','2個月內','3個月內','4個月內','6個月內','其他'];
    for(const label of labels)if(label===p[field]){
     const pattern=new RegExp('□\\s*'+label);if(pattern.test(val)){val=val.replace(pattern,'☑'+label);selected=true}
    }
    changes[a]=val;
   }
   if(!selected)throw Error('範本找不到選取的類別或保存期限選項。');
  }
 }
 const header=Object.entries(t.cells).find(([,v])=>norm(v).includes('將屆保存期限產品銷售價簽核單'));
 const [year,mon]=month.split('-').map(Number);
 if(!year||!mon||year<1912)throw Error('請填寫申請年月。');
 if(!/年\s*.*月/.test(header[1]))throw Error('無法辨識原表的申請年月欄。');
 changes[header[0]]=header[1].replace(/(?:\d+\s*)?年\s*(?:\d+\s*)?月/,(year-1911)+'年 '+mon+'月');
 for(const [a,v]of Object.entries(t.cells))if(row(a)<m.rows[0]&&v.includes('龍潭營業所'))changes[a]=v.replace('龍潭營業所',office);
 return changes;
}
let root,dialog,items=[],results=[],allProducts=[],template=null,catalog={},catalogPromise,templatePromise;
async function loadBuiltinTemplate(){
 if(template)return template;
 if(!templatePromise)templatePromise=(async()=>{
  $('templateStatus').textContent='正在載入原格式範本…';
  $('export').disabled=true;
  try{
   const response=await fetch('expiry-template.xlsx',{cache:'no-cache'});
   if(!response.ok)throw Error('範本尚未就緒');
   const buffer=await response.arrayBuffer();
   template=await parseTemplate({name:'expiry-template.xlsx',arrayBuffer:async()=>buffer});
   $('templateStatus').textContent='已載入原格式範本';
   $('retryTemplate').hidden=true;
   $('export').disabled=false;
   return template;
  }catch(e){
   $('templateStatus').textContent='原格式範本尚未就緒，目前可先填寫，暫時無法下載。';
   $('retryTemplate').hidden=false;
   templatePromise=null;
   return null;
  }
 })();
 return templatePromise;
}
const $=id=>root.getElementById(id),rules=()=>window.ExpiryRules;
function loadCatalog(){
 if(!catalogPromise)catalogPromise=fetch('ttl-product-images.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{catalog=data;return data}).catch(()=>{catalogPromise=null;return {}});
 return catalogPromise;
}
function meta(id){return catalog[String(id||'').trim().toUpperCase()]||{}}
function apply(p,reset=false){
 if(reset){p.manualRate=false;p.manualPeriod=false}
 const rec=rules().recommend(p);
 p.ruleMessage=rec.message;
 if(!p.manualPeriod){const value=rules().period(p.expiry);p.period=value==='已到期'?'其他':value}
 if(!p.manualRate)p.rate=rec.rate;
}
function enrich(p){
 const m=meta(p.id);p.officialTitle=m.title||'';
 if(!p.manualCat)p.cat=rules().classify({cat:p.dbCat},m);
 if(!p.manualShelf)p.shelf=rules().shelf((m.description||'')+'\n'+(m.notes||''));
 p.source=m.url||'';apply(p);
}
function init(){
 if(root)return;
 const host=document.createElement('div');document.body.appendChild(host);root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>*{box-sizing:border-box}dialog{position:fixed;inset:0;margin:auto;width:min(1040px,96vw);max-height:94dvh;overflow:auto;padding:0;border:1px solid #e2e8f0;border-radius:22px;background:#f8fafc;color:#334155;font:15px system-ui,"Microsoft JhengHei",sans-serif}dialog::backdrop{background:#0f172a99}header,footer{padding:18px 24px;background:white;display:flex;justify-content:space-between;gap:12px;align-items:center;position:sticky;z-index:2}header{top:0;border-bottom:1px solid #e2e8f0}footer{bottom:0;border-top:1px solid #e2e8f0}h2{font-size:21px;color:#312e81;margin:0}main{padding:22px}button,input,select{font:inherit;border-radius:10px;padding:10px;border:1px solid #cbd5e1;background:white;color:#334155;min-width:0}button{cursor:pointer;font-weight:700;color:#4338ca;border-color:#e0e7ff}button:hover{background:#eef2ff}button:disabled{opacity:.5;cursor:wait}input:focus,select:focus{outline:3px solid #e0e7ff;border-color:#6366f1}input[readonly]{background:#f1f5f9}.primary{background:#4f46e5;color:white}.primary:hover{background:#4338ca}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700}section{padding:20px;background:white;border:1px solid #e2e8f0;border-radius:16px;margin:14px 0}.wide{grid-column:span 2}.muted{font-size:13px;color:#64748b;line-height:1.7}.result{display:block;width:100%;text-align:left;margin:5px 0}.results{max-height:200px;overflow:auto}.bar{display:flex;gap:10px;align-items:center}.bar input{flex:1}.error{color:#b91c1c;white-space:pre-line}.item-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.item-title h3{margin:0;font-size:17px;color:#312e81}.remove{color:#dc2626;padding:6px 12px}.product{border-left:4px solid #c7d2fe}.grid{align-items:start}.price{background:#eef2ff;padding:13px 16px;border-radius:12px;margin-top:16px;display:flex;justify-content:space-between;gap:12px;align-items:center}.price strong{color:#4338ca;font-size:19px}.rule{margin:10px 0 0;font-size:13px;color:#64748b}.meta{display:flex;gap:18px;align-items:end}.meta label{width:210px}.source{font-size:12px;color:#6366f1;margin-top:10px;display:inline-block}details{margin:14px 0;font-size:13px;color:#64748b}summary{cursor:pointer}.restore{font-size:12px;padding:6px 10px}#addSection{border:1px dashed #a5b4fc;background:#f5f7ff}.tax[hidden]{display:none}@media(max-width:767px), (max-height:500px) and (pointer:coarse){dialog{display:none!important}}</style>
 <dialog aria-labelledby="title"><header><h2 id="title">即期品售價申請</h2><button id="close">關閉</button></header><main>
 <div class="meta"><label>申請日期<input id="date" type="date" readonly></label><label>營業所<input id="office" value="龍潭營業所"></label></div>
 <div id="items"></div>
 <section id="addSection"><h3>＋ 加入下一項產品</h3><div class="bar"><input id="search" placeholder="代號／品名／批發價／建議價"><button id="manual">手動新增</button></div><div id="matches" class="results"></div><p class="muted">每張依原表填寫最多 4 項。</p></section>
 <p class="muted" role="status"><span id="templateStatus">正在載入原格式範本…</span> <button id="retryTemplate" class="restore" hidden>重試載入</button></p>
 <p id="error" class="error" role="alert"></p>
 </main><footer><span id="count"></span><button id="export" class="primary" disabled>下載簽核單</button></footer></dialog>`;
 dialog=root.querySelector('dialog');$('date').value=rules().today();$('close').onclick=()=>dialog.close();
 $('retryTemplate').onclick=()=>loadBuiltinTemplate();
 $('search').oninput=search;$('manual').onclick=()=>add({});
 $('matches').onclick=e=>{const b=e.target.closest('[data-add]');if(b)add(results[Number(b.dataset.add)])};
 $('items').oninput=e=>{
  const {index,field}=e.target.dataset;if(index===undefined||!field)return;const p=items[Number(index)];p[field]=e.target.value;
  if(field==='rate')p.manualRate=true;
  if(field==='period')p.manualPeriod=true;
  if(field==='shelf')p.manualShelf=true;
  if(field==='cat')p.manualCat=true;
  if(field==='id'){p.dbCat=String(allProducts.find(x=>String(x.id).toUpperCase()===p.id.trim().toUpperCase())?.cat||'');p.manualShelf=false;p.manualCat=false;enrich(p)}
  apply(p);updateItem(Number(index),field);
 };
 $('items').onclick=e=>{let b=e.target.closest('[data-remove]');if(b){items.splice(Number(b.dataset.remove),1);render();return}b=e.target.closest('[data-restore]');if(b){apply(items[Number(b.dataset.restore)],true);render()}};
 $('export').onclick=exportFile;
 setInterval(()=>{if(dialog.open&&$('date').value!==rules().today()){$('date').value=rules().today();items.forEach(p=>apply(p));render()}},60000);
 window.addEventListener('resize',()=>{if(window.matchMedia('(max-width:767px), (max-height:500px) and (pointer:coarse)').matches&&dialog.open)dialog.close()});
 render();
}
async function exportFile(){
 const b=$('export');b.disabled=true;
 try{
  if(!template&&!await loadBuiltinTemplate())throw Error('原格式範本尚未就緒，請稍後重試；目前填寫內容仍保留。');
  $('date').value=rules().today();items.forEach(p=>apply(p));
  const changes=changesFor(template,items,$('date').value.slice(0,7),$('office').value.trim());
  let xml=template.xml;for(const [a,v]of Object.entries(changes))xml=patchCell(xml,a,v);xmlDoc(xml);
  const Zip=await loadZip(),zip=await Zip.loadAsync(template.buffer);zip.file(template.path,xml);
  if(zip.file('xl/calcChain.xml')){
   zip.remove('xl/calcChain.xml');
   const relpath='xl/_rels/workbook.xml.rels';
   zip.file(relpath,(await zip.file(relpath).async('string')).replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g,''));
   zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace(/<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g,''));
  }
  const blob=await zip.generateAsync({type:'blob',mimeType:template.filename.endsWith('.xlsm')?'application/vnd.ms-excel.sheet.macroEnabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='即期品簽核單_'+$('date').value+(template.filename.endsWith('.xlsm')?'.xlsm':'.xlsx');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);$('error').textContent='';
 }catch(e){$('error').textContent=e.message}finally{b.disabled=!template}
}
function add(p){
 if(items.length>=4){$('error').textContent='原表每張 4 項，請先匯出這張。';return}
 const item={id:String(p.id||''),name:String(p.name||''),dbCat:String(p.cat||''),qty:'',unit:String(p.min_unit||''),shelf:'',expiry:'',cat:'',period:'',base:p.w==null?'':String(p.w),rate:'',tax:'',notes:'',manualRate:false,manualPeriod:false,manualShelf:false,manualCat:false};
 enrich(item);items.push(item);$('search').value='';$('matches').innerHTML='';render();$('error').textContent='';
}
function search(){
 const q=$('search').value.trim();if(!q){results=[];$('matches').innerHTML='';return}
 results=window.searchBorrowProducts?.(q)||[];
 $('matches').innerHTML=results.slice(0,50).map((p,i)=>'<button class="result" data-add="'+i+'">'+esc(p.id)+'　'+esc(p.name)+'　＋</button>').join('')||'<p class="muted">查無產品，可手動新增。</p>';
}
function render(){
 const fields=[['id','產品代號'],['name','產品名稱'],['qty','本批屆期數量','number'],['unit','單位'],['shelf','保存期限'],['expiry','到期年月日','date'],['cat','產品類別',['','菸','酒','啤酒','非菸酒']],['period','距保存期限情形',['','1個月內','2個月內','3個月內','4個月內','6個月內','其他']],['base','批發價（與數量同單位）','number'],['rate','折數（7＝七折）','number'],['tax','健康捐＋菸稅（同單位）','number'],['notes','備註／即期說明']];
 $('items').innerHTML=items.map((p,i)=>'<section class="product"><div class="item-title"><h3>第 '+(i+1)+' 項產品</h3><button class="remove" data-remove="'+i+'">移除</button></div><div class="grid">'+fields.map(([k,label,type])=>'<label class="'+(['name','notes'].includes(k)?'wide ':'')+(k==='tax'?'tax':'')+'" '+(k==='tax'&&p.cat!=='菸'?'hidden':'')+'>'+label+(Array.isArray(type)?'<select data-index="'+i+'" data-field="'+k+'">'+type.map(v=>'<option value="'+esc(v)+'" '+(p[k]===v?'selected':'')+'>'+esc(v||'請選擇')+'</option>').join('')+'</select>':'<input data-index="'+i+'" data-field="'+k+'" type="'+(type||'text')+'" value="'+esc(p[k])+'" '+(type==='number'?'min="0" step="'+(k==='qty'?'1':'any')+'"':'maxlength="100"')+(k==='shelf'?' placeholder="官網無資料時請填寫，例如 6個月"':'')+'>')+'</label>').join('')+'</div><div class="price"><span>申請售價（元以下四捨五入）</span><strong id="price'+i+'"></strong></div><p class="rule" id="rule'+i+'"></p><button class="restore" data-restore="'+i+'">重新套用規則</button>'+(p.source?'<a class="source" href="'+esc(p.source)+'" target="_blank" rel="noopener noreferrer">　查看官網資料 ↗</a>':'')+'</section>').join('')||'<p class="muted">從下方搜尋並加入第一項產品。</p>';
 $('count').textContent=items.length+' / 4 項';items.forEach((p,i)=>updateItem(i));$('manual').disabled=items.length>=4;
}
function updateItem(i,editing){
 const p=items[i];
 for(const field of ['shelf','cat','period','rate']){
  if(field===editing)continue;const input=root.querySelector('[data-index="'+i+'"][data-field="'+field+'"]');if(input)input.value=p[field];
 }
 const tax=root.querySelector('[data-index="'+i+'"][data-field="tax"]');if(tax)tax.parentElement.hidden=p.cat!=='菸';
 try{$('price'+i).textContent=salePrice(p)+' 元'}catch(e){$('price'+i).textContent=p.cat==='菸'&&p.tax===''?'待補稅捐':'—'}
 $('rule'+i).textContent=p.ruleMessage+(p.manualRate?'；折數已手動調整':'')+(p.manualPeriod?'；距到期情形已手動調整':'');
}
let rulesPromise;
async function ensureRules(){
 if(window.ExpiryRules)return true;
 if(!rulesPromise)rulesPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='expiry-rules.js?v=20261118-2';script.onload=resolve;script.onerror=()=>{rulesPromise=null;reject(Error('規則載入失敗'))};document.head.appendChild(script)});
 try{await rulesPromise;return !!window.ExpiryRules}catch(e){window.showToast?.('即期申請規則載入失敗，請重新整理後再試');return false}
}
window.ExpiryForm={async open(products,p){
 if(window.matchMedia('(max-width:767px), (max-height:500px) and (pointer:coarse)').matches)return;
 if(!await ensureRules())return;
 init();allProducts=Array.isArray(products)?products:[];$('date').value=rules().today();await loadCatalog();
 items.forEach(item=>{enrich(item)});
 if(p)add(p);else render();if(!dialog.open)dialog.showModal();void loadBuiltinTemplate();
},mapTemplate,salePrice,patchCell,changesFor};
})();
