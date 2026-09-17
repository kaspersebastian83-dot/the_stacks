#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');

const html=require('./load-production-source');
const isbnSource=require('./load-production-isbn-source');
const slice=(start,end)=>{
  const from=html.indexOf(start),to=html.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Could not extract ${start}`);
  return html.slice(from,to);
};
const runtime=`
function uniq(arr){return [...new Set((arr||[]).map(s=>String(s||'').trim()).filter(Boolean))];}
function personListInput(value){return Array.isArray(value)?value.join('; '):String(value||'');}
const STATUS_LABEL={unread:'Unread',want:'Want to read',reading:'Currently reading',read:'Read',dnf:'Did not finish',reference:'Reference only'};
function statusLabel(status){return STATUS_LABEL[status]||'Unread';}
function normalizeLocation(loc){return {room:'',bookcase:'',shelf:'',box:'',position:'',...(loc||{})};}
function locationText(book){const l=normalizeLocation(book.location);return [l.room,l.bookcase,l.shelf&&'Shelf '+l.shelf,l.box&&'Box '+l.box,l.position&&'#'+l.position].filter(Boolean).join(' · ');}
function collectionNames(book){return book.collections||[];}
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
`;
const searchSource=slice('function stripQuotes','function csvEscape');
const browseSource=slice('function filterLibraryBrowseIndex','function filterLibraryBrowseBooks');
const context=vm.createContext({console});
vm.runInContext(runtime+isbnSource+searchSource+browseSource+`;globalThis.api={normalizeSearchText,queryTokens,matches,smartTokenMatch,rankBooksForSearch,filterLibraryBrowseIndex,positiveFreeTextTokens};`,context);
const {normalizeSearchText,queryTokens,matches,rankBooksForSearch,filterLibraryBrowseIndex}=context.api;

const book=(id,values={})=>({id,title:'Untitled',authors:'',series:'',seriesNumber:'',originalPublicationYear:'',translators:[],editors:[],isbn:'',publisher:'',year:'',edition:'',format:'',language:'',condition:'',acquisitionSource:'',copyNotes:'',lentTo:'',privateReview:'',status:'unread',location:{room:'',bookcase:'',shelf:'',box:'',position:''},collections:[],tags:[],notes:'',rating:0,copyCount:1,reviewed:true,...values});
const fixture=[
  book('knausgaard',{title:'My Struggle',authors:'Karl Ove Knausgård'}),
  book('marquez',{title:'One Hundred Years of Solitude',authors:'Gabriel García Márquez'}),
  book('ai',{title:'The AI-Driven Leader',authors:'Geoff Woods',isbn:'9780306406157',status:'read',rating:5}),
  book('oconnor',{title:'Wise Blood',authors:"Flannery O'Connor"}),
  book('wizards',{title:'Market Wizards',authors:'Jack D. Schwager',tags:['finance']}),
  book('diamond',{title:'Guns, Germs, and Steel',authors:'Jared Diamond',tags:['anthropology']}),
  book('discworld',{title:'Guards! Guards!',authors:'Terry Pratchett',series:'Discworld'}),
  book('translated',{title:'Love in the Time of Cholera',authors:'Gabriel García Márquez',translators:['Edith Grossman'],editors:['Robert Silverberg']}),
  book('copy-a',{title:'Shared Edition',authors:'Copy Author',isbn:'9781804093634',workId:'work-1',editionId:'edition-1',copyId:'copy-a',location:{room:'Study',bookcase:'A',shelf:'3'},collections:['Classics']}),
  book('copy-b',{title:'Shared Edition',authors:'Copy Author',isbn:'9781804093634',workId:'work-1',editionId:'edition-1',copyId:'copy-b',location:{room:'Study',bookcase:'A',shelf:'4'},collections:['Classics']})
];
const fixtureBefore=JSON.stringify(fixture);
const ids=query=>fixture.filter(item=>matches(item,query,fixture)).map(item=>item.id);

assert.equal(normalizeSearchText('Knausgård'),'knausgard');
assert.equal(normalizeSearchText('García Márquez'),'garcia marquez');
assert.equal(normalizeSearchText('The AI–Driven Leader'),'the ai driven leader');
assert.equal(normalizeSearchText("O'Connor"),'oconnor');
assert.deepEqual(Array.from(queryTokens('author:"Ursula Le Guin" -tag:archive')),['author:Ursula Le Guin','-tag:archive']);
assert.deepEqual(ids('knausgard'),['knausgaard']);
assert.deepEqual(ids('garcia marquez'),['marquez','translated']);
assert.deepEqual(ids('ai driven'),['ai']);
assert.deepEqual(ids('oconnor'),['oconnor']);
assert.deepEqual(ids('dimaond'),['diamond']);
assert.deepEqual(ids('wizrds'),['wizards']);
assert.deepEqual(ids('ai'),['ai']);
assert.deepEqual(ids('market wizard'),['wizards']);
assert.deepEqual(ids('"Market Wizards"'),['wizards']);
assert.deepEqual(ids('market -tag:finance'),[]);
assert.deepEqual(ids('status:read rating>=4'),['ai']);
assert.deepEqual(ids('author:knausgard'),['knausgaard']);
assert.deepEqual(ids('author:"Gabriel García Márquez"'),['marquez','translated']);
assert.deepEqual(ids('series:discworld'),['discworld']);
assert.deepEqual(ids('subject:anthropology'),['diamond']);
assert.deepEqual(ids('translator:"Edith Grossman"'),['translated']);
assert.deepEqual(ids('editor:"Robert Silverberg"'),['translated']);
assert.deepEqual(ids('physical-shelf:3'),['copy-a']);
assert.deepEqual(ids('location-shelf:4'),['copy-b']);
assert.deepEqual(ids('shelf:Classics'),['copy-a','copy-b']);
assert.deepEqual(ids('978-1-80409-363-4'),['copy-a','copy-b']);
assert.deepEqual(ids('isbn:978-1-80409-363-4'),['copy-a','copy-b']);
assert.deepEqual(ids('9781804093635'),[]);
assert.deepEqual(ids('shared edition'),['copy-a','copy-b']);
assert.deepEqual(fixture.filter(item=>matches(item,'shared edition',fixture)).map(item=>item.copyId),['copy-a','copy-b']);
assert.equal(JSON.stringify(fixture),fixtureBefore,'Search must not mutate catalog data');

const relevance=[book('history',{title:'Artificial Intelligence: A History',notes:'ai driven leader'}),book('notes',{title:'Collected Notes',notes:'ai driven leader'}),fixture[2]];
assert.equal(rankBooksForSearch(relevance.filter(item=>matches(item,'ai driven leader',relevance)),'ai driven leader')[0].id,'ai');
assert.strictEqual(rankBooksForSearch(fixture,''),fixture);
assert.strictEqual(rankBooksForSearch(fixture,'status:read'),fixture);
const customShelfOrder=[fixture[9],fixture[8]];
assert.deepEqual(customShelfOrder.filter(item=>matches(item,'shared',customShelfOrder)).map(item=>item.id),['copy-b','copy-a']);
assert.deepEqual(Array.from(filterLibraryBrowseIndex([{label:'Knausgård'},{label:'Earthsea'},{label:'Archaeology'}],'knausgard'),x=>x.label),['Knausgård']);
assert.deepEqual(Array.from(filterLibraryBrowseIndex([{label:'Knausgård'},{label:'Earthsea'},{label:'Archaeology'}],'erthsea'),x=>x.label),['Earthsea']);

const synthetic=Array.from({length:5000},(_,i)=>book(`synthetic-${i}`,{title:i%997===0?'The Diamond Catalog '+i:'Catalog Volume '+i,authors:i%389===0?'Karl Ove Knausgård':'Author '+(i%400),isbn:i===389?'9781804093634':'',tags:['subject-'+(i%40)],status:i%2?'read':'unread',rating:i%5,location:{room:'Room '+(i%8),shelf:String(i%20)}}));
const timings={};
for(const query of ['diamond','author:knausgard','dimaond','978-1-80409-363-4','catalog volume 4999','status:read rating>=4']){
  const start=performance.now();
  const found=synthetic.filter(item=>matches(item,query,synthetic));
  if(context.api.positiveFreeTextTokens(query).length)rankBooksForSearch(found,query);
  timings[query]=Number((performance.now()-start).toFixed(2));
}

console.log('Search regression fixtures: PASS');
console.log('Synthetic copies:',synthetic.length);
console.log('Approximate timings (ms):',JSON.stringify(timings));
