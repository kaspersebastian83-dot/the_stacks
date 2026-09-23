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
  slice('function blankLocation','function locationText')+
  slice('function hasUnassignedCoreLocation','function PhysicalLocation')+
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
  ';globalThis.api={nativeCatalogToBookViews,nativeCatalogFromBookViews,catalogPayload,validatePortableBackup,lookupOwnedISBN,moveExactCopiesInBooks,undoExactCopyMoveInBooks,buildBookcaseNavigationIndex,hasMoveDestination,toISBN10};';
const context=vm.createContext({console,Date,Map,Set,Math,Object,JSON});
vm.runInContext(code,context);
const api=context.api;

const loc=(room='',bookcase='',shelf='',box='',position='')=>({room,bookcase,shelf,box,position});
const fixture={
  modelVersion:'work-edition-copy-v1',
  works:[
    {id:'work-one',title:'Synthetic Atlas',author:'S. Example',authors:'S. Example',editionIds:['edition-hard','edition-paper'],copyIds:['copy-a','copy-b','copy-c'],tags:['Reference']},
    {id:'work-two',title:'',author:'',authors:'',editionIds:['edition-unknown'],copyIds:['copy-d'],tags:[]}
  ],
  editions:[
    {id:'edition-hard',workId:'work-one',title:'Synthetic Atlas',authors:'S. Example',isbn:'9780140449112',publisher:'Synthetic Press',copyIds:['copy-a','copy-b']},
    {id:'edition-paper',workId:'work-one',title:'Synthetic Atlas',authors:'S. Example',isbn:'9780140268867',copyIds:['copy-c']},
    {id:'edition-unknown',workId:'work-two',title:'',authors:'',isbn:'9780306406157',copyIds:['copy-d']}
  ],
  copies:[
    {id:'copy-a',copyId:'copy-a',workId:'work-one',editionId:'edition-hard',copyNumber:1,location:loc('Study','Bookcase 1','2','Box 3','11'),collections:['Reference'],tags:['Signed'],status:'read',rating:5,copyNotes:'Keep dry',condition:'Good'},
    {id:'copy-b',copyId:'copy-b',workId:'work-one',editionId:'edition-hard',copyNumber:2,location:loc('Office','Bookcase 2','5','','7'),collections:['Favourites'],tags:['Annotated'],status:'reading',rating:2,copyNotes:'Marked pages',condition:'Very good'},
    {id:'copy-c',copyId:'copy-c',workId:'work-one',editionId:'edition-paper',copyNumber:1,location:loc(),collections:['Travel'],tags:[],status:'unread',rating:0},
    {id:'copy-d',copyId:'copy-d',workId:'work-two',editionId:'edition-unknown',copyNumber:1,location:loc('Office','Bookcase 2','5'),collections:[],tags:[],status:'unread',rating:0,needsIdentification:true}
  ]
};
const before=JSON.stringify(fixture);
const views=api.nativeCatalogToBookViews(fixture);
const viewsBefore=JSON.stringify(views);
const dest=loc('Living room','Main Bookcase','4','Box 1');
const byId=(items,id)=>items.find(item=>(item.copyId||item.id)===id);
const shelf=(index,room,bookcase,label)=>index.rooms.find(item=>item.label===room)?.bookcases.find(item=>item.label===bookcase)?.shelves.find(item=>item.label===label);
const preserved=book=>({id:book.id,copyId:book.copyId,workId:book.workId,editionId:book.editionId,collections:book.collections,tags:book.tags,status:book.status,rating:book.rating,copyNotes:book.copyNotes,condition:book.condition,isbn:book.isbn,title:book.title});

