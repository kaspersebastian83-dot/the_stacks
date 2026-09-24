#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./load-production-source');

function slice(start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Could not extract production ${start}`);
  return source.slice(from,to);
}

const code=
  slice('function blankLocation','function PhysicalLocation')+
  slice('function compareNaturalLocationValue','function physicalLocationSortEntry')+
  slice('function buildBookcaseNavigationIndex','function LibraryBrowseTabs')+
  ';globalThis.api={buildBookcaseNavigationIndex,hasUnassignedCoreLocation,locationText};';
const context=vm.createContext({Map,Set});
vm.runInContext(code,context);
const {buildBookcaseNavigationIndex,hasUnassignedCoreLocation,locationText}=context.api;

const location=(room='',bookcase='',shelf='')=>({room,bookcase,shelf,box:'',position:''});
const fixture={
  works:[{id:'work-one',title:'A Synthetic Work'},{id:'work-two',title:'Another Work'}],
  editions:[{id:'edition-one',workId:'work-one'},{id:'edition-two',workId:'work-one'},{id:'edition-three',workId:'work-two'}],
  copies:[
    {id:'copy-a',workId:'work-one',editionId:'edition-one',location:location('Study','Bookcase 2','Shelf 2'),collections:['Anthropology']},
    {id:'copy-b',workId:'work-one',editionId:'edition-one',location:location('Study','Bookcase 2','Shelf 10'),collections:['Favourites']},
    {id:'copy-c',workId:'work-one',editionId:'edition-two',location:location('Study','Bookcase 10','Shelf 2'),collections:['Anthropology']},
    {id:'copy-d',workId:'work-two',editionId:'edition-three',location:location('Office','Bookcase 1','Shelf 1'),collections:[]},
    {id:'copy-e',workId:'work-one',editionId:'edition-one',location:location(),collections:['Anthropology']},
    {id:'copy-f',workId:'work-one',editionId:'edition-one',location:location('Office','Bookcase 1',''),collections:[]},
    {id:'copy-g',workId:'work-two',editionId:'edition-three',location:location('','Main Bookcase','3'),collections:[]},
    {id:'copy-h',workId:'work-one',editionId:'edition-one',location:location('Study','Bookcase 2','Shelf 2'),collections:['Other']}
  ]
};
const before=JSON.stringify(fixture);
const index=buildBookcaseNavigationIndex(fixture);
const ids=items=>Array.from(items,item=>item.id);
assert.deepEqual({...index.counts},{copies:8,located:6,missing:1,partial:1,rooms:2,bookcases:4,shelves:5});
assert.deepEqual(Array.from(index.bookcases,item=>item.label),['Bookcase 1','Bookcase 2','Bookcase 10','Main Bookcase']);
assert.equal(index.bookcases.some(item=>item.label==='Bookcase 1'&&item.room==='Room not specified'),false,'Roomless locations do not create a synthetic Room navigation level');
const office=index.bookcases.find(item=>item.room==='Office'&&item.label==='Bookcase 1'),study=index.bookcases.find(item=>item.room==='Study'&&item.label==='Bookcase 2'),roomless=index.bookcases.find(item=>item.label==='Main Bookcase');
assert.equal(office.label,'Bookcase 1');
assert.deepEqual(ids(office.shelves[0].copies),['copy-d']);
assert.deepEqual(Array.from(study.shelves,item=>item.label),['Shelf 2','Shelf 10']);
assert.deepEqual(ids(study.shelves[0].copies),['copy-a','copy-h'],'Same-shelf physical Copies must not collapse');
assert.deepEqual(ids(study.shelves[1].copies),['copy-b'],'Shelf inventory must exclude neighbouring shelves');
assert.deepEqual(ids(index.bookcases.find(item=>item.label==='Bookcase 10').shelves[0].copies),['copy-c'],'Another Edition belongs to its own exact shelf');
assert.deepEqual(ids(index.missing),['copy-e']);
assert.deepEqual(ids(index.partial),['copy-f']);
assert.deepEqual(ids(roomless.shelves[0].copies),['copy-g'],'Room is optional when Bookcase and Shelf are assigned');
assert.equal(hasUnassignedCoreLocation(fixture.copies[4].location),true,'Use the same missing-location rule as Find / Put Away');
const boxOnly={copies:[{id:'copy-box-only',location:{room:'',bookcase:'',shelf:'',box:'Box 1',position:''}}]};
const boxOnlyIndex=buildBookcaseNavigationIndex(boxOnly);
assert.equal(hasUnassignedCoreLocation(boxOnly.copies[0].location),true,'A Box-only Copy is incomplete without Bookcase and Shelf');
assert.deepEqual(ids(boxOnlyIndex.partial),['copy-box-only']);
assert.equal(boxOnlyIndex.missing.length,0);
assert.equal(locationText({location:{room:'Office',bookcase:'Bookcase 1',shelf:'Shelf 2',box:'Box 3',position:''}}),'Bookcase 1 · Shelf 2 · Room: Office · Box 3','Location summaries prioritize Bookcase and Shelf');
assert.equal(JSON.stringify(fixture),before,'Read-only hierarchy derivation must not mutate native catalog data');

const moved=JSON.parse(JSON.stringify(fixture));
moved.copies.find(copy=>copy.id==='copy-b').location=location('Office','Bookcase 1','Shelf 1');
const movedIndex=buildBookcaseNavigationIndex(moved);
assert.deepEqual(ids(movedIndex.bookcases.find(item=>item.room==='Office'&&item.label==='Bookcase 1').shelves[0].copies),['copy-b','copy-d']);
assert.deepEqual(ids(movedIndex.bookcases.find(item=>item.room==='Study'&&item.label==='Bookcase 2').shelves[0].copies),['copy-a','copy-h']);
assert.equal(movedIndex.bookcases.find(item=>item.room==='Study'&&item.label==='Bookcase 2').shelves.length,1,'Empty shelf disappears after moving its final Copy');
assert.equal(fixture.copies[0].location.room,'Study','Moving one same-Edition Copy must not alter another');
assert.equal(JSON.stringify(fixture),before,'Original fixture remains unchanged');

const recollected=JSON.parse(JSON.stringify(fixture));
recollected.copies[0].collections=['Different Collection'];
assert.deepEqual(JSON.parse(JSON.stringify(buildBookcaseNavigationIndex(recollected).counts)),JSON.parse(JSON.stringify(index.counts)),'Collections cannot alter physical hierarchy');
const restored=JSON.parse(JSON.stringify(fixture));
assert.deepEqual(JSON.parse(JSON.stringify(buildBookcaseNavigationIndex(restored).counts)),JSON.parse(JSON.stringify(index.counts)),'Serialized Copy locations restore the same hierarchy');
const allLocated=JSON.parse(JSON.stringify(fixture));
allLocated.copies[4].location=location('Study','Bookcase 2','Shelf 2');
allLocated.copies[5].location=location('Office','Bookcase 1','Shelf 1');
allLocated.copies[6].location=location('Office','Bookcase 1','Shelf 1');
const complete=buildBookcaseNavigationIndex(allLocated);
assert.equal(complete.counts.located,complete.counts.copies);
assert.equal(complete.missing.length,0,'No warning group when every Copy has a complete location');
assert.equal(complete.partial.length,0,'No incomplete group when every Copy has a complete location');
const large={copies:Array.from({length:5000},(_,i)=>({id:'bulk-'+i,location:location('Room '+(i%5),'Bookcase '+(i%12),'Shelf '+(i%20))}))};
const largeIndex=buildBookcaseNavigationIndex(large);
assert.equal(largeIndex.counts.copies,5000);
assert.equal(largeIndex.counts.located,5000);
assert.equal(largeIndex.bookcases.reduce((sum,bookcase)=>sum+bookcase.copies.length,0),5000);
const duplicateNames={copies:[{id:'dup-study',location:location('Study','Same Bookcase','Shelf 1')},{id:'dup-office',location:location('Office','Same Bookcase','Shelf 1')}]};
const duplicateIndex=buildBookcaseNavigationIndex(duplicateNames);
assert.equal(duplicateIndex.bookcases.length,2,'Same-labeled Bookcases in separate Rooms retain distinct identities');
assert.notEqual(duplicateIndex.bookcases[0].id,duplicateIndex.bookcases[1].id,'Bookcase identity is a stable composite of label and Room');
assert.deepEqual(Array.from(duplicateIndex.bookcases,item=>item.room),['Office','Study'],'Room is optional Bookcase context, not a navigation level');
const bookcaseUI=source.slice(source.indexOf('function BookcasesLibraryView'),source.indexOf('function LibraryView'));
assert.match(bookcaseUI,/index\.bookcases/,'Top-level physical browse renders Bookcases directly');
assert.doesNotMatch(bookcaseUI,/Room not specified/,'The UI does not invent a Room navigation node');
assert.match(source,/\['bookcases','Bookcases'\]/,'Bookcases must be discoverable in Library tabs');
assert.match(source,/if\(browseMode==='bookcases'\)return <BookcasesLibraryView/,'Bookcases tab must render the physical view');

console.log('Bookcases hierarchy, exact shelf inventories, Copy counts, fallback groups, natural sort, and relocation: PASS');
console.log('Collections independence, read-only derivation, serialization, and Library entry point: PASS');
