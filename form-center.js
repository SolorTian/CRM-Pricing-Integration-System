(function(){
'use strict';
const mobile=()=>window.matchMedia('(max-width:767px), (max-height:500px) and (pointer:coarse)').matches;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.FormHints={mark(input,missing){if(!input)return;input.classList.toggle('needs-input',missing);input.setAttribute('aria-required','true');input.title=missing?'待填：請補上此欄位':'';}};
let root,dialog,products=[],results=[],selected=null;
const $=id=>root.getElementById(id);
function init(){
 if(root)return;
 const host=document.createElement('div');document.body.appendChild(host);root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>*{box-sizing:border-box}dialog{position:fixed;inset:0;margin:auto;padding:0;width:min(740px,94vw);max-height:90dvh;overflow:auto;border:1px solid #e2e8f0;border-radius:22px;color:#334155;background:#f8fafc;font:15px system-ui,"Microsoft JhengHei",sans-serif}dialog::backdrop{background:#0f172a99}header{padding:20px 24px;background:white;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0}h2{margin:0;font-size:21px;color:#312e81}main{padding:24px}button,input{font:inherit;border:1px solid #cbd5e1;border-radius:10px;padding:11px;background:white;color:#4338ca}button{cursor:pointer;font-weight:700}button:hover{background:#eef2ff}button:disabled{opacity:.4;cursor:default}input{width:100%;color:#334155;margin-top:9px}input:focus{outline:3px solid #e0e7ff;border-color:#6366f1}label{font-weight:700}.muted{font-size:13px;color:#64748b;line-height:1.7}.results{max-height:300px;overflow:auto;margin-top:14px}.result{display:block;width:100%;text-align:left;margin:6px 0;color:#334155}.result small{display:block;margin-top:5px;color:#64748b;font-weight:400}#selected{padding:16px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;margin:18px 0;line-height:1.8}.actions{display:flex;gap:12px}.actions button{flex:1;background:#4f46e5;border-color:#4f46e5;color:white}.actions button:hover{background:#4338ca}.manual{padding:4px 0;border:0;background:transparent;font-size:13px;margin:10px 0}#error{color:#b91c1c}[hidden]{display:none!important}</style>
 <dialog aria-labelledby="title"><header><h2 id="title">表單中心</h2><button id="close">關閉</button></header><main>
 <label for="search">先搜尋要填單的產品<input id="search" placeholder="輸入品號、品名、批發價或建議價" autocomplete="off"></label>
 <div id="results" class="results"></div><p id="status" class="muted">選定產品後，再選擇借貨或即期申請；已知資料會自動帶入。</p>
 <button class="manual" id="manual">找不到產品？手動填寫</button>
 <div id="selected" hidden></div><div class="actions"><button id="borrow" disabled>填寫借貨申請單</button><button id="expiry" disabled>填寫即期價申請</button></div><p id="error" role="alert"></p>
 </main></dialog>`;
 dialog=root.querySelector('dialog');$('close').onclick=()=>dialog.close();$('search').oninput=search;
 $('results').onclick=e=>{const b=e.target.closest('[data-pick]');if(b)choose(results[Number(b.dataset.pick)])};
 $('manual').onclick=()=>choose({});$('borrow').onclick=()=>proceed('BorrowForm');$('expiry').onclick=()=>proceed('ExpiryForm');
 window.addEventListener('resize',()=>{if(mobile()&&dialog.open)dialog.close()});
}
function search(){
 selected=null;$('selected').hidden=true;$('borrow').disabled=$('expiry').disabled=true;
 const q=$('search').value.trim();results=q?(window.searchBorrowProducts?.(q)||[]):[];
 $('results').innerHTML=results.slice(0,60).map((p,i)=>'<button class="result" data-pick="'+i+'">'+esc(p.id)+'　'+esc(p.name)+'<small>批發價 '+esc(p.w??'—')+' ／ 零單位 '+esc(p.min_unit||'待填')+'</small></button>').join('');
 $('status').textContent=!q?'選定產品後，再選擇借貨或即期申請；已知資料會自動帶入。':results.length?'共 '+results.length+' 項，點選一項產品'+(results.length>60?'（先顯示前 60 項）':''):'查無產品，請換關鍵字或手動填寫。';
}
function choose(p){
 selected=p;$('selected').hidden=false;$('selected').innerHTML=p.id?'<strong>'+esc(p.name)+'</strong><br>品號 '+esc(p.id)+' · 零單位 '+esc(p.min_unit||'待填')+' · 批發價 '+esc(p.w??'待填'):'手動填寫產品資料；橘色欄位需補填。';
 $('borrow').disabled=$('expiry').disabled=false;$('error').textContent='';
}
async function proceed(type){
 if(!selected||mobile())return;
 if(!window[type]){$('error').textContent='表單載入中，請稍後再試。';return}
 dialog.close();await window[type].open(products,selected);
}
window.FormCenter={open(list){if(mobile())return;init();products=Array.isArray(list)?list:[];$('search').value='';$('error').textContent='';search();if(!dialog.open)dialog.showModal();$('search').focus();}};
})();
