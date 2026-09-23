#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./load-production-source');
const isbnSource=require('./load-production-isbn-source');

function slice(start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Could not extract production ${start}`);
  return source.slice(from,to);
}

const runtime=`
const APP_VERSION='test';
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
const DEFAULT_SETTINGS={theme:'light',defaultStatus:'unread',defaultCollection:'',defaultLocation:{room:'',bookcase:'',shelf:'',box:'',position:''},backupReminderDays:14};
const NATIVE_CATALOG_KEY='bookCatalog:nativeCatalog:v1',BOOKS_KEY='bookCatalog:library:v1',COLLECTIONS_KEY='bookCatalog:shelves:v1',VIEWS_KEY='bookCatalog:savedViews:v1',SETTINGS_KEY='bookCatalog:settings:v1',SCHEMA_KEY='bookCatalog:schemaVersion:v1',STORAGE_MODE_KEY='bookCatalog:storageMode:v1';
let generatedId=0;
function genId(){return 'generated-'+(++generatedId);}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const localValues=new Map(),idbValues=new Map();
const localStorage={getItem:key=>localValues.has(key)?localValues.get(key):null,setItem:(key,value)=>localValues.set(key,String(value))};
async function idbSetKV(key,value){idbValues.set(key,JSON.parse(JSON.stringify(value)));}
async function idbGetKV(key){return idbValues.get(key);}
`;
const code=runtime+isbnSource+
  slice('function uniq','const FORMAT_OPTIONS')+
  slice('function blankLocation','function locationText')+
  slice('function normalizeSettings','const BACKUP_HEALTH')+
  slice('function catalogPayload','function migrationStringKey')+
  slice('function migrationStringKey','function catalogSchemaIssues')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('function blankNativeCatalog','function migrationBackupPayload')+
  slice('function collectionNames','function editorShelfOptions')+
  slice('function safeJSONParse','function idbAvailable')+
  slice('function getPreferredStorageMode','function openStacksDB')+
  slice('async function idbLoadCatalogPayload','async function idbSaveCurrentCatalog')+
  slice('async function loadCatalogFromLocalStorage','async function storeVerifiedSafetySnapshot')+
  ';globalThis.api={normalizeBook,nativeCatalogFromBookViews,nativeCatalogToBookViews,catalogPayload,writeLocalCatalogPayload,idbSaveCatalogPayload,loadCatalogFromPreferredStorage,setPreferredStorageMode,getPreferredStorageMode,localValues,idbValues};';
const context=vm.createContext({console,Date,Map,Set,Math,Object,JSON});
vm.runInContext(code,context);
const api=context.api;

(async()=>{
  const first=api.normalizeBook({id:'copy-storage',copyId:'copy-storage',workId:'work-storage',editionId:'edition-storage',title:'Storage Fixture',authors:'S. Fixture',isbn:'9780306406157',collections:['Archive'],location:{room:'Office',bookcase:'Bookcase 1',shelf:'2',box:'',position:'7'}});
  const native=api.nativeCatalogFromBookViews([first]);
  const localPayload=api.catalogPayload([first],['Archive'],[],{theme:'light'},native);
  assert.equal(api.writeLocalCatalogPayload(localPayload),true);
  api.setPreferredStorageMode('localStorage');
  let loaded=await api.loadCatalogFromPreferredStorage();
  assert.equal(loaded.mode,'localStorage');
  assert.equal(loaded.data.catalog.copies[0].id,'copy-storage');
  assert.equal(loaded.data.catalog.copies[0].location.shelf,'2');
  assert.deepEqual(Array.from(loaded.data.collections),['Archive']);

  await api.idbSaveCatalogPayload(localPayload);
  api.setPreferredStorageMode('indexeddb');
  loaded=await api.loadCatalogFromPreferredStorage();
  assert.equal(loaded.mode,'indexeddb');
  assert.equal(loaded.data.catalog.copies[0].id,'copy-storage');
  assert.equal(loaded.data.catalog.copies[0].location.position,'7');
  assert.deepEqual(Array.from(loaded.data.catalog.copies[0].collections),['Archive']);

  const moved=api.normalizeBook({...first,location:{...first.location,room:'Living Room',shelf:'4'}});
  const movedCatalog=api.nativeCatalogFromBookViews([moved],native);
  await api.idbSaveCatalogPayload(api.catalogPayload([moved],['Archive'],[],{theme:'light'},movedCatalog));
  loaded=await api.loadCatalogFromPreferredStorage();
  assert.equal(loaded.data.catalog.copies[0].location.room,'Living Room','IndexedDB reload retains relocation');
  assert.equal(loaded.data.catalog.copies[0].id,'copy-storage');
  assert.equal(JSON.parse(api.localValues.get('bookCatalog:nativeCatalog:v1')).copies[0].location.room,'Office','Switching to IndexedDB does not mutate localStorage fallback');

  api.idbValues.clear();
  loaded=await api.loadCatalogFromPreferredStorage();
  assert.equal(loaded.mode,'localStorage','Missing IndexedDB catalog safely falls back to localStorage');
  assert.equal(loaded.data.catalog.copies[0].location.room,'Office');
  assert.equal(api.getPreferredStorageMode(),'indexeddb','Fallback read does not silently rewrite preference');

  console.log('STORAGE_MODE_REGRESSION_PASS');
  console.log('localStorage and IndexedDB Copy-location roundtrip, independent fallback, and missing-IDB fallback: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
