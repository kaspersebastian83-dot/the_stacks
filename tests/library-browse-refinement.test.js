#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');

const html=require('./load-production-source');
const slice=(start,end)=>{const from=html.indexOf(start),to=html.indexOf(end,from);assert.ok(from>=0&&to>from,`Could not extract ${start}`);return html.slice(from,to);};
const runtime=`
function uniq(arr){return [...new Set((arr||[]).map(value=>String(value||'').trim()).filter(Boolean))];}
function migrationWorkKey(book){return String(book.title||'').trim().toLowerCase()+'|'+String(book.authors||'').trim().toLowerCase();}
function normalizeSearchText(value){return String(value||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu,' ').trim();}
function fuzzyTokenMatch(candidate,wanted){const value=normalizeSearchText(candidate.title);return value.includes(wanted)||Math.abs(value.length-wanted.length)<=1&&value.charAt(0)===wanted.charAt(0);}
`;
const source=runtime+
  slice('function libraryBrowseWorkKey','function LibraryBrowseTabs')+
  slice('function editionCopyContext','function visualBrowsePositionClass')+
  `;globalThis.api={libraryBrowseWorkKey,libraryBrowseWorkGroups,libraryAuthorNames,buildAuthorBrowseIndex,buildSeriesBrowseIndex,buildSubjectBrowseIndex,filterLibraryBrowseIndex,compareSeriesPosition,libraryBrowseCount,libraryBrowseInitial,groupLibraryBrowseIndex,libraryBrowseMissingCount,libraryBrowseCopyId,intersectLibraryBrowseCopies,visualBrowseSubset,libraryBrowseSelectionState,createVisualBrowseContext,visualBrowseContextAfterTab,editionCopyContext};`;
const context=vm.createContext({console,Set,Map});vm.runInContext(source,context);const api=context.api;

const copy=(id,values={})=>({id,copyId:id,workId:`work-${id}`,editionId:`edition-${id}`,title:`Book ${id}`,authors:'Author A',series:'Sequence',seriesNumber:'',tags:['History'],cover:`https://example.invalid/${id}.jpg`,status:'unread',location:{room:'Study',bookcase:'A',shelf:'1'},collections:[],...values});
const fixture=[
  copy('history-a',{workId:'history-work',editionId:'history-edition-1',title:'History One',authors:'Historian',series:'',tags:['History']}),
  copy('history-b',{workId:'history-work',editionId:'history-edition-1',title:'History One',authors:'Historian',series:'',tags:['History'],location:{room:'Archive'}}),
  copy('history-c',{workId:'history-work',editionId:'history-edition-2',title:'History One',authors:'Historian',series:'',tags:['History']}),
  copy('author-a1',{workId:'author-work-1',editionId:'author-edition-1',title:'Alpha',seriesNumber:'1',tags:['Classics']}),
  copy('author-a2',{workId:'author-work-1',editionId:'author-edition-1',title:'Alpha',seriesNumber:'1',tags:['Archive'],location:{room:'Archive'}}),
  copy('author-b',{workId:'author-work-2',title:'Beta',seriesNumber:'2',tags:['Fantasy']}),
  copy('author-c',{workId:'author-work-3',title:'Gamma',seriesNumber:'2.5',tags:['Fantasy'],cover:''}),
  copy('series-d',{workId:'series-work-4',title:'Delta',authors:'Álvaro Núñez',seriesNumber:'10',tags:['Travel']}),
  copy('series-e',{workId:'series-work-5',title:'Epsilon',authors:'Other Author',seriesNumber:'',tags:['Travel']}),
  copy('missing',{title:'Metadata Gap',authors:'',series:'',tags:[],cover:''})
];
const authorA=api.buildAuthorBrowseIndex(fixture).find(entry=>entry.label==='Author A');
const history=api.buildSubjectBrowseIndex(fixture).find(entry=>entry.label==='History');
const series=api.buildSeriesBrowseIndex(fixture).find(entry=>entry.label==='Sequence');

assert.deepEqual([history.workCount,history.copyCount],[1,3],'One Work across two Editions remains one Work and three Copies');
assert.equal(api.libraryBrowseCount(history),'1 work · 3 physical copies');
assert.deepEqual([authorA.workCount,authorA.copyCount],[3,4],'Author A has three Works and four Copies');
assert.deepEqual([series.workCount,series.copyCount],[5,6],'Series has five Works and six Copies');
assert.deepEqual(Array.from(api.buildSubjectBrowseIndex(fixture).find(entry=>entry.label==='Classics').books,book=>book.id),['author-a1'],'Subject membership stays exact at Copy level');
assert.equal(api.editionCopyContext(fixture[3],authorA.books).label,'Copy 1 of 2');
assert.equal(api.editionCopyContext(fixture[4],authorA.books).label,'Copy 2 of 2');

const ordered=[...series.books].sort(api.compareSeriesPosition).map(book=>book.seriesNumber);
assert.deepEqual(ordered,['1','1','2','2.5','10','']);
assert.equal(api.libraryBrowseInitial('Álvaro Núñez'),'A');
assert.equal(api.libraryBrowseInitial('9 Lives'),'0–9');
assert.equal(api.libraryBrowseInitial('— Notes'),'#');
const authorGroups=api.groupLibraryBrowseIndex(api.buildAuthorBrowseIndex(fixture));
assert.ok(authorGroups.some(group=>group.initial==='A'&&group.entries.some(entry=>entry.label==='Álvaro Núñez')));

