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
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
let generatedId=0;
function genId(){return 'generated-'+(++generatedId);}
`;

const source=runtime+
  slice('function uniq','const FORMAT_OPTIONS')+
  slice('function blankLocation','function locationText')+
  slice('function collectionNames','function editorShelfOptions')+
  slice('function hasMissingLocation','function normalizedTitle')+
  slice('function sameLocation','function parseCSV')+
  `;globalThis.api={buildLocationTree,locationSuggestions,updateCopyLocationsInBooks,restoreCopyLocationsInBooks};`;

const context=vm.createContext({console,Date,Map,Set,Math});
vm.runInContext(source,context);
const api=context.api;

const fixture=[
  {id:'copy-atlas-a',copyId:'copy-atlas-a',workId:'work-atlas',editionId:'edition-atlas-hard',title:'Historical Atlas',authors:'A. Cartographer',isbn:'9780306406157',publisher:'Archive Press',year:'2020',format:'Hardcover',condition:'Very good',copyNotes:'Signed copy',collections:['History'],tags:['Signed'],status:'read',rating:5,lentTo:'Reader One',lentDate:'2026-02-10',dueDate:'2026-03-10',returnedDate:'',notes:'Exact copy A',location:{room:'Study',bookcase:'A',shelf:'3',box:'2',position:'4'},updatedAt:'2026-02-01T00:00:00.000Z'},
  {id:'copy-atlas-b',copyId:'copy-atlas-b',workId:'work-atlas',editionId:'edition-atlas-hard',title:'Historical Atlas',authors:'A. Cartographer',isbn:'9780306406157',publisher:'Archive Press',year:'2020',format:'Hardcover',condition:'Good',copyNotes:'Reading copy',collections:['Reference'],tags:['Annotated'],status:'reading',rating:3,lentTo:'',lentDate:'',dueDate:'',returnedDate:'2026-01-15',notes:'Exact copy B',location:{room:'Office',bookcase:'B',shelf:'4',box:'1',position:'17'},updatedAt:'2026-02-02T00:00:00.000Z'},
  {id:'copy-atlas-paper',copyId:'copy-atlas-paper',workId:'work-atlas',editionId:'edition-atlas-paper',title:'Historical Atlas',authors:'A. Cartographer',isbn:'9780140449112',publisher:'Archive Press',year:'2022',format:'Paperback',condition:'Acceptable',copyNotes:'Travel edition',collections:['Travel'],tags:['Portable'],status:'unread',rating:0,lentTo:'Reader Three',lentDate:'2026-03-01',dueDate:'2026-04-01',returnedDate:'',notes:'Other edition',location:{room:'Bedroom',bookcase:'C',shelf:'1',box:'3',position:'8'},updatedAt:'2026-02-03T00:00:00.000Z'}
];

const byId=(books,id)=>books.find(book=>book.copyId===id);
const preservedFields=['id','copyId','workId','editionId','title','authors','isbn','publisher','year','format','collections','status','rating','lentTo','lentDate','dueDate','returnedDate','condition','copyNotes','notes','tags'];
const preservedValues=book=>Object.fromEntries(preservedFields.map(field=>[field,book[field]]));
const fixtureBefore=JSON.stringify(fixture);
const tree=api.buildLocationTree(fixture);
const suggestions=api.locationSuggestions(fixture,{room:'Study'});
assert.equal(tree.copyIds.length,3);
assert.deepEqual(Array.from(suggestions.bookcase),['A']);
assert.equal(JSON.stringify(fixture),fixtureBefore,'Location browsing must not mutate fixture data');

const single=api.updateCopyLocationsInBooks(fixture,['copy-atlas-a'],{room:'Archive',bookcase:'Z',shelf:'9',box:'7',position:'23'},'2026-03-01T00:00:00.000Z');
assert.equal(single.changed,1);
assert.deepEqual({...byId(single.books,'copy-atlas-a').location},{room:'Archive',bookcase:'Z',shelf:'9',box:'7',position:'23'});
assert.deepEqual({...single.previous['copy-atlas-a']},{room:'Study',bookcase:'A',shelf:'3',box:'2',position:'4'});
assert.equal(JSON.stringify(byId(single.books,'copy-atlas-b')),JSON.stringify(fixture[1]),'Moving one physical Copy must not modify a sibling of the same Edition');
assert.equal(JSON.stringify(byId(single.books,'copy-atlas-paper')),JSON.stringify(fixture[2]),'Moving one Copy must not modify another Edition');
assert.equal(byId(single.books,'copy-atlas-a').copyId,'copy-atlas-a');
assert.equal(byId(single.books,'copy-atlas-a').editionId,'edition-atlas-hard');
assert.equal(byId(single.books,'copy-atlas-a').workId,'work-atlas');
assert.deepEqual(Array.from(byId(single.books,'copy-atlas-a').collections),['History']);
assert.deepEqual(Array.from(byId(single.books,'copy-atlas-a').tags),['Signed']);
assert.equal(byId(single.books,'copy-atlas-a').condition,'Very good');
assert.equal(byId(single.books,'copy-atlas-a').copyNotes,'Signed copy');
assert.equal(byId(single.books,'copy-atlas-a').status,'read');
assert.equal(byId(single.books,'copy-atlas-a').rating,5);
assert.equal(byId(single.books,'copy-atlas-a').lentTo,'Reader One');
assert.equal(byId(single.books,'copy-atlas-a').notes,'Exact copy A');
assert.equal(byId(single.books,'copy-atlas-a').title,'Historical Atlas');
assert.equal(byId(single.books,'copy-atlas-a').authors,'A. Cartographer');
assert.equal(byId(single.books,'copy-atlas-a').isbn,'9780306406157');
assert.equal(byId(single.books,'copy-atlas-a').publisher,'Archive Press');
assert.equal(byId(single.books,'copy-atlas-a').year,'2020');
assert.equal(byId(single.books,'copy-atlas-a').format,'Hardcover');
assert.equal(JSON.stringify(preservedValues(byId(single.books,'copy-atlas-a'))),JSON.stringify(preservedValues(fixture[0])),'Single move preserves identity, collections, reading, lending, condition, notes, tags, and bibliographic metadata');
assert.equal(JSON.stringify(fixture),fixtureBefore,'A location update must not mutate its input books');

const siblingMove=api.updateCopyLocationsInBooks(single.books,['copy-atlas-b'],{room:'Vault',bookcase:'V',shelf:'2',box:'1',position:'31'},'2026-03-02T00:00:00.000Z');
assert.deepEqual({...byId(siblingMove.books,'copy-atlas-b').location},{room:'Vault',bookcase:'V',shelf:'2',box:'1',position:'31'});
assert.deepEqual({...byId(siblingMove.books,'copy-atlas-a').location},{room:'Archive',bookcase:'Z',shelf:'9',box:'7',position:'23'},'Moving the sibling Copy must not move the first Copy');

const bulk=api.updateCopyLocationsInBooks(fixture,['copy-atlas-a','copy-atlas-b'],{room:'Library',bookcase:'North',shelf:'5',box:'6',position:'999'},'2026-03-03T00:00:00.000Z');
assert.equal(bulk.changed,2);
assert.deepEqual({...byId(bulk.books,'copy-atlas-a').location},{room:'Library',bookcase:'North',shelf:'5',box:'6',position:'4'},'Bulk move preserves Copy A Position');
assert.deepEqual({...byId(bulk.books,'copy-atlas-b').location},{room:'Library',bookcase:'North',shelf:'5',box:'6',position:'17'},'Bulk move preserves Copy B Position');
assert.equal(JSON.stringify(byId(bulk.books,'copy-atlas-paper')),JSON.stringify(fixture[2]));
assert.deepEqual({...bulk.previous['copy-atlas-a']},{room:'Study',bookcase:'A',shelf:'3',box:'2',position:'4'});
assert.deepEqual({...bulk.previous['copy-atlas-b']},{room:'Office',bookcase:'B',shelf:'4',box:'1',position:'17'});
assert.equal(JSON.stringify(preservedValues(byId(bulk.books,'copy-atlas-a'))),JSON.stringify(preservedValues(fixture[0])),'Bulk move preserves unrelated Copy A fields');
assert.equal(JSON.stringify(preservedValues(byId(bulk.books,'copy-atlas-b'))),JSON.stringify(preservedValues(fixture[1])),'Bulk move preserves unrelated Copy B fields');

const undone=api.restoreCopyLocationsInBooks(bulk.books,bulk.previous,'2026-03-04T00:00:00.000Z');
assert.deepEqual({...byId(undone,'copy-atlas-a').location},{...fixture[0].location},'Undo restores Copy A exact prior location');
assert.deepEqual({...byId(undone,'copy-atlas-b').location},{...fixture[1].location},'Undo restores Copy B exact prior location');
assert.deepEqual({...byId(undone,'copy-atlas-paper').location},{...fixture[2].location});
assert.equal(new Set(undone.map(book=>book.copyId)).size,3,'Location operations preserve unique physical Copy identity');

console.log('LOCATION_REGRESSION_PASS');
console.log('Single and bulk moves preserve exact Copy identity and same-Edition independence: PASS');
console.log('Bulk Position preservation, exact per-Copy Undo, and non-mutating reads: PASS');
