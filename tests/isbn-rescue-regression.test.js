#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{const from=app.indexOf(start),to=app.indexOf(end,from);assert.ok(from>=0&&to>from,`Missing production source: ${start}`);return app.slice(from,to);};
const ISBN='9781878972101',OTHER='9780140449112';
const helpers=`
function uniq(items){return [...new Set((items||[]).map(value=>String(value||'').trim()).filter(Boolean))];}
function normalizePersonList(value){return uniq(Array.isArray(value)?value:String(value||'').split(/[;\\n]+/));}
function normalizeOriginalPublicationYear(value){return String(value||'').trim();}
function structuredOriginalPublicationYear(value){return String(value||'').match(/\\d{4}/)?.[0]||'';}
function normalizeSeriesText(value){return String(value||'').trim();}
function normalizeSeriesNumber(value){return String(value||'').trim();}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function coverUrlFromISBN(value){return 'cover:'+value;}
`;
const metadataSource=isbnSource+helpers+
  slice('const METADATA_REQUEST_TIMEOUT_MS','async function lookupGoogleBooksText')+
  slice('function openLibraryDocToMeta','async function lookupOpenLibrarySearchCandidates')+
  slice('function metadataRetryIsIncomplete','function applyExactMetadataToUnidentifiedCopies')+
  `globalThis.api={toISBN13,toISBN10,isbnVariants,selectBestExactMetadataCandidates,hasOnlyRequestedSourceIsbns,lookupOpenLibraryDirectISBNCandidates,lookupGoogleBooksDirectISBNCandidates,orchestrateISBNMetadata,lookupISBNMetadataBaseCandidates,metadataRetryFeedback,probeOpenLibraryCover,cache:ISBN_METADATA_PROMISE_CACHE};`;
function runtime(){const context=vm.createContext({fetch:async()=>response({},404),console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Map,Set,Math,Object,SyntaxError});vm.runInContext(metadataSource,context);return context.api;}
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)});
const edition=(isbn=ISBN)=>({title:'Paris Peasant',isbn_13:[isbn],authors:[{key:'/authors/OL12345A'}],publishers:['Exact Press'],publish_date:'1971',number_of_pages:216,covers:[12345],physical_format:'Paperback'});
const google=(identifiers=[ISBN])=>({items:[{volumeInfo:{title:'Paris Peasant',authors:['Louis Aragon'],industryIdentifiers:identifiers.map(identifier=>({type:identifier.length===10?'ISBN_10':'ISBN_13',identifier})),publisher:'Exact Press',printType:'BOOK'}}]});
const base={openLibrary:async()=>[],google:async()=>[],nationalLibraries:[]};
const values=value=>Array.from(value||[]);
const plain=value=>JSON.parse(JSON.stringify(value));