assert.equal(api.libraryBrowseMissingCount(fixture,'authors'),1);
assert.equal(api.libraryBrowseMissingCount(fixture,'series'),4);
assert.equal(api.libraryBrowseMissingCount(fixture,'subjects'),1);
assert.ok(!api.buildAuthorBrowseIndex(fixture).some(entry=>/unknown/i.test(entry.label)));
assert.ok(!api.buildSeriesBrowseIndex(fixture).some(entry=>/no series/i.test(entry.label)));
assert.ok(!api.buildSubjectBrowseIndex(fixture).some(entry=>/untagged/i.test(entry.label)));

const visible=fixture.filter(book=>book.location.room==='Study');
assert.deepEqual(Array.from(api.visualBrowseSubset(visible,{copyIds:authorA.books.map(book=>book.id)}),book=>book.id),['author-a1','author-b','author-c']);
assert.deepEqual(Array.from(api.visualBrowseSubset(fixture,{copyIds:series.books.map(book=>book.id)}),book=>book.id),['author-a1','author-a2','author-b','author-c','series-d','series-e']);
assert.deepEqual(Array.from(api.visualBrowseSubset(fixture,{copyIds:history.books.map(book=>book.id)}),book=>book.id),['history-a','history-b','history-c']);
assert.deepEqual(Array.from(api.intersectLibraryBrowseCopies(authorA.books,visible),book=>book.id),['author-a1','author-b','author-c']);
const authorContext=api.createVisualBrowseContext('authors',authorA);
assert.deepEqual(Array.from(authorContext.copyIds),['author-a1','author-a2','author-b','author-c']);
assert.equal(api.visualBrowseContextAfterTab('authors',authorContext),authorContext);
assert.equal(api.visualBrowseContextAfterTab('browse',authorContext),null,'Direct Browse navigation clears a stale subset');
const selections=api.libraryBrowseSelectionState(api.libraryBrowseSelectionState({},'authors',authorA.key),'series',series.key);
assert.equal(selections.authors,authorA.key);assert.equal(selections.series,series.key);

assert.deepEqual(Array.from(api.filterLibraryBrowseIndex([{label:'Knausgård'},{label:'García Márquez'}],'knausgard'),entry=>entry.label),['Knausgård']);
const before=JSON.stringify(fixture);api.buildAuthorBrowseIndex(fixture);api.buildSeriesBrowseIndex(fixture);api.buildSubjectBrowseIndex(fixture);assert.equal(JSON.stringify(fixture),before,'Browse derivation must not mutate metadata');

const large=Array.from({length:5000},(_,index)=>copy(`large-${index}`,{workId:`large-work-${Math.floor(index/2)}`,editionId:`large-edition-${index}`,authors:`Author ${index%600}`,series:`Series ${index%120}`,tags:[`Subject ${index%80}`]}));
const started=performance.now();const largeAuthors=api.buildAuthorBrowseIndex(large),largeSeries=api.buildSeriesBrowseIndex(large),largeSubjects=api.buildSubjectBrowseIndex(large);const elapsed=performance.now()-started;
assert.deepEqual([largeAuthors.length,largeSeries.length,largeSubjects.length],[600,120,80]);

const libraryView=slice('function LibraryView','function BooksLibraryView');
assert.match(libraryView,/browseSelections.*authors:'',series:'',subjects:''/s);
assert.match(libraryView,/visualBrowseContext/);
assert.match(html,/copyIds:entry\.books\.map\(libraryBrowseCopyId\)/);
assert.match(libraryView,/visualBrowseSubset\(libraryVisibleBooks,visualBrowseContext\)/);
assert.match(libraryView,/visualBrowseContextAfterTab\(mode,current\)/);
assert.match(libraryView,/onReturnContext=\{returnFromVisualBrowse\}/);
assert.doesNotMatch(libraryView,/localStorage|indexedDB|idbSet|schemaVersion/);
assert.match(html,/library-browse-row-cover/);
assert.match(html,/loading="lazy"/);
assert.match(html,/body\.theme-dark \.library-browse-copy/);
assert.match(html,/@media\(max-width:1024px\)/);
assert.match(html,/@media\(max-width:768px\)/);
assert.match(html,/@media\(max-width:430px\)/);
assert.match(html,/@media\(max-width:390px\)/);
assert.match(html,/No physical copies in this group match the current Library filters\./);
assert.match(html,/APP_VERSION='3\.9\.18'/);
assert.match(html,/<title>The Stacks &middot; Book Catalog v3\.9\.18<\/title>/);

console.log('LIBRARY_BROWSE_REFINEMENT_FIXTURE_PASS');
console.log('Work/Edition/Copy counts, exact-Copy subsets, and series ordering: PASS');
console.log('Missing metadata, alphabetical groups, session context, responsive and dark-mode structure: PASS');
console.log(`5,000-Copy Authors/Series/Subjects indexes: ${elapsed.toFixed(2)} ms`);
