import {isValidISBN,normalizeScannedCode,toISBN13} from './isbn.mjs';

const CAMERA_DUPLICATE_MS=900;
const locationValue=(location,field)=>String(location?.[field]||'').trim();

function auditShelfKey(location){
  const bookcase=locationValue(location,'bookcase'),shelf=locationValue(location,'shelf');
  return bookcase&&shelf?JSON.stringify([bookcase,locationValue(location,'room'),shelf]):'';
}

function canonicalAuditISBN(value){
  const isbn=normalizeScannedCode(value);
  return isbn&&isValidISBN(isbn)?toISBN13(isbn):'';
}

function auditCatalogCopies(catalog){
  const editions=new Map((catalog?.editions||[]).map(edition=>[edition.id,edition]));
  const works=new Map((catalog?.works||[]).map(work=>[work.id,work]));
  return (catalog?.copies||[]).filter(copy=>copy?.id).map(copy=>{
    const edition=editions.get(copy.editionId)||{};
    const work=works.get(copy.workId||edition.workId)||{};
    const location=Object.fromEntries(['room','bookcase','shelf','box','position'].map(field=>[field,locationValue(copy.location,field)]));
    return {copyId:String(copy.id),workId:String(copy.workId||edition.workId||''),editionId:String(copy.editionId||''),isbn:String(edition.isbn||''),canonicalISBN:canonicalAuditISBN(edition.isbn),title:edition.title||work.title||'Untitled book',authors:edition.authors||work.authors||work.author||'',cover:edition.cover||'',location};
  });
}

function createShelfAuditState(catalog,target){
  if(!auditShelfKey(target))throw new Error('Choose a Bookcase and Shelf.');
  const location=Object.fromEntries(['room','bookcase','shelf','box','position'].map(field=>[field,locationValue(target,field)]));
  location.box='';location.position='';
  const owned=auditCatalogCopies(catalog);
  return {target:location,expected:owned.filter(copy=>auditShelfKey(copy.location)===auditShelfKey(location)),owned,events:[],manualPresentIds:[],lastFeedback:null,finished:false};
}

function applyShelfAuditScan(state,raw,{source='manual',now=Date.now()}={}){
  if(!state||state.finished)return state;
  const isbn=canonicalAuditISBN(raw);
  if(!isbn)return {...state,lastFeedback:{kind:'invalid',label:'Invalid ISBN'}};
  const last=state.events.at(-1);
  if(source==='camera'&&last?.source==='camera'&&last.isbn===isbn&&now>=last.at&&now-last.at<CAMERA_DUPLICATE_MS)return state;
  const next={...state,events:[...state.events,{isbn,source,at:now}],lastFeedback:null};
  const result=auditSummary(next).events.at(-1);
  return {...next,lastFeedback:result};
}

function undoShelfAuditScan(state){
  if(!state?.events.length||state.finished)return state;
  const next={...state,events:state.events.slice(0,-1),lastFeedback:null};
  return {...next,lastFeedback:auditSummary(next).events.at(-1)||null};
}

function markShelfAuditPresent(state,copyId){
  if(!state||!state.expected.some(copy=>copy.copyId===copyId&&!copy.canonicalISBN))return state;
  const present=new Set(state.manualPresentIds);
  if(present.has(copyId))present.delete(copyId);else present.add(copyId);
  return {...state,manualPresentIds:[...present]};
}

function finishShelfAudit(state){return state?{...state,finished:true}:state;}

function auditSummary(state){
  const expectedByISBN=new Map(),ownedByISBN=new Map();
  for(const copy of state.expected){if(!copy.canonicalISBN)continue;const group=expectedByISBN.get(copy.canonicalISBN)||[];group.push(copy);expectedByISBN.set(copy.canonicalISBN,group);}
  for(const copy of state.owned){if(!copy.canonicalISBN)continue;const group=ownedByISBN.get(copy.canonicalISBN)||[];group.push(copy);ownedByISBN.set(copy.canonicalISBN,group);}
  const matchedCounts=new Map(),elsewhereCounts=new Map();
  const events=state.events.map((event,index)=>{
    const expected=expectedByISBN.get(event.isbn)||[],owned=ownedByISBN.get(event.isbn)||[];
    const matched=matchedCounts.get(event.isbn)||0;
    if(matched<expected.length){matchedCounts.set(event.isbn,matched+1);return {...event,index,kind:'expected',label:'Expected here',title:expected[0].title,authors:expected[0].authors,expectedCopies:expected};}
    const elsewhere=owned.filter(copy=>auditShelfKey(copy.location)!==auditShelfKey(state.target));
    const elsewhereUsed=elsewhereCounts.get(event.isbn)||0;
    if(elsewhereUsed<elsewhere.length){elsewhereCounts.set(event.isbn,elsewhereUsed+1);return {...event,index,kind:'owned-elsewhere',label:'Unexpected on this shelf',title:elsewhere[0].title,authors:elsewhere[0].authors,candidates:elsewhere};}
    if(owned.length)return {...event,index,kind:'extra',label:'Unexpected extra occurrence',title:owned[0].title,authors:owned[0].authors,candidates:[]};
    return {...event,index,kind:'not-owned',label:'Not in library',title:event.isbn,candidates:[]};
  });
  const missing=[...expectedByISBN].map(([isbn,copies])=>({isbn,copies,count:copies.length-(matchedCounts.get(isbn)||0)})).filter(group=>group.count>0);
  const correctlyShelved=[...expectedByISBN].map(([isbn,copies])=>({isbn,copies,count:matchedCounts.get(isbn)||0})).filter(group=>group.count>0);
  const manualNeeded=state.expected.filter(copy=>!copy.canonicalISBN&&!state.manualPresentIds.includes(copy.copyId));
  const manualPresent=state.expected.filter(copy=>!copy.canonicalISBN&&state.manualPresentIds.includes(copy.copyId));
  const matchedByISBN=events.filter(event=>event.kind==='expected').length;
  return {events,missing,correctlyShelved,manualNeeded,manualPresent,expected:state.expected.length,scanned:events.length,matched:matchedByISBN,matchedByISBN,accounted:matchedByISBN+manualPresent.length,unexpected:events.filter(event=>event.kind!=='expected').length,notInLibrary:events.filter(event=>event.kind==='not-owned').length};
}

export {CAMERA_DUPLICATE_MS,applyShelfAuditScan,auditCatalogCopies,auditShelfKey,auditSummary,canonicalAuditISBN,createShelfAuditState,finishShelfAudit,markShelfAuditPresent,undoShelfAuditScan};