assert.equal(api.hasMoveDestination(loc()),false);
assert.equal(api.hasMoveDestination(loc('Study')),true,'Partial destination remains valid');
assert.equal(api.hasMoveDestination(loc('','','','Box 1')),true);
const beforeIndex=api.buildBookcaseNavigationIndex(fixture);
assert.deepEqual(Array.from(shelf(beforeIndex,'Study','Bookcase 1','2').copies,item=>item.id),['copy-a']);
const single=api.moveExactCopiesInBooks(views,['copy-a'],dest,'2026-09-23T00:00:00.000Z');
assert.equal(single.changed,1);
assert.deepEqual(Array.from(single.movedIds),['copy-a']);
assert.deepEqual({...byId(single.books,'copy-a').location},loc('Living room','Main Bookcase','4','Box 1','11'),'Move preserves unedited Position');
assert.equal(single.books.length,views.length,'Move cannot create a Copy');
assert.equal(new Set(single.books.map(book=>book.copyId)).size,views.length);
assert.deepEqual(JSON.parse(JSON.stringify(preserved(byId(single.books,'copy-a')))),JSON.parse(JSON.stringify(preserved(byId(views,'copy-a')))),'Work, Edition, Copy, Collections, and reading fields stay unchanged');
assert.equal(JSON.stringify(byId(single.books,'copy-b')),JSON.stringify(byId(views,'copy-b')),'Same-Edition sibling stays untouched');
assert.equal(JSON.stringify(views),viewsBefore,'Planning a move does not mutate input');
assert.equal(JSON.stringify(fixture),before,'Planning a move does not mutate native fixture');

const movedCatalog=api.nativeCatalogFromBookViews(single.books,fixture);
const movedIndex=api.buildBookcaseNavigationIndex(movedCatalog);
assert.equal(shelf(movedIndex,'Study','Bookcase 1','2'),undefined,'Source shelf disappears after final Copy moves');
assert.deepEqual(Array.from(shelf(movedIndex,'Living room','Main Bookcase','4').copies,item=>item.id),['copy-a']);
assert.equal(api.lookupOwnedISBN(movedCatalog,'9780140449112').copies.find(item=>item.copy.id==='copy-a').copy.location.room,'Living room','Find / Put Away sees the new native Copy location');
assert.equal(api.lookupOwnedISBN(movedCatalog,'9780140449112').copies.find(item=>item.copy.id==='copy-b').copy.location.room,'Office');
const already=api.moveExactCopiesInBooks(single.books,['copy-a'],dest,'2026-09-24T00:00:00.000Z');
assert.equal(already.changed,0,'Already at destination must not request a write');
assert.deepEqual(Array.from(already.alreadyIds),['copy-a']);
assert.strictEqual(byId(already.books,'copy-a'),byId(single.books,'copy-a'),'Already-here path reuses the same Copy object');

const isbn10=api.toISBN10('9780140449112');
const multiple=api.lookupOwnedISBN(fixture,isbn10);
assert.equal(multiple.state,'owned');
assert.deepEqual(Array.from(multiple.copies,item=>item.copy.id),['copy-a','copy-b'],'ISBN-10 and ISBN-13 identify two physical Copies');
assert.equal(api.lookupOwnedISBN(fixture,'9780140449112').copies.length,2);
assert.equal(JSON.stringify(fixture),before,'Ambiguous scan is read-only until an exact Copy ID is chosen');
const selected=api.moveExactCopiesInBooks(views,[multiple.copies[1].copy.id],dest,'2026-09-23T00:00:00.000Z');
assert.equal(selected.changed,1);
assert.equal(byId(selected.books,'copy-b').location.room,'Living room');
assert.equal(byId(selected.books,'copy-a').location.room,'Study','Only the selected same-Edition Copy moves');
const unowned=api.lookupOwnedISBN(fixture,'9780679783268');
assert.equal(unowned.state,'not-owned');
assert.equal(unowned.copies.length,0);
assert.equal(JSON.stringify(fixture),before,'Unowned lookup cannot create or move a Copy');

