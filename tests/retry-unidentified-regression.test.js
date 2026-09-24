#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{const from=app.indexOf(start),to=app.indexOf(end,from);assert.ok(from>=0&&to>from,`Missing production source: ${start}`);return app.slice(from,to);};
const ISBN='9780306406157',OTHER='9780140449112';
const prelude=`
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const STATUS_LABEL={unread:'Unread',want:'Want',reading:'Reading',read:'Read',dnf:'Did not finish',reference:'Reference'};
function uniq(values){return [...new Set((values||[]).map(value=>String(value||'').trim()).filter(Boolean))];}
function normalizePersonList(value){return uniq(Array.isArray(value)?value:String(value||'').split(/[;\\n]+/));}
function normalizeOriginalPublicationYear(value){return String(value||'').trim();}
function normalizeSeriesText(value){return String(value||'').trim();}
function normalizeSeriesNumber(value){return String(value||'').trim();}
function genId(){return 'generated';}
function blankLocation(){return {room:'',bookcase:'',shelf:'',box:'',position:''};}
function normalizeLocation(value){return {...blankLocation(),...(value||{})};}
function isAutoFacet(){return false;}
function collectionNames(book){return uniq([...(book?.collections||[]),...(book?.shelves||[]),book?.shelf||'']);}
function normalizedCandidateIsbns(meta){const source=Array.isArray(meta?.reportedIsbns)?meta.reportedIsbns:[...(meta?.isbns||[]),meta?.isbn||''];return uniq(source.map(normalizeISBN).filter(value=>value&&isValidISBN(value)).map(toISBN13));}
function providerReportedIsbns(meta){const source=Array.isArray(meta?.reportedIsbns)?meta.reportedIsbns:[...(meta?.isbns||[]),meta?.isbn||''];return uniq(source.map(normalizeISBN).filter(value=>value&&isValidISBN(value)).map(toISBN13));}
function hasUsableMetadata(meta){return Boolean(String(meta?.title||'').trim()&&!/^(unidentified book|unknown book|untitled)$/i.test(String(meta.title).trim()));}
`;
const source=isbnSource+prelude+
  slice('function normalizeBook(book){','function inCollection')+
  slice('function migrationStringKey','function catalogSchemaIssues')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('const METADATA_FIELD_DEFS','function identificationTargetIdentity')+
  slice('function identificationTargetIdentity','function qualityProblems')+
  slice('function normalizedTitle','function reviewReasons')+
  slice('function isTrustedExactMetadataCandidate','function metadataRetryIsIncomplete')+
  slice('function metadataRetryIsIncomplete','function applyExactMetadataToUnidentifiedCopies')+
  slice('function applyExactMetadataToUnidentifiedCopies','function qualityProblems')+
  `globalThis.api={normalizeBook,applyExactMetadataToUnidentifiedCopies,isTrustedExactMetadataCandidate,metadataRetryIsIncomplete,needsIdentification};`;
const context=vm.createContext({Date,Math,Map,Set,URL,console});
vm.runInContext(source,context);
const api=context.api;
const plain=value=>JSON.parse(JSON.stringify(value));
const row=(id,copyId,location,overrides={})=>api.normalizeBook({id,copyId,isbn:ISBN,title:'Unidentified book',authors:'',workId:'unresolved-work-'+id,editionId:'unresolved-edition-'+id,needsIdentification:true,location,collections:['Home library'],status:'read',rating:4,startedAt:'2024-01-01',finishedAt:'2024-02-01',readCount:3,acquisitionDate:'2023-12-01',acquisitionSource:'Shop',condition:'Very good',copyNotes:'Copy-specific note '+id,lentTo:'Friend',lentDate:'2024-03-01',dueDate:'2024-04-01',returnedDate:'',privateReview:'Private '+id,addedAt:'2023-12-02',notes:'Private note '+id,...overrides});
const candidate={title:'The Resolved Book',authors:'Example Author',isbn:ISBN,isbns:[ISBN],reportedIsbns:[ISBN],metadataProvider:'openlibrary',metadataSource:'Open Library',metadataMatchMethod:'Exact ISBN via Open Library',metadataMatchEvidence:'IDENTIFIER_CONFIRMED',exactIsbn:true,publisher:'Example Press',year:'1985',pages:'240',language:'English',edition:'Second edition',format:'Print book',series:'Example Series',seriesNumber:'2',translators:['Translator Name'],editors:['Editor Name'],cover:'https://example.test/cover.jpg',tags:['fiction']};

