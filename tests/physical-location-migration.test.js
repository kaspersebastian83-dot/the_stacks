#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./load-production-source');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,`Could not extract ${start}`);return source.slice(from,to);};
const runtime=`
const APP_VERSION='test';const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
const DEFAULT_SETTINGS={theme:'light',defaultStatus:'unread',defaultCollection:'',defaultLocation:{room:'',bookcase:'',shelf:'',box:'',position:''},backupReminderDays:14};
let generatedId=0;function genId(){return 'generated-'+(++generatedId);}function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
`;
const code=runtime+isbnSource+slice('function uniq','const FORMAT_OPTIONS')+slice('function blankLocation','function PhysicalLocation')+slice('function normalizeSettings','const BACKUP_HEALTH')+slice('function catalogPayload','function migrationStringKey')+slice('function migrationStringKey','function catalogSchemaIssues')+slice('function v3StableId','function buildV3CatalogModel')+slice('function validateNativeBackupCatalog','function migrationBackupInfo')+slice('function blankNativeCatalog','function migrationBackupPayload')+slice('function backfillNativeCopyLocations','function buildImportPreview')+slice('function collectionNames','function editorShelfOptions')+slice('function hasMissingLocation','function normalizedTitle')+slice('function sameLocation','function parseCSV')+slice('function compareNaturalLocationValue','function physicalLocationSortEntry')+slice('function buildBookcaseNavigationIndex','function LibraryBrowseTabs')+';globalThis.api={migrateCatalogData,hasMissingLocation,hasMoveDestination,buildBookcaseNavigationIndex};';
const context=vm.createContext({console,Date,Map,Set,Math,Object,JSON});vm.runInContext(code,context);const api=context.api;

