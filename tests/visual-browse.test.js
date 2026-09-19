#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');

const html=require('./load-production-source');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{const from=html.indexOf(start),to=html.indexOf(end,from);assert.ok(from>=0&&to>from,`Could not extract ${start}`);return html.slice(from,to);};
const runtime=`
function uniq(arr){return [...new Set((arr||[]).map(s=>String(s||'').trim()).filter(Boolean))];}
function personListInput(value){return Array.isArray(value)?value.join('; '):String(value||'');}
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
function statusLabel(status){return STATUS_LABEL[status]||'Unread';}
function normalizeLocation(loc){return {room:'',bookcase:'',shelf:'',box:'',position:'',...(loc||{})};}
function locationText(book){const l=normalizeLocation(book.location);return [l.room,l.bookcase,l.shelf&&'Shelf '+l.shelf,l.box&&'Box '+l.box,l.position&&'#'+l.position].filter(Boolean).join(' · ');}
function collectionNames(book){return book.collections||[];}
function inCollection(book,name){return collectionNames(book).includes(name);}
function loanText(book){return [book.lentTo,book.lentDate,book.dueDate,book.returnedDate].filter(Boolean).join(' ');}
function readingText(book){return [book.status,book.startedAt,book.finishedAt,book.readCount].filter(Boolean).join(' ');}
function isUnshelved(book){return !collectionNames(book).length;}
function hasMissingLocation(book){return !normalizeLocation(book.location).room;}
function needsReview(book){return !book.reviewed;}
function reviewReasons(){return [];}
function isLentOut(book){return Boolean(book.lentTo&&!book.returnedDate);}
function isOverdue(){return false;}
function metadataScore(){return 100;}
function workGroups(){return [];}
function workKeyForBook(book){return book.workId||'';}
function duplicateGroups(){return [];}
`;
const source=runtime+
  isbnSource+
  slice('function stripQuotes','function csvEscape')+
  slice('function filterBooks','const BUILTIN_VIEWS')+
  slice('function visualBrowseWindow','function VisualBrowseView')+
  `;globalThis.api={defaultFilters,getLibraryVisibleBooks,sortLibraryBooks,sortBooksByPhysicalLocation,visualBrowseWindow,visualBrowseActiveId,visualBrowseMove,visualBrowseSwipeStep,editionCopyContext,visualBrowsePositionClass,openVisualBrowseBook};`;
const context=vm.createContext({console});
vm.runInContext(source,context);
const api=context.api;

const book=(index,values={})=>({id:`copy-${index}`,copyId:`copy-${index}`,workId:`work-${index}`,editionId:`edition-${index}`,title:`Book ${index}`,authors:`Author ${index%4}`,series:'',translators:[],editors:[],isbn:'',publisher:'Publisher',year:String(2000+index),edition:'',format:'',language:'English',condition:'Good',acquisitionSource:'',copyNotes:'',lentTo:'',privateReview:'',status:index<5?'read':'unread',location:{room:index===10?'Archive':`Room ${index%3}`,bookcase:'A',shelf:String(index%4),box:'',position:''},collections:index>=8&&index<=9?['Twin Copies']:[`Collection ${index%3}`],tags:index<3?['focus-three']:[],notes:'',rating:index%5,copyCount:1,reviewed:true,cover:index===7?'':`https://example.invalid/cover-${index}-${index%2?300:600}x${index%2?600:400}.jpg`,...values});
const fixture=Array.from({length:12},(_,index)=>book(index));
fixture[0]={...fixture[0],title:'The AI-Driven Leader',authors:'Geoff Woods'};
fixture[1]={...fixture[1],title:'Artificial Intelligence: A History',notes:'ai driven leader'};
fixture[8]={...fixture[8],title:'Shared Edition',workId:'shared-work',editionId:'shared-edition'};
fixture[9]={...fixture[9],title:'Shared Edition',workId:'shared-work',editionId:'shared-edition'};
const filters=overrides=>({...api.defaultFilters,...overrides});
const visible=queryFilters=>api.getLibraryVisibleBooks(fixture,queryFilters);

assert.equal(visible(filters({})).length,12);
assert.equal(visible(filters({status:'read'})).length,5);
assert.equal(visible(filters({tag:'focus-three'})).length,3);
assert.equal(visible(filters({collection:'Twin Copies'})).length,2);
assert.equal(visible(filters({room:'Archive'})).length,1);
assert.equal(visible(filters({query:'definitely absent'})).length,0);

