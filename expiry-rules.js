(function(global){
'use strict';
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function parseDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const [y,m,d]=s.split('-').map(Number),v=new Date(Date.UTC(y,m-1,d));return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d?v:null}
function addMonths(s,n){const d=parseDate(s);if(!d)return '';const y=d.getUTCFullYear(),m=d.getUTCMonth()+n,day=d.getUTCDate(),last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return new Date(Date.UTC(y,m,Math.min(day,last))).toISOString().slice(0,10)}
function shelf(text){
 const s=String(text||'').replace(/（[^）]*）/g,'').replace(/[０-９]/g,c=>String(c.charCodeAt(0)-65296));
 if(/(?:保存期限|有效期限|保鮮期限)[：:\s]*(?:無限期|無期限)/.test(s))return '無限期';
 const m=s.match(/(?:保存期限|有效期限|保鮮期限|保質期|賞味期限)[：:\s]*(?:未開封[：:\s]*)?(\d+(?:\.\d+)?|一|二|三|四|五|六|七|八|九|十|十二|十八|二十四)\s*(年|個?月|天|日)/);
 if(!m)return '';const digits={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十二':12,'十八':18,'二十四':24},n=digits[m[1]]||Number(m[1]);if(n<=0||n>1000)return '';return n+(m[2].includes('月')?'個月':m[2]==='日'?'天':m[2]);
}
function shelfMonths(value){const m=String(value||'').trim().match(/^(\d+(?:\.\d+)?)\s*(年|個?月|天|日)$/);if(!m)return null;const n=Number(m[1]);if(n<=0)return null;return m[2]==='年'?n*12:m[2].includes('月')?n:n*12/365}
function classify(p,official={}){
 const db=String(p.cat||''),cat=String(official.category||'');
 if(/[菸煙]/.test(db))return '菸';
 if(/啤酒/.test(cat)||/啤酒/.test(db))return '啤酒';
 if(cat){if(/酒類|高粱|威士忌|葡萄酒|清酒|黃酒|米酒|養生酒|酒品/.test(cat))return '酒';return '非菸酒'}
 if(/酒/.test(db))return '酒';
 return db?'非菸酒':'';
}
function period(expiry,day=today()){
 if(!parseDate(expiry))return '';
 if(expiry<day)return '已到期';
 for(const n of [1,2,3,4,6])if(day>=addMonths(expiry,-n))return n+'個月內';
 return '其他';
}
function recommend(p,day=today()){
 const expiry=p.expiry;
 if(!parseDate(expiry))return {rate:'',message:'填寫到期日後自動判斷'};
 if(expiry<day)return {rate:'',message:'產品已到期，不套用即期價'};
 const within=n=>day>=addMonths(expiry,-n);
 if(p.cat==='菸')return within(1)?{rate:'7',message:'扣除健康捐及菸稅後打七折，再加回稅捐；限營業所開單、客戶或員工購買'}:{rate:'',message:'尚未進入菸品一個月內的適用區間'};
 if(p.cat==='啤酒'){
  if(/生啤|桶啤|桶裝|桶裝|18\s*天|十八天|鮮啤/.test((p.name||'')+' '+(p.officialTitle||'')))return {rate:'',message:'生啤、桶啤不適用這組啤酒折扣，請另行確認'};
  return within(1)?{rate:'7',message:'一般啤酒：一個月內七折'}:within(2)?{rate:'9',message:'一般啤酒：兩個月內九折'}:{rate:'',message:'尚未進入一般啤酒的適用區間'};
 }
 if(p.cat==='酒'){
  const months=shelfMonths(p.shelf);if(months===null)return {rate:'',message:'請補上保存期限，才能判斷酒類折數'};
  const [near,far]=months<=12?[1,2]:months<24?[2,4]:[3,6];
  return within(near)?{rate:'7',message:'酒類：'+near+'個月內七折'}:within(far)?{rate:'9',message:'酒類：'+far+'個月內九折'}:{rate:'',message:'尚未進入此保存期限的酒類適用區間'};
 }
 return {rate:'',message:'此類別未提供批發價折扣規則，請填寫已確認的折數'};
}
function calculate(p){
 const base=Number(p.base),rate=Number(p.rate);
 if(p.base===''||!Number.isFinite(base)||base<0)throw Error('請填寫批發價。');
 if(p.rate===''||!Number.isFinite(rate)||rate<=0||rate>10)throw Error('折數須大於 0 且不超過 10。');
 let price=base*rate/10;
 if(p.cat==='菸'){
  const tax=Number(p.tax);if(p.tax==null||p.tax===''||!Number.isFinite(tax)||tax<0||tax>base)throw Error('請填寫與批發價同單位的健康捐＋菸稅，且不得超過批發價。');
  price=(base-tax)*rate/10+tax;
 }
 if(!Number.isSafeInteger(Math.round(price)))throw Error('價格超出可計算範圍。');
 return Math.round(price+Number.EPSILON);
}
global.ExpiryRules={today,parseDate,addMonths,shelf,shelfMonths,classify,period,recommend,calculate};
})(typeof window==='undefined'?globalThis:window);