const blankMoved=api.moveExactCopiesInBooks(views,['copy-c'],dest,'2026-09-23T00:00:00.000Z');
assert.equal(blankMoved.changed,1);
assert.equal(byId(blankMoved.books,'copy-c').location.room,'Living room','Blank-location Copy can be moved');
const unknownLookup=api.lookupOwnedISBN(fixture,'9780306406157');
assert.equal(unknownLookup.copies.length,1);
const unknownMoved=api.moveExactCopiesInBooks(views,[unknownLookup.copies[0].copy.id],dest,'2026-09-23T00:00:00.000Z');
assert.equal(unknownMoved.changed,1,'Needs-identification Copy can move through valid ISBN');
assert.equal(byId(unknownMoved.books,'copy-d').needsIdentification,true);

const bulk=api.moveExactCopiesInBooks(views,['copy-a','copy-c'],dest,'2026-09-23T00:00:00.000Z');
assert.equal(bulk.changed,2);
assert.equal(byId(bulk.books,'copy-b').location.room,'Office','Batch move respects selected Copy IDs');
assert.equal(byId(bulk.books,'copy-d').location.room,'Office');
assert.equal(byId(bulk.books,'copy-a').location.position,'11');
const undone=api.undoExactCopyMoveInBooks(bulk.books,bulk.previous,dest,'2026-09-24T00:00:00.000Z');
assert.equal(undone.conflict,false);
assert.equal(undone.restored,2);
assert.deepEqual({...byId(undone.books,'copy-a').location},loc('Study','Bookcase 1','2','Box 3','11'));
assert.deepEqual({...byId(undone.books,'copy-c').location},loc());
const conflicting=api.undoExactCopyMoveInBooks(selected.books,single.previous,dest);
assert.equal(conflicting.conflict,true,'Undo refuses to overwrite a Copy that moved elsewhere');
const positionChanged=api.moveExactCopiesInBooks(views,['copy-a'],dest,'2026-09-23T00:00:00.000Z');
const interveningPosition=positionChanged.books.map(book=>book.copyId==='copy-a'?{...book,location:{...book.location,position:'99'}}:book);
const unsafeUndo=api.undoExactCopyMoveInBooks(interveningPosition,positionChanged.previous,dest);
assert.equal(unsafeUndo.conflict,true,'Undo refuses to overwrite an intervening Position change');
assert.strictEqual(unsafeUndo.books,interveningPosition);

const reloaded=JSON.parse(JSON.stringify(movedCatalog));
assert.equal(api.lookupOwnedISBN(reloaded,'9780140449112').copies.find(item=>item.copy.id==='copy-a').copy.location.room,'Living room','Serialized native catalog reload retains move');
const payload=api.catalogPayload(single.books,[],[],{theme:'light'},movedCatalog);
const restored=api.validatePortableBackup(JSON.parse(JSON.stringify(payload)));
assert.equal(restored.valid,true);
assert.equal(restored.migrated.nativeCatalog.copies.find(copy=>copy.id==='copy-a').location.room,'Living room','Portable backup/restore retains moved Copy.location');
assert.equal(restored.migrated.nativeCatalog.copies.length,4);

const moveUI=slice('function MoveBooksView','function FindPutAway');
assert.match(moveUI,/lookup\.copies\.length>1/,'Ambiguous ISBN requires a Copy choice');
assert.match(moveUI,/onMoveCopies\(\[copy\.id\],destination/,'Scanner moves one exact Copy ID');
assert.match(moveUI,/CameraBarcodeScanner active=\{cameraOn\} mode="move"/,'Scanner reuses camera infrastructure');
assert.match(moveUI,/onSubmit=\{submit\}/,'Manual and hardware scanner Enter share the submission path');
assert.doesNotMatch(moveUI,/processScan\(|insertScannedBook\(|addFoundBook\(/,'Relocation cannot use intake');
assert.match(source,/if\(!silent\)makeSnapshot\('before-exact-copy-move'\)/,'Continuous scans avoid full-catalog snapshot per barcode');

console.log('MOVE_BOOKS_REGRESSION_PASS');
console.log('Exact single, batch, ambiguous ISBN, blank and unknown Copies, no-op, undo, and hierarchy: PASS');
console.log('Find lookup, ISBN-10/13, reload and backup/restore, preserved identity and metadata: PASS');