(async()=>{
  assert.match(app,/function IntakeQueueView\([\s\S]*?onRetryMetadata,retryingIsbns/,'Organize list receives retry action state');
  assert.match(app,/onRetryMetadata=\{retryUnidentifiedMetadata\} retryingIsbns=\{retryingIsbns\}/,'Organize list is wired to the retry action');
  assert.match(app,/onIdentify=\{setIdentifying\}/,'Identify still opens the existing assistant');
  assert.match(app,/Retry metadata/,'Visible Retry metadata label exists in both requested views');
  assert.match(app,/disabled=\{!isValidISBN\(book\.isbn\)\|\|retryingIsbns\?\.has/,'Invalid ISBN and running retry disable the list action');
  assert.match(app,/function BookcaseBookCard[\s\S]*?needsIdentification\(book\)[\s\S]*?Retry metadata/,'Needs identification card has a visible retry action');
  assert.match(app,/lookupISBNMetadataCandidates\(requested,current,\{trace\}\)/,'Retry reuses the hardened exact ISBN candidate pipeline');
  assert.match(app,/applyExactMetadataToUnidentifiedCopies\(booksRef\.current\|\|\[\],copyId,candidate\)/,'Retry applies selected identification semantics to the unresolved ISBN group');
  assert.match(app,/Metadata lookup incomplete\. Try again later\./,'Provider outage has retryable feedback');
  assert.match(app,/No metadata found for ISBN \$\{requested\}\. Try Identify for manual search\./,'True no-result feedback keeps manual Identify available');
  assert.doesNotMatch(app.slice(app.indexOf('async function retryUnidentifiedMetadata'),app.indexOf('function applyIdentification',app.indexOf('async function retryUnidentifiedMetadata'))),/searchMetadataCandidates|lookupGoogleBooksText/,'Automatic retry does not use fuzzy title/author search');

  const a=row('record-a','copy-a',{bookcase:'Oak',shelf:'A1',room:'Office',box:'Box 2',position:'01'});
  const b=row('record-b','copy-b',{bookcase:'Pine',shelf:'B3',room:'Loft',box:'',position:'08'},{collections:['Favorites','Home library'],status:'reading',rating:2,condition:'Acceptable',copyNotes:'B note'});
  const c=api.normalizeBook({id:'record-c',copyId:'copy-c',isbn:ISBN,title:candidate.title,authors:candidate.authors,workId:'known-work',editionId:'known-edition',needsIdentification:false,location:{bookcase:'Ash',shelf:'C2',room:'Study',box:'Box 9',position:'15'},collections:['Archive'],status:'unread',condition:'New',copyNotes:'Do not rewrite C'});
  const beforeC=JSON.stringify(c);
  const originalA=plain(a),originalB=plain(b);
  const result=api.applyExactMetadataToUnidentifiedCopies([a,b,c],'copy-a',candidate);
  const fixedA=result.books.find(book=>book.copyId==='copy-a');
  const fixedB=result.books.find(book=>book.copyId==='copy-b');
  const untouchedC=result.books.find(book=>book.copyId==='copy-c');
  assert.equal(result.updated,2,'Both still-unidentified physical copies with the requested ISBN are identified');
  assert.equal(fixedA.title,candidate.title,'Placeholder title is replaced');
  assert.equal(fixedA.needsIdentification,false,'Identification state is cleared');
  assert.equal(fixedA.copyId,'copy-a');
  assert.equal(fixedA.workId,'known-work');
  assert.equal(fixedA.editionId,'known-edition');
  assert.equal(fixedB.copyId,'copy-b');
  assert.equal(fixedB.workId,'known-work');
  assert.equal(fixedB.editionId,'known-edition');
  assert.notEqual(fixedA.copyId,fixedB.copyId);
  assert.deepEqual(plain(fixedA.location),originalA.location);
  assert.deepEqual(plain(fixedB.location),originalB.location);
  assert.deepEqual(plain(fixedA.collections),originalA.collections);
  assert.deepEqual(plain(fixedB.collections),originalB.collections);
  for(const field of ['status','rating','startedAt','finishedAt','readCount','acquisitionDate','acquisitionSource','condition','copyNotes','lentTo','lentDate','dueDate','returnedDate','privateReview','addedAt','notes']){
    assert.deepEqual(fixedA[field],originalA[field],`Copy A preserves ${field}`);
    assert.deepEqual(fixedB[field],originalB[field],`Copy B preserves ${field}`);
  }
  assert.deepEqual(plain(fixedA.tags),['fiction']);
  assert.equal(untouchedC.title,candidate.title);
  assert.equal(untouchedC.workId,'known-work');
  assert.equal(untouchedC.editionId,'known-edition');
  assert.equal(JSON.stringify(untouchedC),beforeC,'Already identified same-ISBN Copy stays byte-for-byte unchanged');
  assert.equal(fixedA.publisher,candidate.publisher);
  assert.equal(fixedA.seriesNumber,candidate.seriesNumber);
  assert.equal(fixedA.translators[0],'Translator Name');
  assert.equal(fixedA.editors[0],'Editor Name');

  const inferred={...candidate,metadataProvider:'dnb',reportedIsbns:[],isbns:[],isbn:ISBN,metadataMatchEvidence:'PROVIDER_EXACT_QUERY',exactQueryIsbn:ISBN,exactQueryRecordCount:1};
  assert.equal(api.isTrustedExactMetadataCandidate(inferred,ISBN),true,'Previously hardened single-record DNB/LOC query evidence remains usable');
  assert.equal(api.isTrustedExactMetadataCandidate({...candidate,isbn:OTHER,reportedIsbns:[OTHER],isbns:[OTHER]},ISBN),false,'Wrong ISBN candidate cannot identify');
  assert.equal(api.metadataRetryIsIncomplete([{state:'TIMEOUT'}]),true,'Provider outage is retryable');
  assert.equal(api.metadataRetryIsIncomplete([{state:'RATE_LIMITED'}]),true,'Rate limit is retryable');
  assert.equal(api.metadataRetryIsIncomplete([{state:'NO_RECORD'},{state:'WRONG_ISBN'}]),false,'Successful empty/wrong results are not mislabeled as temporary outages');
  const unresolved=row('record-d','copy-d',{bookcase:'Birch',shelf:'D1'});
  const noResult=api.applyExactMetadataToUnidentifiedCopies([unresolved],'copy-d',{...candidate,title:'',exactIsbn:false});
  assert.equal(noResult.updated,0);
  assert.equal(noResult.books[0].needsIdentification,true,'No usable result leaves the Copy unresolved');
  assert.equal(api.applyExactMetadataToUnidentifiedCopies([unresolved],'copy-d',{...candidate,isbn:OTHER,reportedIsbns:[OTHER],isbns:[OTHER]}).updated,0);
  assert.equal(api.applyExactMetadataToUnidentifiedCopies([unresolved],'missing',candidate).updated,0);
  const noIsbn=row('record-e','copy-e',{bookcase:'Birch',shelf:'D2'},{isbn:'not-valid'});
  assert.equal(api.applyExactMetadataToUnidentifiedCopies([noIsbn],'copy-e',candidate).updated,0,'Invalid ISBN cannot be retried');
  const noPeerA=row('record-f','copy-f',{bookcase:'Willow',shelf:'F1'});
  const noPeerB=row('record-g','copy-g',{bookcase:'Willow',shelf:'F2'});
  const noPeer=api.applyExactMetadataToUnidentifiedCopies([noPeerA,noPeerB],'copy-f',candidate);
  assert.equal(noPeer.books[0].workId,noPeer.books[1].workId,'Matching ISBN Copies converge to the identified Work');
  assert.equal(noPeer.books[0].editionId,noPeer.books[1].editionId,'Matching ISBN Copies converge to the identified Edition');
  assert.notEqual(noPeer.books[0].workId,noPeerA.workId,'Placeholder Work identity is corrected after title resolution');
  assert.notEqual(noPeer.books[0].editionId,noPeerA.editionId,'Placeholder Edition identity is corrected after title resolution');

  console.log('RETRY_UNIDENTIFIED_REGRESSION_PASS');
  console.log('Visible per-book actions, exact ISBN selection, same-Edition Copy updates, Copy-data preservation, and safe unresolved outcomes: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
