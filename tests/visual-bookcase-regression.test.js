#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./load-production-source');

function slice(start,end){const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from,`Could not extract production ${start}`);return source.slice(from,to);}
const code=slice('function blankLocation','function PhysicalLocation')+
  slice('function compareNaturalLocationValue','function physicalLocationSortEntry')+
  slice('function buildBookcaseNavigationIndex','function LibraryBrowseTabs')+
  ';globalThis.api={normalizeLocation,buildBookcaseNavigationIndex,compareBookcaseCopyPosition,sortBookcaseShelfCopies,bookcaseUnassignedShelfCopies,visualBookPresentation};';
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
const presentationA=api.visualBookPresentation(catalog.copies[0],catalog.copies[0]);
const presentationARepeat=api.visualBookPresentation(catalog.copies[0],catalog.copies[0]);
const presentationB=api.visualBookPresentation(catalog.copies[1],catalog.copies[1]);
assert.deepEqual({...presentationA},{...presentationARepeat},'same Copy presentation is stable across repeated derivations');
assert.equal(presentationA.background,presentationB.background,'Copies of the same Edition share a visual family');
assert.notDeepEqual([presentationA.width,presentationA.height],[presentationB.width,presentationB.height],'Copies can have subtle deterministic visual differentiation');
assert.ok(presentationA.width>=42&&presentationA.width<=54&&presentationA.height>=146&&presentationA.height<=174);
const manyCopies=Array.from({length:40},(_,index)=>({id:'long-shelf-'+index,editionId:'long-edition',title:'Volume '+index,location:loc('Shelf 1',String(index+1))}));
assert.equal(api.sortBookcaseShelfCopies(manyCopies).length,40,'long shelves retain every Copy');
assert.deepEqual(Array.from(api.sortBookcaseShelfCopies(manyCopies).slice(0,3),copy=>copy.id),['long-shelf-0','long-shelf-1','long-shelf-2']);
assert.equal(JSON.stringify(catalog),before,'deterministic presentation calculation is read-only');

assert.match(source,/function VisualBookcase\(/);
assert.match(source,/aria-label=\{'Select '\+label\}/,'visual Copy selection identifies title, author, and complete location accessibly');
assert.match(source,/copiesById\.get\(selectedCopyId\)/,'the selected action panel targets the exact Copy ID');
assert.match(source,/onEdit\(selectedBook\)/,'Open details targets the selected Copy view');
assert.match(source,/onMoveRequest\(\[selectedCopy\.id\]\)/,'selected Copy move uses existing exact-Copy workflow');
assert.match(source,/onOpenScan\(\{room,bookcase:bookcase\.label,shelf:shelf\.label/,'scan-to-shelf passes an explicit editable destination');
assert.match(source,/List \/ Inventory/,'existing inventory navigation remains available');
assert.match(source,/Visual Bookcase/);
assert.match(source,/Books not assigned to a Shelf/);
assert.match(source,/copy\.location\?\.position/,'position remains Copy.location metadata');
assert.match(source,/visual-copy-spine-cover/,'existing cover art is reused as a narrow spine accent');
assert.match(source,/visual-copy-title/,'spine title remains visible and can be read fully on selection');
assert.match(source,/Locate on Shelf/,'selected Copy exposes a physical-location action');
assert.match(source,/aria-pressed=\{isSelected\}/,'selection state is available to assistive technology');
assert.match(source,/role="Selected physical Copy"|aria-label="Selected physical Copy"/);
assert.match(source,/bookcaseUnassignedShelfCopies\(index\.partial/,'copies without a Shelf are never assigned to one');
const presentationSource=source.slice(source.indexOf('function visualBookPresentation'),source.indexOf('function LibraryBrowseTabs'));
assert.doesNotMatch(presentationSource,/Math\.random|crypto\.random|Date\.now/,'visual identity never uses random or time-varying values');
assert.match(source,/@media\(max-width:700px\)/,'mobile changes spine labels to readable horizontal cards');
assert.match(source,/prefers-reduced-motion:reduce/,'spine transitions respect reduced-motion preference');
console.log('Visual Bookcase exact Copy identity, natural shelves, numeric positions, move/scan integration, incomplete locations, and read-only derivation: PASS');
console.log('Stable muted spine styling, selected Copy actions, long-shelf density, and responsive accessibility: PASS');