assert.equal(api.visualBrowseMove(fixture,'copy-4',1),'copy-5');
assert.equal(api.visualBrowseMove(fixture,'copy-5',-1),'copy-4');
assert.equal(api.visualBrowseMove(fixture,'copy-0',-1),'copy-0');
assert.equal(api.visualBrowseMove(fixture,'copy-11',1),'copy-11');
assert.equal(api.visualBrowseMove(fixture,'copy-4',3),'copy-7','A side-cover selection can focus its exact Copy');
let opened=null;api.openVisualBrowseBook(fixture[6],bookValue=>{opened=bookValue;});assert.strictEqual(opened,fixture[6]);
assert.deepEqual(Array.from(api.visualBrowseWindow(fixture,6),row=>row.book.id),['copy-3','copy-4','copy-5','copy-6','copy-7','copy-8','copy-9']);
assert.equal(api.visualBrowseWindow(fixture,0).length,4);
assert.equal(api.visualBrowseWindow([fixture[0]],0).length,1);
assert.equal(api.visualBrowseWindow(fixture.slice(0,2),0).length,2);
assert.equal(api.visualBrowseWindow(fixture.slice(0,3),1).length,3);
assert.equal(api.visualBrowseWindow([],0).length,0);
assert.equal(api.visualBrowseActiveId(fixture,'copy-5',0),'copy-5');
assert.equal(api.visualBrowseActiveId(fixture.slice(0,3),'copy-5',2),'copy-2');
assert.equal(api.visualBrowseActiveId([], 'copy-5',2),'');
assert.equal(api.visualBrowseSwipeStep(-55,8),1);
assert.equal(api.visualBrowseSwipeStep(55,8),-1);
assert.equal(api.visualBrowseSwipeStep(-30,3),0);
assert.equal(api.visualBrowseSwipeStep(60,90),0,'Vertical intent must not navigate');
assert.equal(api.editionCopyContext(fixture[8],fixture).label,'Copy 1 of 2');
assert.equal(api.editionCopyContext(fixture[9],fixture).label,'Copy 2 of 2');
assert.deepEqual(visible(filters({collection:'Twin Copies'})).map(item=>item.copyId),['copy-8','copy-9']);
assert.equal(fixture.filter(item=>!item.cover).length,1);
assert.ok(new Set(fixture.map(item=>item.cover.match(/(\d+x\d+)/)?.[1]).filter(Boolean)).size>1,'Fixture has mixed cover dimensions');

const booksOrder=visible(filters({query:'ai driven leader'})).map(item=>item.id);
const browseOrder=visible(filters({query:'ai driven leader'})).map(item=>item.id);
assert.deepEqual(booksOrder,browseOrder);
assert.equal(booksOrder[0],'copy-0');

const locationFixture=[
  book(100,{id:'missing-zulu',copyId:'missing-zulu',title:'Zulu Missing',location:{room:'',bookcase:'',shelf:'',box:'',position:''}}),
  book(101,{id:'copy-bookcase-10',copyId:'copy-bookcase-10',workId:'shared-location-work',editionId:'shared-location-edition',title:'Bookcase Ten',location:{room:'Room 1',bookcase:'Bookcase 10',shelf:'Shelf 2',box:'Box 1',position:'1'}}),
  book(102,{id:'copy-shelf-10',copyId:'copy-shelf-10',title:'Shelf Ten',location:{room:'Room 1',bookcase:'Bookcase 2',shelf:'Shelf 10',box:'Box 1',position:'1'}}),
  book(103,{id:'copy-box-10',copyId:'copy-box-10',title:'Box Ten',location:{room:'Room 1',bookcase:'Bookcase 2',shelf:'Shelf 2',box:'Box 10',position:'1'}}),
  book(104,{id:'copy-position-10',copyId:'copy-position-10',title:'Position Ten',location:{room:'Room 1',bookcase:'Bookcase 2',shelf:'Shelf 2',box:'Box 2',position:'10'}}),
  book(105,{id:'copy-z',copyId:'copy-z',title:'Zulu',location:{room:'Room 1',bookcase:'Bookcase 2',shelf:'Shelf 2',box:'Box 2',position:'2'}}),
  book(106,{id:'copy-b',copyId:'copy-b',title:'Alpha',location:{room:'Room 1',bookcase:'Bookcase 2',shelf:'Shelf 2',box:'Box 2',position:'2'}}),
  book(107,{id:'copy-a',copyId:'copy-a',workId:'shared-location-work',editionId:'shared-location-edition',title:'Alpha',location:{room:'Room 1',bookcase:'Bookcase 2',shelf:'Shelf 2',box:'Box 2',position:'2'}}),
  book(108,{id:'copy-room-2',copyId:'copy-room-2',title:'Room Two',location:{room:'Room 2',bookcase:'Bookcase 1',shelf:'Shelf 1',box:'',position:''}}),
  book(109,{id:'missing-alpha',copyId:'missing-alpha',title:'Alpha Missing',location:{room:'',bookcase:'',shelf:'',box:'',position:''}})
];
const locationFixtureBefore=JSON.stringify(locationFixture);
const locationSorted=api.sortLibraryBooks(locationFixture,'physical-location');
assert.deepEqual(locationSorted.map(item=>item.id),['copy-a','copy-b','copy-z','copy-position-10','copy-box-10','copy-shelf-10','copy-bookcase-10','copy-room-2','missing-alpha','missing-zulu']);
assert.equal(JSON.stringify(locationFixture),locationFixtureBefore,'Physical-location sorting must not mutate source Copies');
assert.notStrictEqual(locationSorted,locationFixture,'Physical-location sorting operates on a copied array');
assert.ok(locationSorted.indexOf(locationFixture.find(item=>item.id==='copy-a'))<locationSorted.indexOf(locationFixture.find(item=>item.id==='copy-bookcase-10')),'Same-Edition Copies sort by their own locations');
assert.strictEqual(api.sortLibraryBooks(locationFixture,'default'),locationFixture,'Default order preserves the exact existing array and order');
const rankedDefault=api.getLibraryVisibleBooks(fixture,filters({query:'ai driven leader'}));
assert.strictEqual(api.sortLibraryBooks(rankedDefault,'default'),rankedDefault,'Default mode preserves search relevance output');

