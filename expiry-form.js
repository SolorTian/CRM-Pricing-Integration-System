
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
function salePrice(p){
 const base=Number(p.base),rate=Number(p.rate);
 if(!Number.isFinite(base)||base<0)throw Error('請輸入正確原價。');
 if(p.cat==='菸'&&p.method!=='direct')throw Error('菸品請填寫已核算含稅捐的申請售價。');
 if(p.method==='direct'){const v=Number(p.sale);if(p.sale===''||!Number.isFinite(v)||v<0)throw Error('請填寫申請售價。');return Math.round(v)}
 if(p.rate===''||!Number.isFinite(rate)||rate<0||(p.method==='discount'&&(rate<=0||rate>10)))throw Error('折數須大於 0 且不超過 10；加成百分比不得小於 0。');
 return Math.round(base*(p.method==='discount'?rate/10:1+rate/100)+Number.EPSILON);
}
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
  if(!p.id.trim()||!p.name.trim()||!p.unit.trim()||!p.shelf.trim()||!p.expiry||!p.cat||!p.period)throw Error('請補齊產品料號、品名、單位、保存期限、到期日、類別及距保存期限情形。');
  if(!Number.isInteger(Number(p.qty))||Number(p.qty)<=0)throw Error('屆期數量須為正整數。');
  if(p.period==='其他'&&!p.notes.trim())throw Error('距保存期限選其他時，請在備註填寫說明。');
  if(p.base==='')throw Error('請填寫原價。');
  const values={...p,qty:Number(p.qty),base:Number(p.base),sale:salePrice(p),rate:p.method==='discount'?p.rate+'折':p.method==='markup'?p.rate+'%':'依核算',expiry:p.expiry.replaceAll('-','/')};
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
let root,dialog,items=[],results=[],template=null;
const $=id=>root.getElementById(id);
function init(){
 if(root)return;const host=document.createElement('div');document.body.appendChild(host);root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>*{box-sizing:border-box}dialog{position:fixed;inset:0;margin:auto;width:min(1080px,96vw);max-height:94dvh;overflow:auto;padding:0;border:1px solid #e2e8f0;border-radius:22px;background:#f8fafc;color:#334155;font:15px system-ui,"Microsoft JhengHei",sans-serif}dialog::backdrop{background:#0f172a99}header,footer{padding:20px 24px;background:white;display:flex;justify-content:space-between;gap:12px;align-items:center;position:sticky;z-index:2}header{top:0;border-bottom:1px solid #e2e8f0}footer{bottom:0;border-top:1px solid #e2e8f0}h2{font-size:21px;color:#312e81;margin:0}main{padding:22px}button,input,select{font:inherit;border-radius:10px;padding:10px;border:1px solid #cbd5e1;background:white;color:#334155;min-width:0}button{cursor:pointer;font-weight:700;color:#4338ca;border-color:#e0e7ff}button:hover{background:#eef2ff}input:focus,select:focus{outline:3px solid #e0e7ff;border-color:#6366f1}.primary{background:#4f46e5;color:white}.primary:hover{background:#4338ca}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700}section{padding:18px;background:white;border:1px solid #e2e8f0;border-radius:16px;margin:14px 0}.wide{grid-column:span 2}.muted{font-size:13px;color:#64748b;line-height:1.7}.result{display:block;width:100%;text-align:left;margin:5px 0}.results{max-height:180px;overflow:auto}.bar{display:flex;gap:10px;align-items:center}.bar input{flex:1}.error{color:#b91c1c;white-space:pre-line}h3{font-size:16px;margin:0 0 16px}.remove{color:#dc2626;margin-top:12px}@media(max-width:650px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:12px}header,footer{padding:14px;flex-wrap:wrap}h2{font-size:18px}}</style>
 <dialog aria-labelledby="title"><header><h2 id="title">即期品售價申請</h2><button id="close">關閉</button></header><main>
 <section><div class="grid"><label class="wide">原 Excel 範本<input id="template" type="file" accept=".xlsx,.xlsm"></label><label>申請年月<input id="month" type="month"></label><label>營業所<input id="office" value="龍潭營業所"></label></div><p id="templateStatus" class="muted">選擇公司原始 Excel 範本，匯出時保留原表字型、格線及簽核區。本次開啟期間可重複使用。</p></section>
 <section><h3>加入產品（每張最多 4 項）</h3><div class="bar"><input id="search" placeholder="代號／品名／批發價／建議價"><button id="manual">手動新增</button></div><div id="matches" class="results"></div></section>
 <div id="items"></div><p class="muted">原價與數量請使用相同單位。折數範例：7 代表七折；加成 10 代表加計 10%。申請售價四捨五入至元，仍須依公司規定簽核。</p><p id="error" class="error" role="alert"></p>
 </main><footer><span id="count"></span><button id="export" class="primary">下載原格式 Excel 簽核單</button></footer></dialog>`;
 dialog=root.querySelector('dialog');$('month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
 $('close').onclick=()=>dialog.close();
 $('template').onchange=async()=>{template=null;const f=$('template').files[0];if(!f)return;$('templateStatus').textContent='正在核對原表欄位…';try{template=await parseTemplate(f);$('templateStatus').textContent='已選取：'+f.name+'；已確認 4 列明細與原表欄位。';$('error').textContent=''}catch(e){$('templateStatus').textContent='範本尚未載入';$('error').textContent=e.message}};
 $('search').oninput=search;$('manual').onclick=()=>add({});
 $('matches').onclick=e=>{const b=e.target.closest('[data-add]');if(b)add(results[Number(b.dataset.add)])};
 $('items').oninput=e=>{const {index,field}=e.target.dataset;if(index===undefined||!field)return;items[Number(index)][field]=e.target.value;updatePrices()};
 $('items').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){items.splice(Number(b.dataset.remove),1);render()}};
 $('export').onclick=async()=>{const b=$('export');b.disabled=true;try{if(!template)throw Error('請先選擇公司原始 Excel 範本。');const changes=changesFor(template,items,$('month').value,$('office').value.trim());let xml=template.xml;for(const [a,v]of Object.entries(changes))xml=patchCell(xml,a,v);xmlDoc(xml);const Zip=await loadZip(),zip=await Zip.loadAsync(template.buffer);zip.file(template.path,xml);
 if(zip.file('xl/calcChain.xml')){zip.remove('xl/calcChain.xml');const relpath='xl/_rels/workbook.xml.rels';zip.file(relpath,(await zip.file(relpath).async('string')).replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g,''));zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace(/<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g,''));}
 const blob=await zip.generateAsync({type:'blob',mimeType:template.filename.endsWith('.xlsm')?'application/vnd.ms-excel.sheet.macroEnabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='即期品簽核單_'+$('month').value+(template.filename.endsWith('.xlsm')?'.xlsm':'.xlsx');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);$('error').textContent=''}catch(e){$('error').textContent=e.message}finally{b.disabled=false}};
 render();
}
function add(p){if(items.length>=4){$('error').textContent='原表每張 4 項，請先匯出這張再填寫下一張。';return}
 items.push({id:String(p.id||''),name:String(p.name||''),qty:'',unit:String(p.min_unit||''),shelf:'',expiry:'',cat:'',period:'',base:p.w==null?'':String(p.w),method:'discount',rate:'',sale:'',notes:''});render();$('error').textContent=''}
function search(){results=window.searchBorrowProducts?.($('search').value)||[];$('matches').innerHTML=results.slice(0,50).map((p,i)=>'<button class="result" data-add="'+i+'">'+esc(p.id)+'　'+esc(p.name)+'　＋</button>').join('')}
function render(){
 const fields=[['id','產品代號'],['name','產品名稱'],['qty','屆期數量','number'],['unit','單位'],['shelf','保存期限（例：6個月）'],['expiry','到期年月日','date'],['cat','產品類別',['','菸','酒','啤酒','非菸酒']],['period','距保存期限情形',['','1個月內','2個月內','3個月內','4個月內','6個月內','其他']],['base','原價（與數量同單位）','number'],['method','計價方式',[['discount','折扣'],['markup','加成'],['direct','直接填售價']]],['rate','折數／加成百分比','number'],['sale','直接填售價','number'],['notes','備註／即期說明']];
 $('items').innerHTML=items.map((p,i)=>'<section><h3>第 '+(i+1)+' 項　<span id="price'+i+'"></span></h3><div class="grid">'+fields.map(([k,label,type])=>'<label class="'+(['name','notes'].includes(k)?'wide':'')+'">'+label+(Array.isArray(type)?'<select data-index="'+i+'" data-field="'+k+'">'+type.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o||'請選擇'];return '<option value="'+esc(v)+'" '+(p[k]===v?'selected':'')+'>'+esc(l)+'</option>'}).join('')+'</select>':'<input data-index="'+i+'" data-field="'+k+'" type="'+(type||'text')+'" value="'+esc(p[k])+'" '+(type==='number'?'min="0" step="'+(k==='qty'?'1':'any')+'"':'maxlength="100"')+'>')+'</label>').join('')+'</div><button class="remove" data-remove="'+i+'">移除此項</button></section>').join('');
 $('count').textContent=items.length+' / 4 項';updatePrices();
}
function updatePrices(){items.forEach((p,i)=>{try{$('price'+i).textContent='申請售價：'+salePrice(p)+' 元'}catch{$('price'+i).textContent='待填寫價格'}})}
window.ExpiryForm={open(products,p){init();if(p)add(p);search();if(!dialog.open)dialog.showModal()},mapTemplate,salePrice,patchCell,changesFor};
})();