const copyPrelude=`
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
const copySource=isbnSource+copyPrelude+
  slice('function normalizeBook(book){','function inCollection')+
  slice('function migrationStringKey','function catalogSchemaIssues')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('const METADATA_FIELD_DEFS','function identificationTargetIdentity')+
  slice('function identificationTargetIdentity','function qualityProblems')+
  slice('function normalizedTitle','function reviewReasons')+
  slice('function isTrustedExactMetadataCandidate','function metadataRetryIsIncomplete')+
  slice('function applyExactMetadataToUnidentifiedCopies','function qualityProblems')+
  `globalThis.copyApi={normalizeBook,applyExactMetadataToUnidentifiedCopies};`;
const copyContext=vm.createContext({Date,Math,Map,Set,URL,console});vm.runInContext(copySource,copyContext);
const copyApi=copyContext.copyApi;

(async()=>{
  const isbn10=runtime().toISBN10(ISBN);assert.ok(isbn10&&isbn10.length===10);
  {
    const api=runtime();let direct=0;
    const found=values(await api.orchestrateISBNMetadata(ISBN,{...base,openLibrary:async()=>[{title:'Existing exact',authors:'Author',isbn:ISBN,isbns:[ISBN],metadataProvider:'openlibrary'}],openLibraryDirect:async()=>{direct++;return[];},googleDirect:async()=>{direct++;return[];}}));
    assert.equal(found[0].title,'Existing exact');assert.equal(direct,0,'Trusted main result prevents rescue requests');
  }
  {
    const api=runtime(),calls=[],trace=[];
    const fetchImpl=async url=>{calls.push(url);if(url.includes('/authors/'))return response({name:'Louis Aragon'});return response(edition());};
    const found=values(await api.orchestrateISBNMetadata(ISBN,{...base,fetchImpl,trace}));
    assert.equal(found[0].title,'Paris Peasant');assert.equal(found[0].authors,'Louis Aragon');
    assert.equal(found[0].metadataMatchEvidence,'IDENTIFIER_CONFIRMED');
    assert.deepEqual(plain(found[0].reportedIsbns),[ISBN]);
    assert.ok(calls.some(url=>url.includes('/isbn/'+ISBN+'.json')),'Main miss invokes direct edition endpoint');
    assert.ok(!calls.some(url=>url.includes('googleapis.com')),'Direct OL success prevents Google fallback');
    assert.ok(trace.some(entry=>entry.strategy==='direct-edition-isbn-'+ISBN&&entry.state==='FOUND'));
  }
  {
    const api=runtime(),calls=[];
    const found=values(await api.lookupOpenLibraryDirectISBNCandidates(ISBN,{fetchImpl:async url=>{calls.push(url);return url.includes('/isbn/'+isbn10+'.json')?response({...edition(),isbn_13:[],isbn_10:[isbn10],authors:[{name:'Louis Aragon'}]}):response({},404);}}));
    assert.equal(found[0].isbn,ISBN,'ISBN-10 evidence converts to canonical ISBN-13');
    assert.ok(calls.some(url=>url.includes('/isbn/'+isbn10+'.json')));
  }
  {
    const api=runtime(),calls=[];
    const authors=[1,2,3,4].map(number=>({key:`/authors/OL${number}A`}));
    const found=values(await api.lookupOpenLibraryDirectISBNCandidates(ISBN,{fetchImpl:async url=>{calls.push(url);return url.includes('/authors/')?response({name:'Author '+calls.length}):response({...edition(),authors});}}));
    assert.equal(found.length,1);
    assert.equal(calls.filter(url=>url.includes('/authors/')).length,3,'Author lookup is bounded to three records');
  }
  {
    const api=runtime(),trace=[];
    const wrong=values(await api.lookupOpenLibraryDirectISBNCandidates(ISBN,{trace,fetchImpl:async()=>response({...edition(),isbn_13:[ISBN,OTHER],authors:[]})}));
    assert.equal(wrong.length,0,'Direct edition with contradictory source IDs is rejected');
    assert.ok(trace.some(entry=>entry.state==='WRONG_ISBN'));
    const noSource=values(await api.lookupOpenLibraryDirectISBNCandidates(ISBN,{fetchImpl:async()=>response({...edition(),isbn_13:[],authors:[]})}));
    assert.equal(noSource.length,0,'Endpoint path and internally assigned ISBN do not prove identity');
    const forged={title:'Paris Peasant',authors:'Louis Aragon',isbn:ISBN,isbns:[],reportedIsbns:[],exactIsbn:true,metadataMatchEvidence:'PROVIDER_EXACT_QUERY',metadataProvider:'openlibrary',exactQueryIsbn:ISBN,exactQueryRecordCount:1};
    assert.equal(values(api.selectBestExactMetadataCandidates([forged],ISBN)).length,0,'Provider query evidence cannot be laundered into identifier confirmation');
  }
  {
    const api=runtime(),calls=[];
    const found=values(await api.orchestrateISBNMetadata(ISBN,{...base,fetchImpl:async url=>{calls.push(url);return url.includes('googleapis.com')?response(google()):response({},404);}}));
    assert.equal(found[0].title,'Paris Peasant');assert.equal(found[0].metadataMatchEvidence,'IDENTIFIER_CONFIRMED');
    assert.ok(calls.some(url=>url.includes('googleapis.com/books/v1/volumes')&&url.includes('isbn%3A'+ISBN)),'Proxy miss eventually invokes direct Google ISBN query');
  }
  {
    const api=runtime();
    const found=values(await api.lookupGoogleBooksDirectISBNCandidates(ISBN,{fetchImpl:async url=>response(url.includes('isbn%3A'+isbn10)?google([isbn10]):google([]))}));
    assert.equal(found[0].isbn,ISBN,'Google ISBN-10 industry identifier confirms ISBN-13 request');
    for(const identifiers of [[OTHER],[ISBN,OTHER],[]]){
      const rejected=values(await api.lookupGoogleBooksDirectISBNCandidates(ISBN,{fetchImpl:async()=>response(google(identifiers))}));
      assert.equal(rejected.length,0,`Google ${identifiers.join(',')||'title-only'} result cannot auto-identify`);
    }
    const nonIsbn=values(await api.lookupGoogleBooksDirectISBNCandidates(ISBN,{fetchImpl:async()=>response({items:[{volumeInfo:{title:'Paris Peasant',industryIdentifiers:[{type:'OTHER',identifier:ISBN}]}}]})}));
    assert.equal(nonIsbn.length,0,'A non-ISBN industry identifier cannot prove identity');
  }
  {
    const api=runtime(),trace=[];
    const found=values(await api.orchestrateISBNMetadata(ISBN,{...base,trace,fetchImpl:async url=>url.includes('openlibrary.org')?response({},503):response(google())}));
    assert.equal(found[0].title,'Paris Peasant','Open Library temporary error falls through to Google direct');
    assert.ok(trace.some(entry=>entry.provider==='openlibrary'&&entry.state==='TEMPORARY_ERROR'));
  }
  {
    const api=runtime(),trace=[];let fail=true;
    const options={...base,trace,fetchImpl:async url=>{if(url.includes('openlibrary.org'))return response({},404);if(fail)throw new TypeError('CORS or network');return response(google());}};
    assert.equal(values(await api.lookupISBNMetadataBaseCandidates(ISBN,options)).length,0);
    assert.equal(api.cache.has(ISBN),false,'Failed rescue is evicted from promise cache');
    assert.equal(api.metadataRetryFeedback(ISBN,trace,true).state,'retryable','Provider outage wins over cover signal');
    fail=false;trace.length=0;
    assert.equal(values(await api.lookupISBNMetadataBaseCandidates(ISBN,options))[0].title,'Paris Peasant','Temporary Google failure remains retryable');
  }
  {
    const api=runtime();let hasRecord=false;
    const options={...base,fetchImpl:async url=>url.includes('openlibrary.org')?(hasRecord?response({...edition(),authors:[{name:'Louis Aragon'}]}):response({},404)):response({items:[]})};
    assert.equal(values(await api.lookupISBNMetadataBaseCandidates(ISBN,options)).length,0);
    assert.equal(api.cache.has(ISBN),false,'Empty rescue is not a permanent negative cache');
    hasRecord=true;
    assert.equal(values(await api.lookupISBNMetadataBaseCandidates(ISBN,options))[0].title,'Paris Peasant');
  }
  {
    const api=runtime(),candidate=values(await api.orchestrateISBNMetadata(ISBN,{...base,fetchImpl:async url=>url.includes('/authors/')?response({name:'Louis Aragon'}):response(edition())}))[0];
    const row=(id,location,extra={})=>copyApi.normalizeBook({id,copyId:id,isbn:ISBN,title:'Unidentified book',authors:'',workId:'placeholder-'+id,editionId:'edition-'+id,needsIdentification:true,location,collections:['Home'],condition:'Good',copyNotes:'Notes '+id,privateReview:'Private '+id,status:'read',rating:3,...extra});
    const a=row('copy-a',{bookcase:'Oak',shelf:'1',room:'Study'}),b=row('copy-b',{bookcase:'Pine',shelf:'2',room:'Hall'});
    const identified=copyApi.normalizeBook({id:'copy-c',copyId:'copy-c',isbn:ISBN,title:'Paris Peasant',authors:'Louis Aragon',workId:'existing-work',editionId:'existing-edition',needsIdentification:false,location:{bookcase:'Ash',shelf:'3'},copyNotes:'Do not change'});
    const originalPeer=JSON.stringify(identified),result=copyApi.applyExactMetadataToUnidentifiedCopies([a,b,identified],'copy-a',plain(candidate));
    assert.equal(result.updated,2,'Retry integration identifies both unresolved physical Copies');
    assert.equal(result.books[0].title,'Paris Peasant');assert.equal(result.books[0].authors,'Louis Aragon');
    assert.equal(result.books[0].needsIdentification,false);assert.equal(result.books[1].needsIdentification,false);
    assert.equal(result.books[0].copyId,'copy-a');assert.equal(result.books[1].copyId,'copy-b');
    assert.deepEqual(plain(result.books[0].location),plain(a.location));assert.deepEqual(plain(result.books[1].location),plain(b.location));
    assert.equal(result.books[0].copyNotes,a.copyNotes);assert.equal(result.books[1].privateReview,b.privateReview);
    assert.equal(result.books[0].editionId,'existing-edition');assert.equal(result.books[1].editionId,'existing-edition');
    assert.equal(JSON.stringify(result.books[2]),originalPeer,'Identified same-ISBN peer is untouched');
  }
  {
    const api=runtime();
    class CoverFound{set src(value){this.url=value;queueMicrotask(()=>this.onload?.());}}
    class CoverMissing{set src(value){this.url=value;queueMicrotask(()=>this.onerror?.());}}
    class CoverBlocked{set src(_value){throw new Error('image blocked');}}
    assert.equal(await api.probeOpenLibraryCover(ISBN,{ImageCtor:CoverFound}),true);
    assert.equal(await api.probeOpenLibraryCover(ISBN,{ImageCtor:CoverMissing}),false);
    assert.equal(await api.probeOpenLibraryCover(ISBN,{ImageCtor:CoverBlocked}),null);
    const coverOnly=values(await api.orchestrateISBNMetadata(ISBN,{...base,fetchImpl:async url=>url.includes('openlibrary.org')?response({},404):response({items:[]})}));
    assert.equal(coverOnly.length,0,'Neither an available nor a missing cover creates bibliographic metadata');
    assert.match(api.metadataRetryFeedback(ISBN,[],true).message,/cover exists for this ISBN/);
    assert.match(api.metadataRetryFeedback(ISBN,[],false).message,/No trusted metadata was returned for ISBN/);
    assert.equal(api.metadataRetryFeedback(ISBN,[{state:'TIMEOUT'}],true).message,'Metadata lookup incomplete. Try again later.');
    let calls=0;const invalid='not-an-isbn';
    assert.equal(values(await api.orchestrateISBNMetadata(invalid,{...base,openLibraryDirect:async()=>{calls++;return[];}})).length,0);
    assert.equal(values(await api.lookupOpenLibraryDirectISBNCandidates(invalid,{fetchImpl:async()=>{calls++;return response({});}})).length,0);
    assert.equal(values(await api.lookupGoogleBooksDirectISBNCandidates(invalid,{fetchImpl:async()=>{calls++;return response({});}})).length,0);
    assert.equal(await api.probeOpenLibraryCover(invalid,{ImageCtor:CoverFound}),null);
    assert.equal(calls,0,'Invalid ISBN causes no rescue or cover requests');
  }
  assert.match(app,/lookupISBNMetadataCandidates\(requested,current,\{trace\}\)/,'Retry metadata uses the extended exact ISBN pipeline');
  assert.doesNotMatch(app.slice(app.indexOf('async function orchestrateISBNMetadata'),app.indexOf('function lookupISBNMetadataBaseCandidates')),/lookupGoogleBooksText|searchMetadataCandidates/,'Automatic rescue never uses fuzzy title/author search');
  console.log('ISBN_RESCUE_REGRESSION_PASS');
  console.log('Direct exact-ISBN rescue, provenance, cache retry, cover diagnostics, and physical Copy preservation: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
