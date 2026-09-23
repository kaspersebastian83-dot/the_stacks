#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./load-production-source');

function slice(start,end){const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,`Could not extract production ${start}`);return source.slice(from,to);}
const code=slice('function blankLocation','function PhysicalLocation')+
  slice('function compareNaturalLocationValue','function physicalLocationSortEntry')+
  slice('function buildBookcaseNavigationIndex','function LibraryBrowseTabs')+
  ';globalThis.api={normalizeLocation,buildBookcaseNavigationIndex,compareBookcaseCopyPosition,sortBookcaseShelfCopies,bookcaseUnassignedShelfCopies};';
const context=vm.createContext({Map,Set});vm.runInContext(code,context);
const api=context.api;
const loc=(shelf,position='',box='')=>({room:'Study',bookcase:'Bookcase 2',shelf,box,position});
const catalog={works:[{id:'work-1'}],editions:[{id:'edition-1',workId:'work-1'},{id:'edition-2',workId:'work-1'}],copies:[
  {id:'copy-10',workId:'work-1',editionId:'edition-1',isbn:'same-isbn',title:'Shelf 2 / Position 10',location:loc('Shelf 2','10','Box A')},
  {id:'copy-2',workId:'work-1',editionId:'edition-1',isbn:'same-isbn',title:'Shelf 2 / Position 2',location:loc('Shelf 2','2')},
  {id:'copy-no-position',workId:'work-1',editionId:'edition-2',isbn:'same-isbn',title:'No position',location:loc('Shelf 2')},
  {id:'copy-shelf-10',workId:'work-1',editionId:'edition-2',title:'Shelf 10',location:loc('Shelf 10','1')},
  {id:'copy-unassigned-shelf',workId:'work-1',editionId:'edition-2',title:'Unassigned shelf',location:loc('')},
  {id:'copy-partial-other',workId:'work-1',editionId:'edition-2',title:'Other room',location:{room:'Office',bookcase:'Bookcase 2',shelf:'',box:'',position:''}}
]};
const before=JSON.stringify(catalog),index=api.buildBookcaseNavigationIndex(catalog);
assert.deepEqual(Array.from(index.rooms,item=>item.label),['Study']);
const bookcase=index.rooms[0].bookcases[0];
assert.deepEqual(Array.from(bookcase.shelves,item=>item.label),['Shelf 2','Shelf 10'],'Shelf names use existing natural sort');
assert.deepEqual(Array.from(api.sortBookcaseShelfCopies(bookcase.shelves[0].copies),copy=>copy.id),['copy-2','copy-10','copy-no-position'],'numeric positions sort numerically and missing positions follow deterministically');
assert.equal(new Set(bookcase.shelves[0].copies.map(copy=>copy.id)).size,3,'each physical Copy remains distinct even with duplicate ISBNs and Editions');
assert.deepEqual(Array.from(api.bookcaseUnassignedShelfCopies(index.partial,'Study','Bookcase 2'),copy=>copy.id),['copy-unassigned-shelf']);
assert.equal(bookcase.shelves[0].copies.find(copy=>copy.id==='copy-10').location.box,'Box A','Box data remains part of Copy.location');
assert.equal(JSON.stringify(catalog),before,'Opening/deriving the visual inventory must not mutate source catalog data');
const moved={...catalog,copies:catalog.copies.map(copy=>copy.id==='copy-2'?{...copy,location:loc('Shelf 10','3')}:copy)};
const afterMove=api.buildBookcaseNavigationIndex(moved).rooms[0].bookcases[0];
assert.ok(!afterMove.shelves.find(shelf=>shelf.label==='Shelf 2').copies.some(copy=>copy.id==='copy-2'));
assert.ok(afterMove.shelves.find(shelf=>shelf.label==='Shelf 10').copies.some(copy=>copy.id==='copy-2'));
assert.equal(moved.copies.find(copy=>copy.id==='copy-2').workId,'work-1');
assert.equal(moved.copies.find(copy=>copy.id==='copy-2').editionId,'edition-1');
assert.equal(catalog.copies.find(copy=>copy.id==='copy-10').location.position,'10','moving one Copy does not modify its sibling');

assert.match(source,/function VisualBookcase\(/);
assert.match(source,/aria-label=\{'Open '\+label\}/,'visual Copy action identifies title, author, Shelf, and Position accessibly');
assert.match(source,/onEdit\(book\)/,'visual Copy activation opens that Copy record');
assert.match(source,/onMoveRequest\(\[copy\.id\]\)/,'visual move uses existing exact-Copy move workflow');
assert.match(source,/onOpenScan\(\{room,bookcase:bookcase\.label,shelf:shelf\.label/,'scan-to-shelf passes an explicit editable destination');
assert.match(source,/List \/ Inventory/,'existing inventory navigation remains available');
assert.match(source,/Visual Bookcase/);
assert.match(source,/Books not assigned to a Shelf/);
assert.match(source,/copy\.location\?\.position/,'position remains Copy.location metadata');
assert.match(source,/visual-copy-cover/,'cover image and text-spine fallback are supported');
assert.match(source,/bookcaseUnassignedShelfCopies\(index\.partial/,'copies without a Shelf are never assigned to one');
console.log('Visual Bookcase exact Copy identity, natural shelves, numeric positions, move/scan integration, incomplete locations, and read-only derivation: PASS');
