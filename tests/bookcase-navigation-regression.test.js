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
  ';globalThis.api={buildBookcaseNavigationIndex,hasUnassignedCoreLocation};';
const context=vm.createContext({Map,Set});
vm.runInContext(code,context);
const {buildBookcaseNavigationIndex,hasUnassignedCoreLocation}=context.api;

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
assert.deepEqual({...index.counts},{copies:8,located:5,missing:1,partial:2,rooms:2,bookcases:3,shelves:4});
assert.deepEqual(Array.from(index.rooms,item=>item.label),['Office','Study']);
const office=index.rooms[0],study=index.rooms[1];
assert.equal(office.bookcases[0].label,'Bookcase 1');
assert.deepEqual(ids(office.bookcases[0].shelves[0].copies),['copy-d']);
assert.deepEqual(Array.from(study.bookcases,item=>item.label),['Bookcase 2','Bookcase 10']);
assert.deepEqual(Array.from(study.bookcases[0].shelves,item=>item.label),['Shelf 2','Shelf 10']);
assert.deepEqual(ids(study.bookcases[0].shelves[0].copies),['copy-a','copy-h'],'Same-shelf physical Copies must not collapse');
assert.deepEqual(ids(study.bookcases[0].shelves[1].copies),['copy-b'],'Shelf inventory must exclude neighbouring shelves');
assert.deepEqual(ids(study.bookcases[1].shelves[0].copies),['copy-c'],'Another Edition belongs to its own exact shelf');
assert.deepEqual(ids(index.missing),['copy-e']);
assert.deepEqual(ids(index.partial),['copy-f','copy-g']);
assert.equal(hasUnassignedCoreLocation(fixture.copies[4].location),true,'Use the same missing-location rule as Find / Put Away');
assert.equal(JSON.stringify(fixture),before,'Read-only hierarchy derivation must not mutate native catalog data');

const moved=JSON.parse(JSON.stringify(fixture));
moved.copies.find(copy=>copy.id==='copy-b').location=location('Office','Bookcase 1','Shelf 1');
const movedIndex=buildBookcaseNavigationIndex(moved);
assert.deepEqual(ids(movedIndex.rooms[0].bookcases[0].shelves[0].copies),['copy-b','copy-d']);
assert.deepEqual(ids(movedIndex.rooms[1].bookcases[0].shelves[0].copies),['copy-a','copy-h']);
assert.equal(movedIndex.rooms[1].bookcases[0].shelves.length,1,'Empty shelf disappears after moving its final Copy');
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
assert.equal(largeIndex.rooms.reduce((sum,room)=>sum+room.copies.length,0),5000);
assert.match(source,/\['bookcases','Bookcases'\]/,'Bookcases must be discoverable in Library tabs');
assert.match(source,/if\(browseMode==='bookcases'\)return <BookcasesLibraryView/,'Bookcases tab must render the physical view');

console.log('Bookcases hierarchy, exact shelf inventories, Copy counts, fallback groups, natural sort, and relocation: PASS');
console.log('Collections independence, read-only derivation, serialization, and Library entry point: PASS');
