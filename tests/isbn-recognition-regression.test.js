#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const isbnSource=require('./load-production-isbn-source');
const app=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
const slice=(start,end)=>{const from=app.indexOf(start),to=app.indexOf(end,from);assert.ok(from>=0&&to>from,`Missing production slice: ${start}`);return app.slice(from,to);};
const ISBN='9780306406157',ISBN10='0306406152',OTHER='9780140449112';
const helperSource=`
function uniq(items){return [...new Set((items||[]).map(value=>String(value||'').trim()).filter(Boolean))];}
function normalizePersonList(value){return uniq(Array.isArray(value)?value:String(value||'').split(/[;\\n]+/));}
function normalizeOriginalPublicationYear(value){return String(value||'').trim();}
function structuredOriginalPublicationYear(value){return String(value||'').match(/\\d{4}/)?.[0]||'';}
function normalizeSeriesText(value){return String(value||'').trim();}
function normalizeSeriesNumber(value){return String(value||'').trim();}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function coverUrlFromISBN(value){return 'cover:'+value;}
`;
const source=isbnSource+helperSource+
  slice('const METADATA_REQUEST_TIMEOUT_MS','async function lookupGoogleBooksText')+
  slice('function openLibraryDocToMeta','async function lookupOpenLibrarySearchCandidates')+
  `globalThis.api={normalizeISBN,toISBN13,isbnVariants,buildDnbSruUrl,buildLcProxyUrl,parseMarcBibliographicRecord,parseSruMarcResponse,selectBestExactMetadataCandidates,reconcileExactMetadataCandidates,metadataQuality,hasUsableMetadata,lookupOpenLibraryISBNCandidates,lookupGoogleBooksISBNCandidates,lookupDnbByIsbn,lookupLibraryOfCongressByIsbn,orchestrateISBNMetadata,lookupISBNMetadataBaseCandidates,lookupBook,cache:ISBN_METADATA_PROMISE_CACHE};`;
function runtime(fetchImpl=async()=>({ok:true,status:200,json:async()=>({}),text:async()=>'{"records":[]}'})){
  const context=vm.createContext({fetch:fetchImpl,console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Map,Set,Math,Object,SyntaxError});
  vm.runInContext(source,context);
  return{api:context.api,context};
}
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)});
const exact=(overrides={})=>({title:'Synthetic Book',authors:'Example Author',isbn:ISBN,isbns:[ISBN],metadataProvider:'openlibrary',metadataSource:'Open Library',...overrides});
const values=result=>Array.from(result||[]);
function nationalRuntime(fetchImpl){
  const result=runtime(fetchImpl);
  // The network fixture replaces only XML decoding; selection and provenance remain production code.
  vm.runInContext(`parseSruMarcResponse=(text,provider)=>JSON.parse(text).records.map(record=>({...record,metadataProvider:provider,metadataSource:provider==='dnb'?'DNB':'LOC'}));`,result.context);
  return result;
}
function fakeMarc(fields){
  const sub=(code,textContent)=>({getAttribute:name=>name==='code'?code:null,textContent});
  const field=([tag,parts,ind2])=>({getAttribute:name=>name==='tag'?tag:name==='ind2'?ind2:null,getElementsByTagNameNS:(_,name)=>name==='subfield'?parts.map(([code,text])=>sub(code,text)):[]});
  const datafields=(fields.data||[]).map(field);
  const controlfields=(fields.control||[]).map(([tag,textContent])=>({getAttribute:name=>name==='tag'?tag:null,textContent}));
  return{getElementsByTagNameNS:(_,name)=>name==='datafield'?datafields:name==='controlfield'?controlfields:[]};
}

