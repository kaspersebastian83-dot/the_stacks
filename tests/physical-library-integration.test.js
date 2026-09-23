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
let generatedId=0;
function genId(){return 'generated-'+(++generatedId);}
function normalizedTitle(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
`;
const code=runtime+isbnSource+
  slice('function uniq','const FORMAT_OPTIONS')+
  slice('function blankLocation','function PhysicalLocation')+
  slice('function normalizeSettings','const BACKUP_HEALTH')+
  slice('function catalogPayload','function migrationStringKey')+
  slice('function migrationStringKey','function catalogSchemaIssues')+
  slice('function v3StableId','function buildV3CatalogModel')+
  slice('function validateNativeBackupCatalog','function migrationBackupInfo')+
  slice('function blankNativeCatalog','function migrationBackupPayload')+
  slice('function migrateCatalogData','function buildImportPreview')+
  slice('function collectionNames','function editorShelfOptions')+
  slice('function sameLocation','function parseCSV')+
  slice('function lookupOwnedISBN','function migrationBackupPayload')+
  slice('function compareNaturalLocationValue','function physicalLocationSortEntry')+
  slice('function buildBookcaseNavigationIndex','function LibraryBrowseTabs')+
  ';globalThis.api={normalizeBook,nativeCatalogFromBookViews,nativeCatalogToBookViews,lookupOwnedISBN,moveExactCopiesInBooks,undoExactCopyMoveInBooks,buildBookcaseNavigationIndex,catalogPayload,validatePortableBackup};';
const context=vm.createContext({console,Date,Map,Set,Math,Object,JSON});
vm.runInContext(code,context);
const api=context.api;

const location=(room='',bookcase='',shelf='',box='',position='')=>({room,bookcase,shelf,box,position});
const copy=api.normalizeBook({
  id:'copy-integration',copyId:'copy-integration',workId:'work-integration',editionId:'edition-integration',
  title:'Synthetic Journey',authors:'A. Fixture',isbn:'9780140449112',collections:['Travel'],
  status:'reading',rating:4,copyNotes:'Original physical Copy',location:location()
});
const imported=api.nativeCatalogFromBookViews([copy]);
assert.equal(imported.works.length,1);
assert.equal(imported.editions.length,1);
assert.equal(imported.copies.length,1,'Import creates exactly one physical Copy');
assert.equal(api.lookupOwnedISBN(imported,'9780140449112').copies[0].copy.id,'copy-integration');

const office=location('Office','Bookcase 1','2');
const assigned=api.moveExactCopiesInBooks(api.nativeCatalogToBookViews(imported),['copy-integration'],office,'2026-09-23T00:00:00.000Z');
assert.equal(assigned.changed,1);
const assignedCatalog=api.nativeCatalogFromBookViews(assigned.books,imported);
const ids=items=>Array.from(items||[],item=>item.id);
const shelf=(catalog,room,bookcase,label)=>api.buildBookcaseNavigationIndex(catalog).rooms.find(item=>item.label===room)?.bookcases.find(item=>item.label===bookcase)?.shelves.find(item=>item.label===label);
assert.deepEqual(ids(shelf(assignedCatalog,'Office','Bookcase 1','2')?.copies),['copy-integration']);
assert.equal(api.lookupOwnedISBN(assignedCatalog,'9780140449112').copies[0].copy.location.room,'Office');

const livingRoom=location('Living Room','Main Bookcase','4');
const moved=api.moveExactCopiesInBooks(api.nativeCatalogToBookViews(assignedCatalog),['copy-integration'],livingRoom,'2026-09-23T00:01:00.000Z');
assert.equal(moved.changed,1);
const movedCatalog=api.nativeCatalogFromBookViews(moved.books,assignedCatalog);
assert.deepEqual(ids(shelf(movedCatalog,'Office','Bookcase 1','2')?.copies),[],'Source shelf loses its final Copy');
assert.deepEqual(ids(shelf(movedCatalog,'Living Room','Main Bookcase','4')?.copies),['copy-integration']);
const movedMatch=api.lookupOwnedISBN(movedCatalog,'9780140449112').copies[0];
assert.equal(movedMatch.copy.location.room,'Living Room','Find reports the relocated Copy');
assert.equal(movedMatch.copy.id,'copy-integration');
assert.deepEqual(Array.from(movedMatch.copy.collections),['Travel']);
assert.equal(movedMatch.copy.status,'reading');
assert.equal(movedMatch.copy.rating,4);
assert.equal(movedMatch.copy.copyNotes,'Original physical Copy');

const undone=api.undoExactCopyMoveInBooks(moved.books,moved.previous,livingRoom,'2026-09-23T00:02:00.000Z');
assert.equal(undone.conflict,false);
assert.equal(undone.restored,1);
const restoredShelfCatalog=api.nativeCatalogFromBookViews(undone.books,movedCatalog);
assert.deepEqual(ids(shelf(restoredShelfCatalog,'Office','Bookcase 1','2')?.copies),['copy-integration']);
assert.deepEqual(ids(shelf(restoredShelfCatalog,'Living Room','Main Bookcase','4')?.copies),[]);

const backup=api.catalogPayload(undone.books,['Travel'],[],{theme:'light'},restoredShelfCatalog);
const checked=api.validatePortableBackup(JSON.parse(JSON.stringify(backup)));
assert.equal(checked.valid,true);
const restored=checked.migrated.nativeCatalog;
assert.equal(restored.copies.length,1);
assert.equal(restored.copies[0].id,'copy-integration');
assert.deepEqual({...restored.copies[0].location},office);
assert.deepEqual(Array.from(restored.copies[0].collections),['Travel']);
assert.equal(api.lookupOwnedISBN(restored,'9780140449112').copies[0].copy.id,'copy-integration');
assert.deepEqual(ids(shelf(restored,'Office','Bookcase 1','2')?.copies),['copy-integration']);

console.log('PHYSICAL_LIBRARY_INTEGRATION_PASS');
console.log('Import → Find → assign → Bookcases → move → Find → undo → backup/restore: PASS');
