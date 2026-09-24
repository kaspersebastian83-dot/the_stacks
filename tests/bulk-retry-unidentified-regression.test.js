#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{const from=app.indexOf(start),to=app.indexOf(end,from);assert.ok(from>=0&&to>from,`Missing production source: ${start}`);return app.slice(from,to);};
const A='9780306406157',A10='0306406152',B='9780140449112',BAD='9780306406158';
const prelude=`function needsIdentification(book){return Boolean(book?.needsIdentification);}`;
const source=isbnSource+prelude+slice('function unresolvedValidISBNGroups','async function retryUnidentifiedIsbnAgainstCatalog')+
  `globalThis.api={toISBN13,unresolvedValidISBNGroups,runSequentialUnidentifiedIsbnRetries,formatRetryAllSummary};`;
const context=vm.createContext({Map,Set,Date,Math,setTimeout,clearTimeout,console});vm.runInContext(source,context);const api=context.api;
const plain=value=>JSON.parse(JSON.stringify(value));
const book=(id,isbn,location,needs=true,extra={})=>({id,copyId:id,isbn,needsIdentification:needs,title:needs?'Unidentified book':'Known title',authors:needs?'':'Known Author',workId:needs?'placeholder-'+id:'known-work',editionId:needs?'placeholder-edition-'+id:'known-edition',location,collections:['Home'],condition:'Good',acquisitionDate:'2024-02-01',acquisitionSource:'Gift',status:'read',rating:4,startedAt:'2024-01-01',finishedAt:'2024-01-30',readCount:2,lentTo:'Friend',lentDate:'2024-03-01',dueDate:'2024-04-01',returnedDate:'',copyNotes:'Note '+id,notes:'Private note '+id,privateReview:'Review '+id,addedAt:'2024-02-02',...extra});

async function run(books,retryOne,onProgress=()=>{}){return api.runSequentialUnidentifiedIsbnRetries({books,retryOne,onProgress,yieldControl:async()=>{}});}