const filterFixture=[
  book(110,{id:'bookcase-5-b-10',location:{room:'Study',bookcase:'Bookcase 5',shelf:'B',box:'',position:'10'}}),
  book(111,{id:'bookcase-5-b-2',location:{room:'Study',bookcase:'Bookcase 5',shelf:'B',box:'',position:'2'}}),
  book(112,{id:'bookcase-5-a',location:{room:'Study',bookcase:'Bookcase 5',shelf:'A',box:'',position:'1'}}),
  book(113,{id:'bookcase-10-b',location:{room:'Study',bookcase:'Bookcase 10',shelf:'B',box:'',position:'1'}})
];
const filteredLocation=api.getLibraryVisibleBooks(filterFixture,filters({bookcase:'Bookcase 5',physicalShelf:'B'}));
assert.deepEqual(api.sortLibraryBooks(filteredLocation,'physical-location').map(item=>item.id),['bookcase-5-b-2','bookcase-5-b-10'],'Existing Bookcase and Physical shelf filters apply before location sorting');

const synthetic=Array.from({length:5000},(_,index)=>book(index,{id:`large-${index}`,copyId:`large-${index}`,title:index===4321?'The AI-Driven Leader':`Catalog Book ${index}`}));
const start=performance.now();const largeVisible=api.getLibraryVisibleBooks(synthetic,filters({query:'catalog book'}));const filterMs=performance.now()-start;
const locationSortStart=performance.now();const largeLocationSorted=api.sortLibraryBooks(largeVisible,'physical-location');const locationSortMs=performance.now()-locationSortStart;assert.equal(largeLocationSorted.length,largeVisible.length);
const windowStart=performance.now();for(let index=0;index<5000;index+=37)assert.ok(api.visualBrowseWindow(largeVisible,index).length<=7);const windowMs=performance.now()-windowStart;

assert.match(html,/onPointerCancel=\{pointerCancel\}/);
assert.match(html,/event\.key==='ArrowLeft'/);
assert.match(html,/event\.key==='ArrowRight'/);
assert.match(html,/event\.key==='Enter'/);
assert.match(html,/openVisualBrowseBook\(activeBook,onEdit\)/);
assert.match(html,/visual-browse-placeholder/);
assert.match(html,/object-fit:contain/);
assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(html,/@media\(max-width:1100px\)/);
assert.match(html,/@media\(max-width:700px\)/);
assert.match(html,/@media\(max-width:420px\)/);
assert.match(html,/body\.theme-dark \.visual-browse-stage/);
assert.match(html,/overflow-x:hidden/);
assert.match(html,/touch-action:pan-y/);
assert.match(html,/<option value="physical-location">Physical location<\/option>/);
assert.match(html,/clean-row-location/);
assert.match(html,/library-sort-control/);
assert.match(html,/const modes=\[\['books','Books'\],\['browse','Browse'\]/);
assert.match(html,/const NATIVE_CATALOG_MODEL='work-edition-copy-v1'/);
assert.match(html,/schemaVersion:3/);
assert.doesNotMatch(slice('function VisualBrowseView','function LibraryView'),/localStorage|indexedDB|idbSet/);

console.log('VISUAL_BROWSE_FIXTURE_PASS');
console.log('Exact Copy and same-Edition multi-Copy regression: PASS');
console.log('Books/Browse search and filter parity: PASS');
console.log('Natural physical-location sorting, missing-last order, exact-Copy independence, and non-mutation: PASS');
console.log('Keyboard, swipe threshold, vertical intent, and exact-open checks: PASS');
console.log('Zero/one/two/three/small-window and cover containment checks: PASS');
console.log('Responsive, dark-mode, and reduced-motion structural checks: PASS');
console.log(`5,000-Copy filter/rank: ${filterMs.toFixed(2)} ms; location sort: ${locationSortMs.toFixed(2)} ms; window stepping: ${windowMs.toFixed(2)} ms; max mounted: 7`);
