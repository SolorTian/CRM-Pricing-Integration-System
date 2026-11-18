(function(global){
'use strict';
let readyPromise;
async function prepare(){
 if(!readyPromise)readyPromise=(async()=>{
  if(!global.PDFLib)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/pdf-lib.min.js';s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('PDF 元件載入失敗，請重試。'))};document.head.appendChild(s)});
  const response=await fetch('expiry-template.pdf?v=20261118-1');if(!response.ok)throw Error('原格式 PDF 範本載入失敗。');
  const bytes=new Uint8Array(await response.arrayBuffer());await global.PDFLib.PDFDocument.load(bytes);return bytes;
 })().catch(e=>{readyPromise=null;throw e});
 return readyPromise;
}
function validate(items,day,office){
 if(!office.trim())throw Error('請填寫營業所。');
 if(!items.length||items.length>4)throw Error('每張請填寫 1～4 項產品。');
 const r=global.ExpiryRules;
 for(const p of items){
  for(const [key,label]of [['id','產品代號'],['name','產品名稱'],['unit','單位'],['shelf','保存期限'],['expiry','到期年月日'],['cat','產品類別'],['period','距保存期限情形']])if(!String(p[key]??'').trim())throw Error('請補填'+label+'。');
  if(!Number.isInteger(Number(p.qty))||Number(p.qty)<=0)throw Error('數量須為正整數，請依所選單位填寫。');
  if(!r.parseDate(p.expiry)||p.expiry<day)throw Error('產品到期日早於今天，或日期無效。請核對包裝上的有效日期。');
  if(!['菸','酒','啤酒','非菸酒'].includes(p.cat)||!['1個月內','2個月內','3個月內','4個月內','6個月內','其他'].includes(p.period))throw Error('請選擇有效的類別及距保存期限情形。');
  r.calculate(p);
 }
}
function wrap(ctx,text,width){const lines=[];for(const part of String(text).split('\n')){let line='';for(const c of Array.from(part)){if(line&&ctx.measureText(line+c).width>width){lines.push(line);line=c}else line+=c}lines.push(line)}return lines;}
async function textImage(pdf,page,text,x,y,width,height,maxSize=14){
 if(text==null||text==='')return;
 const canvas=document.createElement('canvas'),scale=3;canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('瀏覽器無法繪製 PDF 文字。');ctx.scale(scale,scale);
 let size=maxSize,lines;
 for(;size>=8;size-=.5){ctx.font=size+'px "DFKai-SB", "標楷體", "Noto Serif TC", serif';lines=wrap(ctx,text,width-4);if(lines.length*size*1.25<=height-4)break}
 if(size<8)throw Error('欄位內容過長，請縮短品名或備註後再產生 PDF。');
 ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';const lineHeight=size*1.25,start=(height-lines.length*lineHeight)/2+lineHeight/2;
 lines.forEach((line,i)=>ctx.fillText(line,width/2,start+i*lineHeight));
 const img=await pdf.embedPng(canvas.toDataURL('image/png'));page.drawImage(img,{x,y,width,height});
}
function tick(page,x,y){const color=global.PDFLib.rgb(0,0,0);page.drawLine({start:{x:x+2,y:y+7},end:{x:x+5,y:y+3},thickness:1.6,color});page.drawLine({start:{x:x+5,y:y+3},end:{x:x+12,y:y+12},thickness:1.6,color});}
async function generate(items,day,office){
 validate(items,day,office);
 const source=await prepare(),pdf=await global.PDFLib.PDFDocument.load(source),page=pdf.getPages()[0];
 if(pdf.getPageCount()!==1||Math.abs(page.getWidth()-1147.83)>1||Math.abs(page.getHeight()-886.957)>1)throw Error('PDF 範本尺寸不符，已停止產生以免錯位。');
 const [year,month]=day.split('-').map(Number);
 await textImage(pdf,page,String(year-1911),245,814,43,21,18);await textImage(pdf,page,String(month),309,814,38,21,18);
 if(office!=='龍潭營業所'){page.drawRectangle({x:570,y:837,width:94,height:21,color:global.PDFLib.rgb(1,1,1)});await textImage(pdf,page,office,570,832,94,21,18)}
 const edges=[91,156,263,329,370,420,483,560,737,863,941,1010,1115],rowEdges=[740,667,594,518,433];
 const catY=[725.5652,652.174,577.7391,497.7391],periodY=[716.5218,643.1305,568.5218,488.6956];
 for(let i=0;i<items.length;i++){
  const p=items[i],bottom=rowEdges[i+1],height=rowEdges[i]-bottom;
  const notes=[p.notes,p.cat==='菸'?'扣除稅捐 '+p.tax+' 元後折扣，再加回稅捐':''].filter(Boolean).join('\n');
  const values={0:p.id,1:p.name,2:p.qty,3:p.unit,4:p.shelf,5:p.expiry.replace(/^(\d+)-(\d+)-(\d+)$/,'$1\n$2/$3'),8:p.base,9:p.rate+'折',10:global.ExpiryRules.calculate(p),11:notes};
  for(const [col,value]of Object.entries(values)){const c=Number(col);await textImage(pdf,page,String(value??''),edges[c]+3,bottom+4,edges[c+1]-edges[c]-6,height-8,c===11?12:14)}
  tick(page,485.9,catY[i]-['菸','酒','啤酒','非菸酒'].indexOf(p.cat)*18.26);
  const n=['1個月內','2個月內','3個月內','4個月內','6個月內','其他'].indexOf(p.period);tick(page,n%2?636:567.13,periodY[i]-Math.floor(n/2)*18.26);
 }
 pdf.setTitle('即期品售價申請 '+day);return pdf.save();
}
global.ExpiryPDF={prepare,validate,generate};
})(typeof window==='undefined'?globalThis:window);
