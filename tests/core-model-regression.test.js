#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','the_stacks_v3_3_native_wec.html'),'utf8');
const slice=(start,end)=>{
  const from=html.indexOf(start),to=html.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Could not extract ${start}`);
  return html.slice(from,to);
};

const runtime=`
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
let generatedId=0;
function genId(){return 'generated-'+(++generatedId);}
function migrationWorkKey(book){return String(book?.workId||book?.title||'work');}
function migrationEditionKey(book){return String(book?.editionId||book?.isbn||book?.title||'edition');}
function plannedCopyCount(book){return Math.max(1,Number(book?.copyCount)||1);}
`;

const source=runtime+
  slice('function uniq','const FORMAT_OPTIONS')+
  slice('function blankLocation','function locationText')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('function validateNativeBackupCatalog','function validatePortableBackup')+
  slice('function blankNativeCatalog','function migrationBackupPayload')+
  slice('function collectionNames','function inCollection')+
  `;globalThis.api={validateNativeBackupCatalog,normalizeNativeCatalog,nativeCatalogFromBookViews,nativeCatalogToBookViews};`;

const context=vm.createContext({console,Date,Map,Set,Math});
vm.runInContext(source,context);
const api=context.api;

const fixture={
  modelVersion:'work-edition-copy-v1',
  createdAt:'2026-01-01T00:00:00.000Z',
  updatedAt:'2026-01-01T00:00:00.000Z',
  works:[{
    id:'work-odyssey',title:'The Odyssey',author:'Homer',authors:'Homer',
    editionIds:['edition-hardcover','edition-paperback'],
    copyIds:['copy-hardcover-a','copy-hardcover-b','copy-paperback-a'],
    tags:['Classics'],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'
  }],
  editions:[
    {id:'edition-hardcover',workId:'work-odyssey',title:'The Odyssey',authors:'Homer',isbn:'9780140449112',format:'Hardcover',edition:'First',copyIds:['copy-hardcover-a','copy-hardcover-b'],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'},
    {id:'edition-paperback',workId:'work-odyssey',title:'The Odyssey',authors:'Homer',isbn:'9780140268867',format:'Paperback',edition:'Second',copyIds:['copy-paperback-a'],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
  ],
  copies:[
    {id:'copy-hardcover-a',copyId:'copy-hardcover-a',workId:'work-odyssey',editionId:'edition-hardcover',sourceBookId:'source-hardcover-a',copyNumber:1,condition:'Very good',copyNotes:'Signed copy',status:'read',rating:5,location:{room:'Study',bookcase:'A',shelf:'1',box:'',position:'1'},collections:['Classics'],tags:['Owned']},
    {id:'copy-hardcover-b',copyId:'copy-hardcover-b',workId:'work-odyssey',editionId:'edition-hardcover',sourceBookId:'source-hardcover-b',copyNumber:2,condition:'Good',copyNotes:'Reading copy',status:'reading',rating:3,location:{room:'Bedroom',bookcase:'B',shelf:'2',box:'',position:'4'},collections:['Favorites'],tags:['Loanable']},
    {id:'copy-paperback-a',copyId:'copy-paperback-a',workId:'work-odyssey',editionId:'edition-paperback',sourceBookId:'source-paperback-a',copyNumber:1,condition:'Acceptable',copyNotes:'Travel copy',status:'unread',rating:0,location:{room:'Office',bookcase:'C',shelf:'3',box:'',position:'2'},collections:['Classics'],tags:['Travel']}
  ]
};

const fixtureBefore=JSON.stringify(fixture);
const validation=api.validateNativeBackupCatalog(fixture);
assert.equal(validation.valid,true);
assert.deepEqual({...validation.stats},{works:1,editions:2,copies:3});
assert.equal(JSON.stringify(fixture),fixtureBefore,'Validation must not mutate fixture data');

const normalized=api.normalizeNativeCatalog(fixture);
assert.equal(normalized.works.length,1);
assert.equal(normalized.editions.length,2,'One Work retains both Editions');
assert.equal(normalized.copies.length,3,'All physical Copies remain present');
assert.deepEqual(Array.from(normalized.works[0].editionIds).sort(),['edition-hardcover','edition-paperback']);
assert.deepEqual(Array.from(normalized.works[0].copyIds).sort(),['copy-hardcover-a','copy-hardcover-b','copy-paperback-a']);
assert.equal(normalized.editions.filter(edition=>edition.workId==='work-odyssey').length,2);
assert.equal(normalized.copies.filter(copy=>copy.editionId==='edition-hardcover').length,2,'One Edition retains two physical Copies');
assert.equal(new Set(normalized.copies.map(copy=>copy.id)).size,normalized.copies.length,'Every physical Copy ID is unique');
assert.equal(JSON.stringify(fixture),fixtureBefore,'Normalization must not mutate fixture data');

const views=api.nativeCatalogToBookViews(normalized);
const viewsBefore=JSON.stringify(views);
const first=views.find(book=>book.copyId==='copy-hardcover-a');
const sibling=views.find(book=>book.copyId==='copy-hardcover-b');
assert.ok(first&&sibling);
assert.equal(first.editionId,sibling.editionId);
assert.notStrictEqual(first,sibling,'Copies of one Edition must be independent objects');
assert.notStrictEqual(first.location,sibling.location,'Copies must not share a mutable location object');

const editedViews=views.map(book=>book.copyId==='copy-hardcover-a'?{
  ...book,condition:'Damaged',copyNotes:'Rebound after water damage',status:'dnf',rating:1,
  location:{...book.location,room:'Conservation',bookcase:'Repair'}
}:book);
const rebuilt=api.nativeCatalogFromBookViews(editedViews,normalized);
const rebuiltViews=api.nativeCatalogToBookViews(rebuilt);
const edited=rebuiltViews.find(book=>book.copyId==='copy-hardcover-a');
const untouched=rebuiltViews.find(book=>book.copyId==='copy-hardcover-b');

assert.equal(edited.condition,'Damaged');
assert.equal(edited.copyNotes,'Rebound after water damage');
assert.equal(edited.status,'dnf');
assert.equal(edited.location.room,'Conservation');
assert.equal(untouched.condition,'Good','Editing one Copy must not change its sibling condition');
assert.equal(untouched.copyNotes,'Reading copy','Editing one Copy must not change its sibling notes');
assert.equal(untouched.status,'reading','Editing one Copy must not change its sibling reading state');
assert.equal(untouched.location.room,'Bedroom','Editing one Copy must not change its sibling location');
assert.equal(untouched.editionId,'edition-hardcover');
assert.equal(edited.workId,'work-odyssey');
assert.equal(new Set(rebuiltViews.map(book=>book.copyId)).size,3,'Roundtrip must preserve unique Copy IDs');
assert.equal(JSON.stringify(views),viewsBefore,'Catalog conversion and rebuild must not mutate input views');

const duplicateCopyFixture={...fixture,copies:[...fixture.copies,{...fixture.copies[0]}]};
const duplicateValidation=api.validateNativeBackupCatalog(duplicateCopyFixture);
assert.equal(duplicateValidation.valid,false);
assert.ok(duplicateValidation.issues.includes('Duplicate copy ID: copy-hardcover-a'));

console.log('CORE_MODEL_REGRESSION_PASS');
console.log('Work → Edition → Copy identity and multi-Edition/multi-Copy relationships: PASS');
console.log('Unique Copy IDs, Copy independence, and non-mutating read paths: PASS');
