#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=require('./load-production-source');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{
  const from=html.indexOf(start),to=html.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Could not extract ${start}`);
  return html.slice(from,to);
};

const runtime=`
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
let generatedId=0;
function genId(){return 'scan-copy-'+(++generatedId);}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const settings={defaultCollection:'',defaultStatus:'unread',defaultLocation:{room:'Intake',bookcase:'',shelf:'',box:'',position:''}};
const booksRef={current:[]};
const nativeCatalogRef={current:null};
let editing=null;
function setEditing(book){editing=book;}
function setBookViews(views){booksRef.current=views;}
function toast(){}
const lookupResults=new Map([
  ['9780140449112',{isbn:'9780140449112',title:'The Odyssey',authors:'Homer',publisher:'Penguin Classics',year:'1996',language:'English',format:'Paperback',metadataSource:'Synthetic catalog'}],
  ['9780306406157',null]
]);
async function lookupBook(isbn){return lookupResults.get(isbn)||null;}
`;

const source=runtime+isbnSource+
  slice('function uniq','const FORMAT_OPTIONS')+
  slice('function blankLocation','function locationText')+
  slice('function migrationStringKey','function catalogSchemaIssues')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('function blankNativeCatalog','function migrationBackupPayload')+
  slice('function collectionNames','function inCollection')+
  slice('function isUnidentifiedTitle','function reviewReasons')+
  slice('function metadataQuality','function normalizeMetadataCandidate')+
  slice('const METADATA_FIELD_DEFS','function identificationTargetIdentity')+
  slice('function isBarcodeDetectorAvailable','function scanStateLabel')+
  slice('function insertScannedBook','function currentCatalogPayload')+
  slice('async function processScan','async function processEasyScan')+
  `;nativeCatalogRef.current=blankNativeCatalog();globalThis.api={processScan,applyMetadataToBook,selectCameraDecoder,createNativeBarcodeDetector,cameraBarcodeFrame,getBooks:()=>booksRef.current,getEditing:()=>editing,resetCatalog:()=>{booksRef.current=[];nativeCatalogRef.current=blankNativeCatalog();editing=null;}};`;

const context=vm.createContext({console,Date,Map,Set,Math,Object,window:{}});
vm.runInContext(source,context);
const api=context.api;

(async()=>{
  context.window.BarcodeDetector=class SyntheticBarcodeDetector{};
  assert.ok(api.createNativeBarcodeDetector() instanceof context.window.BarcodeDetector);
  assert.equal(api.selectCameraDecoder(true,true),'native','Usable native BarcodeDetector is preferred');
  delete context.window.BarcodeDetector;
  assert.equal(api.selectCameraDecoder(false,false),'zxing','Missing native BarcodeDetector selects the ZXing fallback');
  context.window.BarcodeDetector=class FailingBarcodeDetector{constructor(){throw new Error('unsupported');}};
  assert.equal(api.createNativeBarcodeDetector(),null,'A recoverable native initialization failure is detected');
  assert.equal(api.selectCameraDecoder(true,false),'zxing','Native initialization failure selects the ZXing fallback');

  const cameraFrames=new Map();
  const accepted=[];
  const frame=async(value,now)=>{const result=api.cameraBarcodeFrame(cameraFrames,value,now);if(!result.accepted)return null;accepted.push(result.code);return api.processScan(result.code,{quiet:true,silentReview:true});};
  assert.equal((await frame('9780140449112',1000)).state,'added');
  assert.equal(await frame('9780140449112',1100),null);
  assert.equal(await frame('9780140449112',1500),null,'Consecutive frames do not create duplicate scans');
  assert.equal(api.getBooks().length,1,'One continuously visible barcode enters processScan once');
  assert.equal(accepted.length,1,'One continuously visible barcode emits one scan event');
  await frame('',2801);
  assert.equal((await frame('9780140449112',2802)).state,'copy','Released barcode can enter processScan again');
  assert.equal((await frame('9780306406157',2850)).state,'review','A different barcode is accepted immediately');
  const beforeInvalidCameraScan=JSON.stringify(api.getBooks());
  assert.equal((await frame('9780140449113',2900)).state,'invalid','Invalid decoded ISBN is rejected by processScan');
  assert.equal(JSON.stringify(api.getBooks()),beforeInvalidCameraScan,'Invalid decoded ISBN does not mutate the catalog');
  assert.deepEqual(accepted,['9780140449112','9780140449112','9780306406157','9780140449113']);
  api.resetCatalog();

  const validIsbn='9780140449112';
  const firstResult=await api.processScan(validIsbn,{quiet:true});
  assert.equal(firstResult.state,'added');
  assert.equal(api.getBooks().length,1);
  const firstCopy=api.getBooks()[0];
  const firstSnapshot=JSON.stringify(firstCopy);
  assert.equal(firstCopy.isbn,validIsbn);
  assert.equal(firstCopy.title,'The Odyssey');
  assert.equal(firstCopy.needsIdentification,false);

  const secondResult=await api.processScan(validIsbn,{quiet:true});
  assert.equal(secondResult.state,'copy');
  assert.equal(api.getBooks().length,2);
  const secondCopy=secondResult.book;
  assert.notEqual(secondCopy.copyId,firstCopy.copyId);
  assert.equal(secondCopy.workId,firstCopy.workId,'Repeated ISBN retains Work identity');
  assert.equal(secondCopy.editionId,firstCopy.editionId,'Repeated ISBN retains Edition identity');
  assert.equal(JSON.stringify(api.getBooks().find(book=>book.copyId===firstCopy.copyId)),firstSnapshot,'Second scan must not overwrite the first Copy');

  const thirdResult=await api.processScan(validIsbn,{quiet:true});
  assert.equal(thirdResult.state,'copy');
  const legitimateCopies=api.getBooks().filter(book=>book.isbn===validIsbn);
  assert.equal(legitimateCopies.length,3);
  assert.equal(new Set(legitimateCopies.map(book=>book.copyId)).size,3,'Three scans produce three distinct Copy IDs');
  assert.equal(new Set(legitimateCopies.map(book=>book.workId)).size,1);
  assert.equal(new Set(legitimateCopies.map(book=>book.editionId)).size,1);
  assert.equal(JSON.stringify(legitimateCopies.find(book=>book.copyId===firstCopy.copyId)),firstSnapshot,'Third scan must not overwrite the first Copy');

  const beforeInvalid=JSON.stringify(api.getBooks());
  const invalidResult=await api.processScan('9780140449113',{quiet:true});
  assert.equal(invalidResult.state,'invalid');
  assert.equal(JSON.stringify(api.getBooks()),beforeInvalid,'Invalid ISBN must leave the catalog unchanged');

  const unidentifiedResult=await api.processScan('9780306406157',{quiet:true,silentReview:true});
  assert.equal(unidentifiedResult.state,'review');
  assert.equal(unidentifiedResult.book.needsIdentification,true);
  assert.equal(unidentifiedResult.book.title,'Unidentified book');
  assert.equal(unidentifiedResult.book.isbn,'9780306406157');
  assert.equal(api.getEditing(),null,'Silent deterministic scan does not open UI state');

  const unidentifiedBefore=JSON.stringify(unidentifiedResult.book);
  const identified=api.applyMetadataToBook(unidentifiedResult.book,{title:'Theoretical Physics',authors:'A. Researcher',metadataSource:'Synthetic identification'},['title','authors'],'selected');
  assert.equal(identified.needsIdentification,false,'Usable title and author resolve Needs Identification');
  assert.equal(identified.copyId,unidentifiedResult.book.copyId);
  assert.equal(identified.workId,unidentifiedResult.book.workId);
  assert.equal(identified.editionId,unidentifiedResult.book.editionId);
  assert.equal(JSON.stringify(unidentifiedResult.book),unidentifiedBefore,'Identification normalization must not mutate the source Copy');

  console.log('SCAN_REGRESSION_PASS');
  console.log('Native decoder selection, ZXing fallback selection, and recoverable native initialization: PASS');
  console.log('Continuous-frame suppression, release/rescan, and different-code acceptance: PASS');
  console.log('Repeated valid ISBN scans create independent Copies with stable Work and Edition identity: PASS');
  console.log('Invalid ISBN and Needs Identification lifecycle: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