(async()=>{
  assert.equal(runtime().api.toISBN13(ISBN10),ISBN,'ISBN-10 and ISBN-13 retain one canonical Edition identifier');
  assert.deepEqual(values(runtime().api.isbnVariants(ISBN)),[ISBN,ISBN10]);
  assert.deepEqual(values(runtime().api.isbnVariants('9791090636071')),[ '9791090636071' ],'979 does not trigger a duplicate ISBN-10 request');
  const api=runtime().api;
  assert.match(api.buildDnbSruUrl(ISBN10),/0306406152/,'DNB URL preserves queried ISBN-10 form');
  assert.match(api.buildLcProxyUrl(ISBN10),/0306406152/,'LOC proxy URL preserves queried ISBN-10 form');

  const olBook=(identifier,title='Synthetic Book')=>({title,authors:[{name:'Example Author'}],identifiers:{isbn_13:identifier.length===13?[identifier]:[],isbn_10:identifier.length===10?[identifier]:[]}});
  {
    const seen=[];const {api}=runtime(async url=>{seen.push(url);return response(url.includes('bibkeys=ISBN:'+ISBN)?{['ISBN:'+ISBN]:olBook(ISBN)}:{});});
    const found=values(await api.lookupOpenLibraryISBNCandidates(ISBN,{retryDelayMs:0}));
    assert.equal(found[0].metadataMatchEvidence,'IDENTIFIER_CONFIRMED','Open Library ISBN-13 exact success');
    assert.equal(seen.length,1);
  }
  {
    const seen=[];const {api}=runtime(async url=>{seen.push(url);return response(url.includes('bibkeys=ISBN:'+ISBN10)?{['ISBN:'+ISBN10]:olBook(ISBN10)}:{});});
    const found=values(await api.lookupOpenLibraryISBNCandidates(ISBN,{retryDelayMs:0}));
    assert.equal(found[0].isbn,ISBN,'Open Library ISBN-10 rescue normalizes to ISBN-13');
    assert.ok(seen.some(url=>url.includes(ISBN10)));
  }
  {
    const {api}=runtime(async url=>response(url.includes('google-books')?{items:[{volumeInfo:{title:'Google Exact',authors:['Example Author'],industryIdentifiers:[{identifier:ISBN}]}}]}:{}));
    const result=values(await api.orchestrateISBNMetadata(ISBN,{openLibrary:async()=>[],nationalLibraries:[],fastComplementWaitMs:0}));
    assert.equal(result[0].title,'Google Exact','Google exact success after Open Library miss');
  }
  {
    const calls=[];const {api}=nationalRuntime(async url=>{calls.push(url);return response({records:url.includes(ISBN10)?[]:[{title:'DNB Print',authors:'Author',isbn:ISBN,isbns:[ISBN],isPhysical:true}]});});
    const result=values(await api.lookupDnbByIsbn(ISBN));
    assert.equal(result[0].title,'DNB Print','DNB ISBN-13 succeeds');
    assert.equal(calls.length,2,'National lookup queries both meaningful forms once');
  }
  {
    const calls=[];const trace=[];const {api}=nationalRuntime(async url=>{calls.push(url);return response({records:url.includes(ISBN10)?[{title:'DNB ISBN-10 rescue',authors:'Author',isbn:ISBN10,isbns:[ISBN10]}]:[]});});
    const result=values(await api.lookupDnbByIsbn(ISBN,{trace}));
    assert.equal(result[0].isbn,ISBN,'DNB ISBN-10-only rescue is canonicalized');
    assert.deepEqual(trace.map(entry=>entry.state),['NO_RECORD','FOUND']);
    assert.equal(calls.length,2);
  }
  {
    const calls=[];const {api}=nationalRuntime(async url=>{calls.push(url);return response({records:url.includes('loc-proxy')?[{title:'LOC Rescue',authors:'Author',isbn:ISBN,isbns:[ISBN]}]:[]});});
    const result=values(await api.orchestrateISBNMetadata(ISBN,{openLibrary:async()=>[],google:async()=>[],fastComplementWaitMs:0}));
    assert.equal(result[0].title,'LOC Rescue','LOC succeeds after DNB miss');
    assert.ok(calls.some(url=>url.includes('services.dnb.de'))&&calls.some(url=>url.includes('loc-proxy')));
  }
  {
    const {api}=nationalRuntime(async()=>response({records:[{title:'  Trusted  Record / ',authors:'Author',publisher:'Publisher',isbns:[],isbn:''}]}));
    const found=values(await api.lookupDnbByIsbn(ISBN));
    assert.equal(found[0].title,'Trusted Record','Single trusted exact-query record without 020 may be accepted');
    assert.equal(found[0].metadataMatchEvidence,'PROVIDER_EXACT_QUERY');
  }
  {
    const {api}=nationalRuntime(async()=>response({records:[{title:'Wrong Record',authors:'Author',isbn:OTHER,isbns:[OTHER]}]}));
    assert.equal(values(await api.lookupDnbByIsbn(ISBN)).length,0,'Contradictory valid 020 rejects exact-query inference');
  }
  {
    const trace=[];const {api}=nationalRuntime(async url=>response({records:url.includes(ISBN10)?[{title:'Another Record',authors:'Other',isbn:OTHER,isbns:[OTHER]}]:[{title:'Unnumbered Record',authors:'Author',isbn:'',isbns:[]}]}));
    assert.equal(values(await api.lookupDnbByIsbn(ISBN,{trace})).length,0,'Contradictory ISBN in equivalent query invalidates a no-020 inference');
    assert.ok(trace.some(entry=>entry.strategy==='variant-reconciliation'&&entry.state==='WRONG_ISBN'));
  }
  {
    const {api}=runtime(async()=>response({items:[{volumeInfo:{title:'Plausible Wrong Book',industryIdentifiers:[{identifier:OTHER}]}}]}));
    assert.equal(values(await api.lookupGoogleBooksISBNCandidates(ISBN)).length,0,'Wrong Google ISBN rejected');
  }
  {
    const result=values(api.selectBestExactMetadataCandidates([exact({title:'Matching'}),exact({title:'Wrong',isbn:OTHER,isbns:[OTHER]})],ISBN));
    assert.equal(result.length,1,'Only exact candidate retained from mixed results');
    assert.equal(result[0].title,'Matching');
    assert.equal(values(api.selectBestExactMetadataCandidates([exact({isbn:'',isbns:[],metadataMatchEvidence:'PROVIDER_EXACT_QUERY',metadataProvider:'google',exactQueryIsbn:ISBN,exactQueryRecordCount:1})],ISBN)).length,0,'Broad/nontrusted query cannot self-assert exact evidence');
    assert.equal(values(api.selectBestExactMetadataCandidates([exact({isbn:'',isbns:[],metadataMatchEvidence:'PROVIDER_EXACT_QUERY',metadataProvider:'dnb',exactQueryIsbn:ISBN,exactQueryRecordCount:2})],ISBN)).length,0,'Multiple no-020 records cannot use provider evidence');
    assert.equal(values(api.selectBestExactMetadataCandidates([exact({isbn:'',isbns:[],authors:'',publisher:'',year:'',metadataMatchEvidence:'PROVIDER_EXACT_QUERY',metadataProvider:'dnb',exactQueryIsbn:ISBN,exactQueryRecordCount:1})],ISBN)).length,0,'A bare title is insufficient for no-020 provider evidence');
  }
  {
    const sparse=values(api.selectBestExactMetadataCandidates([exact({authors:'',publisher:'',year:''})],ISBN))[0];
    assert.equal(api.hasUsableMetadata(sparse),true,'Exact sparse title still identifies');
    assert.equal(api.metadataQuality(sparse),3,'Richness is separate from match confidence');
    assert.equal(api.hasUsableMetadata(null),false,'Empty metadata stays unidentified');
    assert.equal(values(api.selectBestExactMetadataCandidates([exact({title:'Unidentified book'})],ISBN)).length,0);
  }
  {
    const trace=[];const {api}=runtime(async url=>url.includes('openlibrary.org')?response({},503):response({items:[{volumeInfo:{title:'Google Fallback',authors:['Author'],industryIdentifiers:[{identifier:ISBN}]}}]}));
    const result=values(await api.orchestrateISBNMetadata(ISBN,{trace,retryDelayMs:0,fastComplementWaitMs:0}));
    assert.equal(result[0].title,'Google Fallback','Transient OL failure falls through');
    assert.ok(trace.some(entry=>entry.provider==='openlibrary'&&entry.state==='TEMPORARY_ERROR'));
  }
  {
    const trace=[];const {api}=runtime(async url=>url.includes('google-books')?response({},429):response({}));
    const result=values(await api.orchestrateISBNMetadata(ISBN,{trace,retryDelayMs:0,nationalLibraries:[async()=>[exact({metadataProvider:'dnb',metadataSource:'DNB'})]],fastComplementWaitMs:0}));
    assert.equal(result[0].metadataProvider,'dnb','Rate-limited Google falls through to national rescue');
    assert.ok(trace.some(entry=>entry.provider==='google'&&entry.state==='RATE_LIMITED'));
  }
  {
    const trace=[];const {api}=runtime();
    const failure=async()=>{throw new Error('offline')};
    assert.equal(values(await api.orchestrateISBNMetadata(ISBN,{openLibrary:failure,google:failure,nationalLibraries:[failure,failure],trace})).length,0,'All transient failures never fabricate metadata');
    assert.equal(trace.length,4);
    assert.ok(trace.every(entry=>entry.state==='TEMPORARY_ERROR'));
  }
  {
    let attempts=0;const {api}=runtime();
    const providers={openLibrary:async()=>{attempts++;if(attempts===1)throw new Error('temporary outage');return[exact()]},google:async()=>[],nationalLibraries:[],fastComplementWaitMs:0};
    assert.equal(values(await api.lookupISBNMetadataBaseCandidates(ISBN,providers)).length,0);
    assert.equal(api.cache.has(ISBN),false,'Empty lookup is evicted from promise cache');
    assert.equal(values(await api.lookupISBNMetadataBaseCandidates(ISBN,providers)).length,1,'Second lookup retries after empty result');
    assert.equal(attempts,2);
  }
  {
    const primary=exact({title:'Shared Title',cover:'cover',publisher:'',year:'',format:'Print book',isPhysical:true});
    const complementary=exact({title:'Shared Title',cover:'',publisher:'Publisher',year:'1985',format:'Print book',isPhysical:true,metadataProvider:'dnb',metadataSource:'DNB'});
    const merged=values(api.reconcileExactMetadataCandidates([primary,complementary],ISBN))[0];
    assert.equal(merged.publisher,'Publisher','Missing field can be filled from consistent exact record');
    assert.equal(merged.cover,'cover','Existing primary value is not overwritten');
    assert.deepEqual(values(merged.metadataContributingSources),['DNB','Open Library']);
    const conflict=values(api.reconcileExactMetadataCandidates([primary,{...complementary,title:'Different Edition'}],ISBN))[0];
    assert.equal(conflict.cover,'','Different edition/title is not merged');
    const physical=values(api.selectBestExactMetadataCandidates([exact({format:'E-book',isPhysical:false}),exact({format:'Print book',isPhysical:true,metadataProvider:'dnb'})],ISBN));
    assert.equal(physical[0].format,'Print book','Physical manifestation takes precedence');
  }
  {
    const record=fakeMarc({data:[['245',[['a','  A  title : '],['b',' A subtitle / ']]],['100',[['a','Writer, Example.'],['4','aut']]],['700',[['a','Translator, Example.'],['4','trl']]],['700',[['a','Editor, Example.'],['4','edt']]],['020',[['a',ISBN]]],['264',[['b','Publisher :'],['c','©1985']], '1'],['338',[['a','volume']]]],control:[['001','record-1']]});
    const parsed=api.parseMarcBibliographicRecord(record,{provider:'dnb',label:'DNB'});
    assert.equal(parsed.title,'A title: A subtitle','MARC punctuation and duplicate whitespace cleaned without losing subtitle');
    assert.equal(parsed.authors,'Writer, Example');
    assert.deepEqual(values(parsed.translators),['Translator, Example']);
    assert.deepEqual(values(parsed.editors),['Editor, Example']);
    assert.equal(parsed.isPhysical,true);
  }
  // Existing scan/core/location suites exercise shared intake, local Copy rescue, distinct IDs, and location persistence.
  assert.match(app,/async function processScan\(raw,options=\{\}\)/);
  assert.match(app,/const existing=booksRef\.current\.find\(b=>normalizeISBN\(b\.isbn\)/);
  assert.match(app,/async function processEasyScan\(raw,session\)\{return processScan\(/);
  console.log('ISBN_RECOGNITION_REGRESSION_PASS');
  console.log('Exact ISBN variants, provider evidence, rescue, reconciliation, failure trace, cache, and MARC cleanup: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