const native={modelVersion:'work-edition-copy-v1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',works:[{id:'work-a',title:'Fixture Work',author:'Fixture Author',authors:'Fixture Author',editionIds:['edition-a'],copyIds:['copy-a','copy-b'],tags:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}],editions:[{id:'edition-a',workId:'work-a',title:'Fixture Edition',authors:'Fixture Author',copyIds:['copy-a','copy-b'],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}],copies:[
 {id:'copy-a',copyId:'copy-a',workId:'work-a',editionId:'edition-a',sourceBookId:'legacy-a',location:{room:'Keep room',bookcase:'Keep case',shelf:'Keep shelf',box:'Keep box',position:'Keep pos'},collections:['Penguin Classics'],updatedAt:'2026-01-01T00:00:00.000Z'},
 {id:'copy-b',copyId:'copy-b',workId:'work-a',editionId:'edition-a',sourceBookId:'legacy-b',location:{room:'',bookcase:'Native case',shelf:'',box:'',position:''},collections:[],updatedAt:'2026-01-02T00:00:00.000Z'},
 {id:'copy-c',copyId:'copy-c',workId:'work-a',editionId:'edition-a',sourceBookId:'',location:{room:'',bookcase:'',shelf:'',box:'',position:''},collections:[],updatedAt:'2026-01-03T00:00:00.000Z'}
]};
const compatibilityBooks=[
 {id:'legacy-a',copyId:'copy-a',workId:'work-a',editionId:'edition-a',title:'Fixture Edition',authors:'Fixture Author',location:{room:'Old room',bookcase:'Old case',shelf:'Old shelf',box:'Old box',position:'Old pos'},collections:['Penguin Classics']},
 {id:'legacy-b',copyId:'copy-b',workId:'work-a',editionId:'edition-a',title:'Fixture Edition',authors:'Fixture Author',location:{room:'Office',bookcase:'Older case',shelf:'Shelf 4',box:'Box 2',position:'9'},collections:[]}
];
const raw={catalog:native,books:compatibilityBooks,collections:['Penguin Classics'],settings:{}};
const inputBefore=JSON.stringify(raw);const migrated=api.migrateCatalogData(raw),copies=new Map(migrated.nativeCatalog.copies.map(copy=>[copy.id,copy]));
assert.equal(JSON.stringify(raw),inputBefore,'load/backfill does not mutate persisted fixture data');
assert.deepEqual({...copies.get('copy-a').location},{room:'Keep room',bookcase:'Keep case',shelf:'Keep shelf',box:'Keep box',position:'Keep pos'},'complete native locations are preserved exactly');
assert.deepEqual({...copies.get('copy-b').location},{room:'Office',bookcase:'Native case',shelf:'Shelf 4',box:'Box 2',position:'9'},'only missing native fields are filled from the exact associated compatibility Book');
assert.deepEqual({...copies.get('copy-c').location},{room:'',bookcase:'',shelf:'',box:'',position:''},'unmatched native Copy remains untouched');
assert.equal(copies.size,3,'migration never creates Copies');assert.deepEqual(Array.from(migrated.nativeCatalog.works,x=>x.id),['work-a']);assert.deepEqual(Array.from(migrated.nativeCatalog.editions,x=>x.id),['edition-a']);
assert.equal(copies.get('copy-a').updatedAt,'2026-01-01T00:00:00.000Z');assert.equal(copies.get('copy-b').updatedAt,'2026-01-02T00:00:00.000Z');
const repeated=api.migrateCatalogData({...raw,catalog:migrated.nativeCatalog,books:migrated.books});
assert.deepEqual({...repeated.nativeCatalog.copies.find(copy=>copy.id==='copy-b').location},{...copies.get('copy-b').location},'repeated migration is idempotent');
assert.equal(repeated.nativeCatalog.copies.length,3);assert.deepEqual(Array.from(repeated.nativeCatalog.copies,copy=>copy.id).sort(),['copy-a','copy-b','copy-c']);
const ambiguous={...native,copies:[{...native.copies[2],id:'copy-x',sourceBookId:'legacy-shared'},{...native.copies[2],id:'copy-y',sourceBookId:'legacy-shared'}]};
const ambiguousResult=api.migrateCatalogData({catalog:ambiguous,books:[{id:'legacy-shared',copyId:'legacy-shared-copy',editionId:'edition-a',location:{bookcase:'Guess',shelf:'1'}}]});
assert.ok(Array.from(ambiguousResult.nativeCatalog.copies).filter(copy=>['copy-x','copy-y'].includes(copy.id)).every(copy=>!copy.location.bookcase),'ambiguous associated Book IDs do not fabricate a location');

const has=location=>api.hasMissingLocation({location});
assert.equal(has({room:'',bookcase:'Bookcase 2',shelf:'4'}),false,'Room is optional when Bookcase and Shelf exist');
assert.equal(has({bookcase:'Bookcase 2',shelf:''}),true);assert.equal(has({bookcase:'',shelf:'4'}),true);assert.equal(has({room:'Study',box:'Box 1'}),true);
assert.equal(api.hasMoveDestination({bookcase:'B',shelf:'2'}),true);assert.equal(api.hasMoveDestination({room:'Study',box:'Box 2'}),false);
const locationless={modelVersion:'v',works:[],editions:[],copies:[{id:'roomless',workId:'w',editionId:'e',location:{bookcase:'Bookcase 2',shelf:'4'}}]};
const index=api.buildBookcaseNavigationIndex(locationless);assert.equal(index.counts.located,1);assert.equal(index.bookcases[0].room,'');assert.equal(index.bookcases[0].shelves[0].copies[0].id,'roomless');
assert.deepEqual(Array.from(copies.get('copy-a').collections),['Penguin Classics'],'Collections stay separate from physical Shelf');
console.log('PHYSICAL_LOCATION_MIGRATION_PASS');
console.log('Native precedence, exact identity backfill, optional Room, completeness, no fabricated Copies, idempotency, stable IDs/timestamps, and Collections separation: PASS');
