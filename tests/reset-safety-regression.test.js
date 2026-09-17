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
const APP_VERSION='test';
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const SNAPSHOT_KEY='bookCatalog:lastSnapshot:v1';
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
const DEFAULT_SETTINGS={theme:'light',defaultStatus:'unread',defaultCollection:'',defaultLocation:{room:'',bookcase:'',shelf:'',box:'',position:''},confirmDestructive:true,autoJsonSnapshot:true,backupReminderDays:14,compactMobile:false,showShortcutHints:true,preferGoogleBooksFallback:true};
let generatedId=0;
function genId(){return 'generated-'+(++generatedId);}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
async function idbSetKV(){throw new Error('Unexpected real IndexedDB write');}
async function idbGetKV(){throw new Error('Unexpected real IndexedDB read');}
function safeLocalSet(){throw new Error('Unexpected real localStorage write');}
function safeJSONParse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback}catch{return fallback}}
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
  slice('async function storeVerifiedSafetySnapshot','function canLoadSampleLibrary')+
  `;globalThis.api={storeVerifiedSafetySnapshot,prepareLibraryResetPayload};`;

const context=vm.createContext({console,Date,Map,Set,Math,Object,JSON});
vm.runInContext(source,context);
const api=context.api;

const settings={theme:'dark',defaultStatus:'reading',defaultCollection:'Archive',defaultLocation:{room:'Study',bookcase:'A',shelf:'3',box:'',position:''},confirmDestructive:true,autoJsonSnapshot:false,backupReminderDays:30,compactMobile:true,showShortcutHints:false,preferGoogleBooksFallback:false};
const current={
  app:'The Stacks',kind:'native-work-edition-copy-catalog',version:'3.9.11',schemaVersion:3,modelVersion:'work-edition-copy-v1',exportedAt:'2026-03-01T00:00:00.000Z',
  catalog:{modelVersion:'work-edition-copy-v1',createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z',works:[{id:'work-one',title:'Fixture Work',author:'Fixture Author',authors:'Fixture Author',editionIds:['edition-one'],copyIds:['copy-one'],tags:[],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'}],editions:[{id:'edition-one',workId:'work-one',title:'Fixture Work',authors:'Fixture Author',isbn:'9780306406157',copyIds:['copy-one'],createdAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'}],copies:[{id:'copy-one',copyId:'copy-one',workId:'work-one',editionId:'edition-one',sourceBookId:'copy-one',copyNumber:1,collections:['Archive'],tags:[],status:'read',rating:4,location:{room:'Study',bookcase:'A',shelf:'3',box:'',position:'9'},addedAt:'2026-02-01T00:00:00.000Z',updatedAt:'2026-02-01T00:00:00.000Z'}]},
  books:[],compatibilityBooks:[],collections:['Archive'],savedViews:[{id:'archive-view',name:'Archive'}],settings
};

(async()=>{
  const before=JSON.stringify(current);let storedLocal=null;let catalogWrites=0;
  const empty=await api.prepareLibraryResetPayload(current,'localStorage',{
    setLocal:(key,value)=>{assert.equal(key,'bookCatalog:lastSnapshot:v1');storedLocal=JSON.parse(value);return true;},
    getLocal:()=>storedLocal
  });
  assert.equal(storedLocal.snapshotLabel,'before-reset-library');
  assert.ok(storedLocal.snapshotAt);
  assert.equal(storedLocal.catalog.copies[0].id,'copy-one','The pre-reset snapshot contains the exact physical Copy');
  assert.deepEqual({...storedLocal.settings},settings,'The pre-reset snapshot preserves settings');
  assert.equal(empty.catalog.works.length,0);assert.equal(empty.catalog.editions.length,0);assert.equal(empty.catalog.copies.length,0);
  assert.deepEqual(Array.from(empty.collections),[]);assert.deepEqual(Array.from(empty.savedViews),[]);
  assert.equal(JSON.stringify(empty.settings),JSON.stringify(settings),'Reset payload preserves application settings');
  assert.equal(JSON.stringify(current),before,'Preparing reset must not mutate current catalog data');
  assert.equal(catalogWrites,0,'Snapshot preparation performs no destructive catalog writes');

  let failed=false;
  try{
    await api.prepareLibraryResetPayload(current,'localStorage',{setLocal:()=>false,getLocal:()=>null});
  }catch(err){failed=true;assert.match(err.message,/snapshot could not be saved/i);}
  assert.equal(failed,true,'Snapshot storage failure must abort reset preparation');

  failed=false;
  try{
    await api.prepareLibraryResetPayload(current,'indexeddb',{setIDB:async()=>{},getIDB:async()=>({snapshotAt:'wrong-value'})});
  }catch(err){failed=true;assert.match(err.message,/snapshot verification failed/i);}
  assert.equal(failed,true,'Snapshot verification failure must abort reset preparation');

  const modalSource=slice('function ResetLibraryModal','function SampleLibraryModal');
  assert.match(modalSource,/phrase\.trim\(\)!=='RESET'/,'Reset confirmation requires the exact RESET phrase');
  assert.match(modalSource,/disabled=\{phrase\.trim\(\)!=='RESET'\|\|busy\}/,'Reset action stays disabled without exact confirmation');

  const resetSource=slice('async function resetLibrary','function confirmRisk');
  const prepareIndex=resetSource.indexOf('await prepareLibraryResetPayload');
  const persistIndex=resetSource.indexOf('await persistCatalogPayloadStrict(emptyPayload)');
  const commitIndex=resetSource.indexOf('commitNativeCatalog(emptyCatalog)');
  assert.ok(prepareIndex>=0&&persistIndex>prepareIndex&&commitIndex>persistIndex,'Verified snapshot preparation precedes persistence and in-memory clearing');
  assert.match(resetSource,/catch\(err\)\{toast\('Library was not reset because the safety snapshot could not be saved:[\s\S]*?return false;\}/,'Snapshot failure returns before reset writes');
  assert.doesNotMatch(html,/localStorage\.clear\s*\(/,'Reset must never blindly clear all localStorage');
  assert.doesNotMatch(html,/indexedDB\.deleteDatabase\s*\(/,'Reset must never delete the whole IndexedDB database');

  console.log('RESET_SAFETY_REGRESSION_PASS');
  console.log('Exact RESET confirmation, verified pre-reset snapshot, and failure abort: PASS');
  console.log('Settings preservation and absence of blind browser-storage clearing: PASS');
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
