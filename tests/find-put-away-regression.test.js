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

const code=isbnSource+
  slice('function blankLocation','function locationText')+
  slice('function hasUnassignedCoreLocation','function PhysicalLocation')+
  slice('function lookupOwnedISBN','function migrationBackupPayload')+
  ';globalThis.api={lookupOwnedISBN,hasUnassignedCoreLocation,physicalLocationParts,toISBN10};';
const context=vm.createContext({Map,Set,console});
vm.runInContext(code,context);
const {lookupOwnedISBN,hasUnassignedCoreLocation,physicalLocationParts,toISBN10}=context.api;

const fixture={
  modelVersion:'work-edition-copy-v1',
  works:[{id:'work-odyssey',title:'The Odyssey',authors:'Homer'}],
  editions:[
    {id:'edition-a',workId:'work-odyssey',title:'The Odyssey',authors:'Homer',isbn:'9780140449112',publisher:'Synthetic Press',year:'2000'},
    {id:'edition-b',workId:'work-odyssey',title:'The Odyssey',authors:'Homer',isbn:'9780140268867'}
  ],
  copies:[
    {id:'copy-a',editionId:'edition-a',workId:'work-odyssey',location:{room:'Office',bookcase:'Bookcase 2',shelf:'4',box:'',position:''}},
    {id:'copy-b',editionId:'edition-a',workId:'work-odyssey',location:{room:'Living room',bookcase:'Main Bookcase',shelf:'3',box:'Box 1',position:''}},
    {id:'copy-other-edition',editionId:'edition-b',workId:'work-odyssey',location:{room:'Bedroom',bookcase:'Bookcase 1',shelf:'1',box:'',position:''}}
  ]
};
const before=JSON.stringify(fixture);
const oneCopyCatalog={...fixture,copies:[fixture.copies[0]]};
const one=lookupOwnedISBN(oneCopyCatalog,'978-0-14-044911-2');
assert.equal(one.state,'owned');
assert.equal(one.copies.length,1);
assert.equal(one.copies[0].copy.id,'copy-a');
assert.equal(one.copies[0].copy.location.bookcase,'Bookcase 2');
assert.equal(one.copies[0].edition.id,'edition-a');
assert.equal(one.copies[0].work.id,'work-odyssey');

const multiple=lookupOwnedISBN(fixture,'9780140449112');
assert.equal(multiple.state,'owned');
assert.deepEqual(Array.from(multiple.copies,item=>item.copy.id),['copy-a','copy-b']);
assert.notStrictEqual(multiple.copies[0].copy.location,multiple.copies[1].copy.location);
assert.equal(multiple.copies[0].copy.location.room,'Office');
assert.equal(multiple.copies[1].copy.location.room,'Living room');
assert.equal(multiple.copies.some(item=>item.copy.id==='copy-other-edition'),false,'Another Edition of the Work is excluded');
assert.equal(multiple.editions.length,1);

const isbn10=toISBN10('9780140449112');
assert.equal(lookupOwnedISBN(fixture,isbn10).isbn,'9780140449112','ISBN-10 resolves to the same Edition as ISBN-13');
assert.deepEqual(Array.from(lookupOwnedISBN(fixture,isbn10).copies,item=>item.copy.id),['copy-a','copy-b']);
assert.equal(lookupOwnedISBN(fixture,'9780306406157').state,'not-owned');
assert.equal(lookupOwnedISBN(fixture,'9780306406157').copies.length,0);
assert.equal(lookupOwnedISBN(fixture,'9780140449113').state,'invalid');
assert.equal(JSON.stringify(fixture),before,'Owned, unknown, and invalid lookup are read-only');
assert.equal(fixture.copies.length,3,'Lookup never creates another Copy');

const partial={room:'',bookcase:'',shelf:'',box:'Box 4',position:''};
assert.equal(hasUnassignedCoreLocation(partial),true,'Box-only location is incomplete without Bookcase and Shelf');
assert.equal(hasUnassignedCoreLocation({room:'',bookcase:'',shelf:'',box:'',position:''}),true,'Completely blank location is unassigned');
assert.equal(physicalLocationParts(fixture.copies[0].location).primary,'Bookcase 2 · Shelf 4');
assert.equal(hasUnassignedCoreLocation(fixture.copies[0].location),false);
const missingFixture={...fixture,copies:[{...fixture.copies[0],id:'copy-missing',location:{room:'',bookcase:'',shelf:'',box:'',position:''}}]};
const missingResult=lookupOwnedISBN(missingFixture,'9780140449112');
assert.equal(missingResult.state,'owned');
assert.equal(hasUnassignedCoreLocation(missingResult.copies[0].copy.location),true);

const roundTripped=JSON.parse(JSON.stringify({catalog:fixture})).catalog;
assert.equal(lookupOwnedISBN(roundTripped,'9780140449112').copies[0].copy.location.room,'Office');
assert.equal(lookupOwnedISBN(roundTripped,'9780140449112').copies[0].copy.location.bookcase,'Bookcase 2');
assert.equal(lookupOwnedISBN(roundTripped,'9780140449112').copies[0].copy.location.shelf,'4');

const findUI=slice('function FindPutAway','function AddBooksChooser');
assert.match(findUI,/function checkISBN\(raw,source='manual'\)/);
assert.match(findUI,/const lookup=onLookup\(raw\)/);
assert.match(findUI,/checkISBN\(raw,'manual'\)/);
assert.match(findUI,/onDetected=\{code=>checkISBN\(code,'camera'\)\}/);
assert.match(findUI,/onSubmit=\{submit\}/,'Manual and hardware scanner Enter use the same lookup submission');
assert.match(findUI,/onAddToLibrary\(current\.isbn\)/,'Adding requires the explicit Add to library action');
assert.doesNotMatch(findUI,/processScan\(|insertScannedBook\(|setBooks\(/,'Read-only lookup UI has no catalog write path');
assert.match(source,/function addFoundBook\(isbn\)/);
assert.match(source,/const added=await processScan\(isbn,\{quiet:true,silentReview:true\}\)/,'Explicit add reuses the existing intake workflow');
assert.match(source,/function CameraBarcodeScanner\(/);
assert.match(source,/mode="find"/);
assert.match(source,/onEditCopy\(copy\.id\)/,'Missing location edits target the exact Copy');
assert.match(source,/function PhysicalLocation\(/);
assert.match(source,/\['added','copy','review'\]\.includes\(result\?\.state\)/,'Existing intake accepts physical Copy results');

console.log('FIND_PUT_AWAY_REGRESSION_PASS');
console.log('Read-only ISBN ownership, one/multiple exact Copies, missing locations, and ISBN-10/13: PASS');
console.log('Shared camera/manual/hardware lookup and explicit existing intake path: PASS');
console.log('Native Copy locations survive synthetic JSON round-trip: PASS');
