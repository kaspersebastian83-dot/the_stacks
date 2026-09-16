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
const APP_VERSION='3.9.11';
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
const DEFAULT_SETTINGS={theme:'light',defaultStatus:'unread',defaultCollection:'',defaultLocation:{room:'',bookcase:'',shelf:'',box:'',position:''},backupReminderDays:14};
let generatedId=0;
function genId(){return 'generated-'+(++generatedId);}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
`;

const source=runtime+
  slice('function uniq','const FORMAT_OPTIONS')+
  slice('function blankLocation','function locationText')+
  slice('function normalizeSettings','const BACKUP_HEALTH')+
  slice('function catalogPayload','function migrationStringKey')+
  slice('function migrationStringKey','function catalogSchemaIssues')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('function validateNativeBackupCatalog','function migrationBackupInfo')+
  slice('function blankNativeCatalog','function migrationBackupPayload')+
  slice('function migrateCatalogData','function buildImportPreview')+
  slice('function collectionNames','function editorShelfOptions')+
  `;globalThis.api={catalogPayload,validatePortableBackup,normalizeNativeCatalog,nativeCatalogToBookViews,normalizeBook,setBookCollections};`;

const context=vm.createContext({console,Date,Map,Set,Math,Object,JSON});
vm.runInContext(source,context);
const api=context.api;

const fixture={
  modelVersion:'work-edition-copy-v1',createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z',
  works:[
    {id:'work-atlas',title:'Historical Atlas',author:'A. Cartographer',authors:'A. Cartographer',series:'World Histories',seriesNumber:'1',tags:['History','Maps'],notes:'Work-level atlas notes',editionIds:['edition-atlas-hard','edition-atlas-paper'],copyIds:['copy-atlas-a','copy-atlas-b','copy-atlas-paper'],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'},
    {id:'work-novel',title:'Translated Novel',author:'N. Writer',authors:'N. Writer',series:'World Histories',seriesNumber:'2',tags:['Fiction'],notes:'Second work notes',editionIds:['edition-novel'],copyIds:['copy-novel'],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'}
  ],
  editions:[
    {id:'edition-atlas-hard',workId:'work-atlas',title:'Historical Atlas',authors:'A. Cartographer',isbn:'9780306406157',publisher:'Archive Press',year:'2020',language:'English',format:'Hardcover',edition:'First',translators:['T. Translator'],editors:['E. Editor'],pages:'420',cover:'https://example.invalid/atlas-hard.jpg',copyIds:['copy-atlas-a','copy-atlas-b'],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'},
    {id:'edition-atlas-paper',workId:'work-atlas',title:'Historical Atlas',authors:'A. Cartographer',isbn:'9780140449112',publisher:'Archive Press',year:'2022',language:'German',format:'Paperback',edition:'Second',translators:['T. Translator'],editors:['E. Editor'],pages:'430',copyIds:['copy-atlas-paper'],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'},
    {id:'edition-novel',workId:'work-novel',title:'Translated Novel',authors:'N. Writer',isbn:'9780140268867',publisher:'Fiction House',year:'2018',language:'English',format:'Paperback',edition:'First',translators:['Second Translator'],editors:['Novel Editor'],pages:'280',copyIds:['copy-novel'],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'}
  ],
  copies:[
    {id:'copy-atlas-a',copyId:'copy-atlas-a',workId:'work-atlas',editionId:'edition-atlas-hard',sourceBookId:'source-atlas-a',copyNumber:1,collections:['Favorites','History'],tags:['Signed'],location:{room:'Study',bookcase:'A',shelf:'3',box:'2',position:'17'},condition:'Very good',copyNotes:'Signed on title page',status:'read',rating:5,startedAt:'2026-01-02',finishedAt:'2026-01-09',readCount:2,lentTo:'Reader One',lentDate:'2026-02-02',dueDate:'2026-03-02',returnedDate:'',privateReview:'Excellent reference copy',notes:'Copy-specific notes',reviewed:true,addedAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'},
    {id:'copy-atlas-b',copyId:'copy-atlas-b',workId:'work-atlas',editionId:'edition-atlas-hard',sourceBookId:'source-atlas-b',copyNumber:2,collections:['History'],tags:['Reading copy'],location:{room:'Office',bookcase:'B',shelf:'4',box:'',position:'3'},condition:'Good',copyNotes:'Margin notes',status:'reading',rating:3,startedAt:'2026-02-10',finishedAt:'',readCount:0,lentTo:'',lentDate:'',dueDate:'',returnedDate:'2025-12-01',privateReview:'Working copy',notes:'Independent notes',reviewed:false,addedAt:'2026-02-02T00:00:00.000Z',updatedAt:'2026-02-02T00:00:00.000Z'},
    {id:'copy-atlas-paper',copyId:'copy-atlas-paper',workId:'work-atlas',editionId:'edition-atlas-paper',sourceBookId:'source-atlas-paper',copyNumber:1,collections:['History'],tags:['Portable'],location:{room:'Bedroom',bookcase:'C',shelf:'1',box:'',position:'8'},condition:'Acceptable',copyNotes:'Travel edition',status:'unread',rating:0,readCount:0,addedAt:'2026-02-03T00:00:00.000Z',updatedAt:'2026-02-03T00:00:00.000Z'},
    {id:'copy-novel',copyId:'copy-novel',workId:'work-novel',editionId:'edition-novel',sourceBookId:'source-novel',copyNumber:1,collections:['Favorites'],tags:['Translation'],location:{room:'Living room',bookcase:'D',shelf:'2',box:'1',position:'5'},condition:'New',copyNotes:'',status:'want',rating:4,readCount:0,notes:'Novel copy notes',addedAt:'2026-02-04T00:00:00.000Z',updatedAt:'2026-02-04T00:00:00.000Z'}
  ]
};

const sourceBefore=JSON.stringify(fixture);
const normalized=api.normalizeNativeCatalog(fixture);
const normalizedBefore=JSON.stringify(normalized);
const payload=api.catalogPayload([],['Favorites','History'],[{id:'view-history',name:'History',filters:{collection:'History'}}],{theme:'dark',defaultStatus:'reading',defaultCollection:'Favorites',defaultLocation:{room:'Study'},backupReminderDays:30},normalized);
const portable=JSON.parse(JSON.stringify(payload));
const checked=api.validatePortableBackup(portable);

assert.equal(checked.valid,true);
assert.equal(checked.legacy,false);
assert.deepEqual({...checked.stats},{works:2,editions:3,copies:4});
assert.equal(JSON.stringify(fixture),sourceBefore,'Backup creation must not mutate the source fixture');
assert.equal(JSON.stringify(normalized),normalizedBefore,'Backup creation must not mutate the normalized catalog');

const restored=checked.migrated.nativeCatalog;
assert.deepEqual(Array.from(restored.works,work=>work.id).sort(),['work-atlas','work-novel']);
assert.deepEqual(Array.from(restored.editions,edition=>edition.id).sort(),['edition-atlas-hard','edition-atlas-paper','edition-novel']);
assert.deepEqual(Array.from(restored.copies,copy=>copy.id).sort(),['copy-atlas-a','copy-atlas-b','copy-atlas-paper','copy-novel']);
assert.equal(restored.copies.filter(copy=>copy.editionId==='edition-atlas-hard').length,2,'Same-Edition Copies remain distinct');
assert.deepEqual(Array.from(restored.copies.find(copy=>copy.id==='copy-atlas-a').tags),['Signed'],'Exact native Copy tags are preserved');

const restoredViews=api.nativeCatalogToBookViews(restored);
const atlasA=restoredViews.find(book=>book.copyId==='copy-atlas-a');
const atlasB=restoredViews.find(book=>book.copyId==='copy-atlas-b');
const novel=restoredViews.find(book=>book.copyId==='copy-novel');
assert.deepEqual(Array.from(atlasA.collections),['Favorites','History']);
assert.deepEqual({...atlasA.location},{room:'Study',bookcase:'A',shelf:'3',box:'2',position:'17'});
assert.deepEqual(Array.from(atlasA.tags).sort(),['History','Maps','Portable','Reading copy','Signed'],'Compatibility views retain the current Work/Copy tag union');
assert.equal(atlasA.status,'read');assert.equal(atlasA.rating,5);assert.equal(atlasA.readCount,2);
assert.equal(atlasA.lentTo,'Reader One');assert.equal(atlasA.lentDate,'2026-02-02');assert.equal(atlasA.dueDate,'2026-03-02');
assert.equal(atlasA.copyNotes,'Signed on title page');assert.equal(atlasA.notes,'Copy-specific notes');assert.equal(atlasA.privateReview,'Excellent reference copy');
assert.equal(atlasA.series,'World Histories');assert.equal(atlasA.seriesNumber,'1');
assert.deepEqual(Array.from(atlasA.translators),['T. Translator']);assert.deepEqual(Array.from(atlasA.editors),['E. Editor']);
assert.equal(novel.seriesNumber,'2');assert.deepEqual(Array.from(novel.translators),['Second Translator']);
assert.equal(atlasB.copyId,'copy-atlas-b');assert.equal(atlasB.location.room,'Office');assert.equal(atlasB.status,'reading');
assert.deepEqual(Array.from(checked.migrated.collections).sort(),['Favorites','History']);

const independenceSource=api.normalizeBook(atlasA);
const independenceBefore=JSON.stringify(independenceSource);
const relocated=api.normalizeBook({...independenceSource,location:{room:'Archive',bookcase:'Z',shelf:'9',box:'7',position:'21'}});
assert.deepEqual(Array.from(relocated.collections),['Favorites','History'],'Changing location must not change Collections');
assert.equal(relocated.copyNotes,independenceSource.copyNotes);assert.equal(relocated.status,independenceSource.status);assert.equal(relocated.lentTo,independenceSource.lentTo);
const locationBeforeCollectionChange=JSON.stringify(relocated.location);
const recollected=api.normalizeBook(api.setBookCollections(relocated,['Research']));
assert.deepEqual(Array.from(recollected.collections),['Research']);
assert.equal(JSON.stringify(recollected.location),locationBeforeCollectionChange,'Changing Collections must not change physical location');
assert.equal(recollected.copyId,relocated.copyId);assert.equal(recollected.workId,relocated.workId);assert.equal(recollected.editionId,relocated.editionId);assert.equal(recollected.copyNotes,relocated.copyNotes);assert.equal(recollected.status,relocated.status);assert.equal(recollected.rating,relocated.rating);
assert.equal(JSON.stringify(independenceSource),independenceBefore,'Independence checks must not mutate their source Copy');

console.log('BACKUP_ROUNDTRIP_REGRESSION_PASS');
console.log('Portable backup/restore preserves exact Work, Edition, and Copy identity and catalog data: PASS');
console.log('Collection and physical-location independence with non-mutating read paths: PASS');
