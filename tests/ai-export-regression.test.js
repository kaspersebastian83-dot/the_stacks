#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

async function main() {
const {createAiMarkdown, createLibraryCsv, localDateStamp} = await import('../src/core/library-export.mjs');

const fixture = {
  works: [{id:'w1',title:'The "Dawn", Again',author:'David Graeber, David Wengrow',authors:'David Graeber, David Wengrow',originalYear:'2011',tags:['Anthropology'],notes:'Work note'}],
  editions: [
    {id:'e1',workId:'w1',title:'The "Dawn", Again',isbn:'9780306406157',publisher:'Éditions, Ltd.',year:'2021',language:'Français',edition:'First',format:'Hardcover'},
    {id:'e2',workId:'w1',title:'The Dawn — paperback',isbn:'9780140449112',publisher:'Archive Press',year:'2023',language:'English',edition:'Second',format:'Paperback'}
  ],
  copies: [
    {id:'c1',workId:'w1',editionId:'e1',status:'read',rating:5,tags:['signed; annotated'],collections:['History','Anthropology'],location:{room:'Living Room',bookcase:'Main Bookcase',shelf:'3',box:'2',position:'4'},copyNotes:'Signed copy',notes:'line one, "quoted"\nline two',privateReview:'Never export this',addedAt:'2026-01-02'},
    {id:'c2',workId:'w1',editionId:'e1',status:'reading',rating:3,tags:['reading copy'],collections:['History'],location:{room:'Office',bookcase:'Bookcase 1',shelf:'5',box:''},notes:'Copy two notes'},
    {id:'c3',workId:'w1',editionId:'e2',status:'unread',rating:0,tags:[],collections:[],location:{room:'',bookcase:'',shelf:'',box:''},notes:''},
    {id:'c4',workId:'w1',editionId:'e2',status:'want',rating:0,tags:[],collections:[],location:{room:'Study',bookcase:'',shelf:'',box:''},notes:''}
  ]
};

function parseCsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(char==='"')quoted=false;else cell+=char;continue;}
    if(char==='"'){quoted=true;continue;}
    if(char===','){row.push(cell);cell='';continue;}
    if(char==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;continue;}
    cell+=char;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}

const original=JSON.stringify(fixture);
const csv=createLibraryCsv(fixture);
const rows=parseCsv(csv);
const header=rows[0];
const col=name=>header.indexOf(name);
assert.equal(rows.length,5,'CSV has a header and one row per physical Copy');
assert.ok(rows.every(row=>row.length===header.length),'Every CSV row matches the header width');
assert.equal(new Set(rows.slice(1).map(row=>row[col('Copy ID')])).size,4,'Every Copy has its own CSV row and ID');
assert.equal(rows[1][col('Work title')],'The "Dawn", Again','CSV quotes and commas in titles round-trip');
assert.equal(rows[1][col('Authors')],'David Graeber, David Wengrow','CSV commas in authors round-trip');
assert.equal(rows[1][col('Publisher')],'Éditions, Ltd.','UTF-8 and commas survive CSV escaping');
assert.equal(rows[1][col('ISBN')],'9780306406157');
assert.equal(rows[1][col('Room')],'Living Room');
assert.equal(rows[1][col('Bookcase')],'Main Bookcase');
assert.equal(rows[1][col('Shelf')],'3');
assert.equal(rows[1][col('Box')],'2');
assert.equal(rows[1][col('Position')],'4');
assert.equal(rows[1][col('Copy notes')],'Signed copy');
assert.equal(rows[1][col('Notes')],'line one, "quoted"\nline two','Quoted multiline notes remain one CSV cell');
assert.deepEqual(JSON.parse(rows[1][col('Tags')]),['Anthropology','signed; annotated']);
assert.deepEqual(JSON.parse(rows[1][col('Collections')]),['History','Anthropology']);
assert.equal(rows[1][col('Reading status')],'Read');
assert.equal(rows[1][col('Rating')],'5');
assert.equal(rows[1][col('Date added')],'2026-01-02');
assert.equal(rows[3][col('Room')],'','Missing location is represented by empty structured location fields');
assert.equal(rows[4][col('Room')],'Study','Partial location values are preserved without fabricated fields');
assert.equal(csv.includes('[object Object]'),false);
assert.equal(csv.includes('Never export this'),false,'Private review content is omitted from CSV');

const markdown=createAiMarkdown(fixture,['History','Anthropology','Unused collection']);
assert.match(markdown,/# The Stacks — Personal Library Export/);
assert.match(markdown,/A Work is the intellectual work; an Edition is a specific publication; a Copy is a physical item I own\./);
assert.match(markdown,/- Works: 1\n- Editions: 2\n- Physical Copies: 4/);
assert.match(markdown,/- Read: 1/);
assert.match(markdown,/- Currently reading: 1/);
assert.match(markdown,/- Unread: 1/);
assert.match(markdown,/- Want to read: 1/);
assert.match(markdown,/- Copies with a recorded location: 2\n- Copies needing a location: 2/);
assert.match(markdown,/- Collections: 3/,'Library summary also counts empty catalog Collections');
assert.match(markdown,/#### Edition 1/);
assert.match(markdown,/#### Edition 2/);
assert.ok(markdown.includes('Main Bookcase → Shelf 3 → Room: Living Room → Box 2 → \\#4'));
assert.match(markdown,/Bookcase 1 → Shelf 5 → Room: Office/);
assert.match(markdown,/Copy: Not assigned/);
assert.match(markdown,/Copy: Room: Study/,'Partial recorded location is kept as recorded');
assert.match(markdown,/signed; annotated/);
assert.match(markdown,/Collections: History; Anthropology/);
assert.match(markdown,/line one, "quoted"/);
assert.doesNotMatch(markdown,/c1|c2|c3|c4|Never export this/,'AI export omits IDs and private reviews');
assert.doesNotMatch(markdown,/undefined|null|\[object Object\]/);
assert.equal(JSON.stringify(fixture),original,'Both export builders are read-only');
assert.equal(localDateStamp(new Date(2026,8,23,23,59)),'2026-09-23','Filenames use local calendar dates');

const largeFixture={works:[{id:'large-work',title:'Large fixture'}],editions:[{id:'large-edition',workId:'large-work',title:'Large fixture'}],copies:Array.from({length:5000},(_,index)=>({id:`large-copy-${index}`,workId:'large-work',editionId:'large-edition',status:'unread',location:{}}))};
assert.equal(createLibraryCsv(largeFixture).split('\r\n').length,5001,'CSV scales to several thousand physical Copies');
assert.match(createAiMarkdown(largeFixture),/- Physical Copies: 5000/,'Markdown summary scales to several thousand physical Copies');

console.log('Full-library CSV identity, escaping, Unicode, locations, and personal fields: PASS');
console.log('AI Markdown structure, summary, privacy-safe fields, and read-only behavior: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