(async()=>{
  const duplicates=[book('a1',A,{bookcase:'Oak',shelf:'1'}),book('a2',A10,{bookcase:'Pine',shelf:'2'}),book('b1',B,{bookcase:'Birch',shelf:'1'}),book('bad',BAD,{bookcase:'Oak',shelf:'3'}),book('missing','',{bookcase:'Oak',shelf:'4'}),book('known',A,{bookcase:'Ash',shelf:'5'},false)];
  const groups=api.unresolvedValidISBNGroups(duplicates);
  assert.equal(groups.length,2,'The button count derives from unique valid unresolved ISBNs');
  assert.deepEqual(plain(groups.map(group=>group.isbn)),[A,B],'ISBN-10 and ISBN-13 copies share one canonical lookup group');
  assert.equal(api.unresolvedValidISBNGroups([book('bad',BAD,{}),book('missing','',{})]).length,0,'No-valid-ISBN state is empty and safe');
  assert.equal(api.unresolvedValidISBNGroups([book('known',A,{},false)]).length,0,'Already identified Copies are excluded');

  const before=plain(duplicates),lookupOrder=[],progress=[];let inFlight=0,maxInFlight=0;
  const result=await run(duplicates,async({books,isbn})=>{
    lookupOrder.push(isbn);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
    await new Promise(resolve=>setTimeout(resolve,2));
    inFlight--;
    if(isbn===B)return{books,state:'unresolved',updatedCopies:0};
    const next=books.map(copy=>copy.needsIdentification&&copy.isbn&&api.toISBN13(copy.isbn)===isbn?{...copy,title:'Resolved A',authors:'Author A',workId:'work-a',editionId:'edition-a',needsIdentification:false}:copy);
    return{books:next,state:'identified',title:'Resolved A',updatedCopies:next.filter((copy,index)=>copy.needsIdentification===false&&books[index]?.needsIdentification).length};
  },value=>progress.push(value));
  assert.deepEqual(lookupOrder,[A,B],'Duplicate ISBN Copies trigger only one lookup and distinct ISBNs trigger distinct lookups');
  assert.equal(maxInFlight,1,'Bulk processing awaits each ISBN before starting the next');
  assert.equal(result.identified,1);assert.equal(result.unresolved,1);assert.equal(result.updatedCopies,2);
  assert.equal(result.books.find(copy=>copy.id==='a1').needsIdentification,false);
  assert.equal(result.books.find(copy=>copy.id==='a2').needsIdentification,false);
  assert.equal(result.books.find(copy=>copy.id==='known').title,'Known title','Identified same-ISBN peer is not rewritten');
  assert.notEqual(result.books.find(copy=>copy.id==='a1').id,result.books.find(copy=>copy.id==='a2').id);
  assert.deepEqual(plain(result.books.find(copy=>copy.id==='a1').location),before[0].location);
  assert.deepEqual(plain(result.books.find(copy=>copy.id==='a2').location),before[1].location);
  for(const field of ['collections','condition','acquisitionDate','acquisitionSource','status','rating','startedAt','finishedAt','readCount','lentTo','lentDate','dueDate','returnedDate','copyNotes','notes','privateReview','addedAt']){
    for(let index=0;index<2;index++)assert.deepEqual(result.books[index][field],before[index][field],`Copy ${index+1} preserves ${field}`);
  }
  assert.ok(progress.length>=4,'Progress reports before and after each ISBN');
  assert.match(api.formatRetryAllSummary(result),/1 ISBN identified · 1 still unresolved · 2 physical copies updated/);

  const continued=await run([book('temporary',A,{}),book('later',B,{})],async({books,isbn})=>{
    if(isbn===A)throw new Error('temporary provider failure');
    return{books:books.map(copy=>copy.isbn===B?{...copy,title:'Resolved B',needsIdentification:false}:copy),state:'identified',title:'Resolved B',updatedCopies:1};
  });
  assert.equal(continued.temporaryFailures,1,'Thrown lookup is a temporary failure category');
  assert.equal(continued.identified,1,'A later ISBN is processed after a temporary failure');
  assert.equal(continued.books.find(copy=>copy.id==='later').needsIdentification,false);

  const skipped=await run([book('bad',BAD,{}),book('none','',{})],async()=>{throw new Error('must not be called')});
  assert.equal(skipped.total,0);assert.equal(skipped.updatedCopies,0);
  assert.match(api.formatRetryAllSummary(skipped),/No additional books were identified/);

  assert.match(app,/Retry all ISBNs/,'The bulk action is visible in Organize');
  assert.match(app,/Retry all ISBNs\$\{retryISBNCount\?/,'The button count is conditional on the unique valid ISBN count');
  assert.match(app,/\(\$\{retryISBNCount\}\)/,'The button displays the unique valid ISBN count');
  assert.match(app,/unresolvedValidISBNGroups\(identification\)/,'Organize derives eligible ISBN count from Needs identification only');
  assert.match(app,/retrying \$\{bulkRetryProgress\.index\} of \$\{bulkRetryProgress\.total\}/i,'The action shows live progress');
  assert.match(app,/singleRetryingIsbnsRef\.current\.add\(requested\);acquireRetryingIsbn\(requested\)/,'Single retry uses the shared per-ISBN busy state');
  assert.match(app,/groups\.forEach\(group=>acquireRetryingIsbn\(group\.isbn\)\)/,'Bulk run reserves each ISBN against individual retries');
  assert.match(app,/if\(bulkRetryRunningRef\.current\)return\{state:'busy'\}/,'Second bulk start and individual starts are guarded');
  assert.match(app,/makeSnapshot\('before-retry-all-unidentified',true\)/,'One forced labeled safety snapshot is created for the batch');
  assert.match(app,/retryUnidentifiedIsbnAgainstCatalog\(\{books:workingBooks,isbn,trace\}\)/,'The runner reuses the same trusted exact ISBN operation');
  assert.match(app,/candidate=candidates\.find\(result=>isTrustedExactMetadataCandidate\(result,requested\)\)/,'Untrusted or wrong-ISBN candidates are not applied');
  assert.match(app,/formatRetryAllSummary\(summary\)/,'One concise completion summary is used');
  assert.match(app,/onRetryMetadata=\{retryUnidentifiedMetadata\}/,'Per-book Retry metadata remains connected');
  assert.match(app,/lookupISBNMetadataCandidates\(requested,current,\{trace\}\)/,'Open Library and Google rescue remain part of the existing shared pipeline');
  assert.doesNotMatch(app.slice(app.indexOf('async function retryUnidentifiedIsbnAgainstCatalog'),app.indexOf('function qualityProblems',app.indexOf('async function retryUnidentifiedIsbnAgainstCatalog'))),/searchMetadataCandidates|lookupGoogleBooksText/,'Bulk and single retry do not use fuzzy title search');
  const rescue=spawnSync(process.execPath,[path.join(__dirname,'isbn-rescue-regression.test.js')],{encoding:'utf8'});
  assert.equal(rescue.status,0,'Existing Paris Peasant v3.10.6 regression still passes');
  console.log('BULK_RETRY_UNIDENTIFIED_REGRESSION_PASS');
  console.log('Eligibility, unique ISBN grouping, sequential continuation, Copy preservation, progress, snapshots, and summary: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
