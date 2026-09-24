#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./load-production-source');

(async()=>{
  const audit=await import('../src/core/shelf-audit.mjs');
  const isbn=await import('../src/core/isbn.mjs');
  const loc=(room='',bookcase='',shelf='',box='',position='')=>({room,bookcase,shelf,box,position});
  const target=loc('','Main','1');
  const catalog={
    works:[{id:'work-a',title:'Synthetic Atlas',authors:'Example Author'},{id:'work-b',title:'Second Work',authors:'Second Author'}],
    editions:[
      {id:'edition-a',workId:'work-a',title:'Synthetic Atlas',authors:'Example Author',isbn:'9780306406157',cover:'cover-a'},
      {id:'edition-b',workId:'work-b',title:'Second Work',authors:'Second Author',isbn:'9780140449112'},
      {id:'edition-manual',workId:'work-a',title:'Unscannable Atlas',authors:'Example Author',isbn:'bad-isbn'}
    ],
    copies:[
      {id:'copy-a1',workId:'work-a',editionId:'edition-a',location:loc('','Main','1','Box A','4'),collections:['Atlas'],status:'read',copyNotes:'Signed'},
      {id:'copy-a2',workId:'work-a',editionId:'edition-a',location:loc('','Main','1','Box B','9'),collections:['Reference'],status:'reading'},
      {id:'copy-manual',workId:'work-a',editionId:'edition-manual',location:loc('','Main','1'),collections:['Reference'],status:'unread'},
      {id:'copy-a3',workId:'work-a',editionId:'edition-a',location:loc('Office','Main','1'),collections:['Office'],status:'unread'},
      {id:'copy-b1',workId:'work-b',editionId:'edition-b',location:loc('Office','Main','1')},
      {id:'copy-b2',workId:'work-b',editionId:'edition-b',location:loc('','Other','2')}
    ]
  };
  const original=JSON.stringify(catalog);
  assert.equal(audit.auditShelfKey(loc('','Main','')), '');
  assert.equal(audit.auditShelfKey(loc('Office','','1')), '');
  assert.notEqual(audit.auditShelfKey(target),audit.auditShelfKey(loc('Office','Main','1')));
  assert.equal(audit.auditShelfKey(loc('','Main','1','A','5')),audit.auditShelfKey(loc('','Main','1','B','8')));
  assert.throws(()=>audit.createShelfAuditState(catalog,loc('','Main','')),/Bookcase and Shelf/);
  assert.throws(()=>audit.createShelfAuditState(catalog,loc('Office','','1')),/Bookcase and Shelf/);

  const baseline=audit.createShelfAuditState(catalog,target);
  assert.deepEqual(baseline.expected.map(copy=>copy.copyId),['copy-a1','copy-a2','copy-manual']);
  assert.equal(baseline.expected[0].workId,'work-a');
  assert.equal(baseline.expected[0].editionId,'edition-a');
  assert.equal(baseline.expected[0].title,'Synthetic Atlas');
  assert.equal(baseline.expected[0].authors,'Example Author');
  assert.equal(baseline.expected[0].cover,'cover-a');
  assert.equal(baseline.expected[0].location.box,'Box A');
  assert.equal(baseline.expected[1].location.position,'9');
  assert.equal(baseline.expected.some(copy=>copy.copyId==='copy-a3'),false,'Named Room remains distinct from blank Room');
  assert.equal(JSON.stringify(catalog),original,'Creating an audit is read-only');
  catalog.copies[0].location.shelf='changed after start';
  assert.equal(baseline.expected[0].location.shelf,'1','Started audit retains its own baseline');
  catalog.copies[0].location.shelf='1';

  let state=audit.applyShelfAuditScan(baseline,'0306406152',{now:1000});
  let summary=audit.auditSummary(state);
  assert.equal(state.events[0].isbn,'9780306406157','ISBN-10 and ISBN-13 canonicalize to one identity');
  assert.equal(summary.matched,1);
  assert.equal(summary.missing[0].count,1,'One of two same-ISBN expected occurrences remains missing');
  assert.deepEqual(summary.missing[0].copies.map(copy=>copy.copyId),['copy-a1','copy-a2'],'Missing duplicate identity is not guessed');
  assert.equal(summary.manualNeeded.length,1);
  assert.equal(summary.manualNeeded[0].copyId,'copy-manual');
  state=audit.applyShelfAuditScan(state,'9780306406157',{now:1100});
  summary=audit.auditSummary(state);
  assert.equal(summary.matched,2);
  assert.equal(summary.correctlyShelved[0].count,2);
  assert.equal(summary.missing.length,0);
  state=audit.applyShelfAuditScan(state,'9780306406157',{now:1200});
  summary=audit.auditSummary(state);
  assert.equal(summary.matched,2,'Extra occurrence cannot match the shelf a third time');
  assert.equal(summary.events.at(-1).kind,'owned-elsewhere');
  assert.deepEqual(summary.events.at(-1).candidates.map(copy=>copy.copyId),['copy-a3']);
  assert.equal(summary.events.at(-1).candidates[0].location.room,'Office');
  state=audit.applyShelfAuditScan(state,'9780306406157',{now:1300});
  assert.equal(audit.auditSummary(state).events.at(-1).kind,'extra','An occurrence beyond all owned Copies is flagged');
  state=audit.applyShelfAuditScan(state,'9780140449112',{now:1400});
  summary=audit.auditSummary(state);
  assert.equal(summary.events.at(-1).kind,'owned-elsewhere');
  assert.deepEqual(summary.events.at(-1).candidates.map(copy=>copy.copyId),['copy-b1','copy-b2']);
  assert.equal(summary.events.at(-1).copyId,undefined,'Ambiguous ISBN never selects an exact Copy');
  assert.equal(summary.events.at(-1).candidates[0].location.room,'Office');
  state=audit.applyShelfAuditScan(state,'9780679783268',{now:1500});
  assert.equal(audit.auditSummary(state).events.at(-1).kind,'not-owned');
  assert.equal(audit.auditSummary(state).notInLibrary,1);
  const scansBeforeInvalid=state.events.length;
  state=audit.applyShelfAuditScan(state,'9780306406158',{now:1600});
  assert.equal(state.lastFeedback.kind,'invalid');
  assert.equal(state.events.length,scansBeforeInvalid);
  assert.equal(JSON.stringify(catalog),original,'All audit scans leave native Copies and Collections untouched');

  let camera=audit.createShelfAuditState(catalog,target);
  camera=audit.applyShelfAuditScan(camera,'9780306406157',{source:'camera',now:1000});
  const duplicate=audit.applyShelfAuditScan(camera,'9780306406157',{source:'camera',now:1200});
  assert.strictEqual(duplicate,camera,'Repeated camera frame inside debounce window is ignored');
  camera=audit.applyShelfAuditScan(camera,'9780306406157',{source:'camera',now:1000+audit.CAMERA_DUPLICATE_MS});
  assert.equal(audit.auditSummary(camera).matched,2,'A later physical duplicate is counted');
  camera=audit.undoShelfAuditScan(camera);
  assert.equal(audit.auditSummary(camera).matched,1);
  assert.equal(audit.auditSummary(camera).missing[0].count,1);
  camera=audit.markShelfAuditPresent(camera,'copy-manual');
  assert.equal(audit.auditSummary(camera).manualNeeded.length,0);
  assert.equal(audit.auditSummary(camera).manualPresent[0].copyId,'copy-manual');
  assert.equal(JSON.stringify(catalog),original,'Manual mark remains local to the audit state');

  let accounting=audit.createShelfAuditState(catalog,target);
  accounting=audit.applyShelfAuditScan(accounting,'9780306406157',{now:2000});
  accounting=audit.applyShelfAuditScan(accounting,'9780306406157',{now:2100});
  const beforeManual=audit.auditSummary(accounting);
  const missingBeforeManual=beforeManual.missing.map(group=>({isbn:group.isbn,count:group.count}));
  assert.equal(beforeManual.matchedByISBN,2);
  assert.equal(beforeManual.manualPresent.length,0);
  assert.equal(beforeManual.manualNeeded.length,1);
  assert.equal(beforeManual.accounted,2);
  accounting=audit.markShelfAuditPresent(accounting,'copy-manual');
  const afterManual=audit.auditSummary(accounting);
  assert.equal(afterManual.accounted,3,'Two ISBN matches plus one manual confirmation account for three Copies');
  assert.equal(afterManual.matchedByISBN,2,'Manual confirmation does not become an ISBN match');
  assert.equal(afterManual.matched,2,'Legacy matched count remains ISBN-only');
  assert.deepEqual(afterManual.manualPresent.map(copy=>copy.copyId),['copy-manual'],'Manual confirmation remains separately inspectable');
  assert.deepEqual(afterManual.manualNeeded,[],'Manually present Copy leaves manual check needed');
  assert.deepEqual(afterManual.missing.map(group=>({isbn:group.isbn,count:group.count})),missingBeforeManual,'Manual confirmation does not affect ISBN-based missing counts');
  accounting=audit.markShelfAuditPresent(accounting,'copy-manual');
  const afterUndoManual=audit.auditSummary(accounting);
  assert.equal(afterUndoManual.accounted,2,'Undoing manual confirmation reduces accounted total');
  assert.equal(afterUndoManual.matchedByISBN,2);
  assert.equal(afterUndoManual.manualPresent.length,0);
  assert.equal(afterUndoManual.manualNeeded.length,1);
  assert.deepEqual(afterUndoManual.missing.map(group=>({isbn:group.isbn,count:group.count})),missingBeforeManual,'Missing ISBN-based counts stay unchanged after manual undo');
  camera=audit.finishShelfAudit(camera);
  assert.equal(camera.finished,true);
  assert.strictEqual(audit.applyShelfAuditScan(camera,'9780306406157'),camera,'Finished audit cannot accept more scans');

  const moveStart=source.indexOf('function moveExactCopiesInBooks'),moveEnd=source.indexOf('function undoExactCopyMoveInBooks',moveStart);
  assert.ok(moveStart>=0&&moveEnd>moveStart);
  const moveSource=`function normalizeLocation(loc){return {room:'',bookcase:'',shelf:'',box:'',position:'',...(loc||{})};}\nfunction sameLocation(a,b){a=normalizeLocation(a);b=normalizeLocation(b);return ['room','bookcase','shelf','box'].every(key=>a[key]===b[key]);}\nfunction normalizeBook(book){return book;}\n`+source.slice(moveStart,moveEnd)+';globalThis.moveExactCopiesInBooks=moveExactCopiesInBooks;';
  const context=vm.createContext({Set,Date,Math,normalizeLocation:undefined});
  vm.runInContext(moveSource,context);
  const views=catalog.copies.map(copy=>({...copy,copyId:copy.id,location:{...copy.location}}));
  const viewsBefore=JSON.stringify(views);
  const selectedId=summary.events.find(event=>event.kind==='owned-elsewhere'&&event.isbn==='9780140449112').candidates[1].copyId;
  const moved=context.moveExactCopiesInBooks(views,[selectedId],target,'2026-09-24T00:00:00.000Z');
  assert.equal(moved.changed,1);
  assert.equal(moved.books.length,views.length);
  assert.equal(moved.books.find(copy=>copy.id===selectedId).location.bookcase,'Main');
  assert.equal(moved.books.find(copy=>copy.id===selectedId).location.shelf,'1');
  assert.equal(moved.books.find(copy=>copy.id===selectedId).status,views.find(copy=>copy.id===selectedId).status);
  assert.deepEqual(moved.books.find(copy=>copy.id==='copy-b1'),views.find(copy=>copy.id==='copy-b1'),'Unselected same-ISBN Copy is unchanged');
  assert.equal(JSON.stringify(views),viewsBefore,'Move planning leaves source fixture untouched');
  assert.equal(JSON.stringify(catalog),original);

  const auditView=source.slice(source.indexOf('function ShelfAuditView'),source.indexOf('function ReportsView'));
  const auditMoveStart=source.indexOf('function moveAuditCopy');
  const appMove=source.slice(auditMoveStart,source.indexOf('function undoExactCopyMove(',auditMoveStart));
  assert.match(auditView,/CameraBarcodeScanner active=\{cameraOn\} mode="audit"/);
  assert.match(auditView,/onSubmit=\{submit\}/);
  assert.match(auditView,/window\.confirm\(/,'Correction requires an explicit confirmation');
  assert.match(auditView,/disabled=\{!selectedCandidates\[event\.index\]\}/,'Ambiguous move requires exact Copy selection');
  assert.match(appMove,/moveExactCopies\(\[copyId\],destination,\{forceSnapshot:true\}\)/,'Correction delegates to the exact-Copy path with a forced safety snapshot');
  assert.match(source,/makeSnapshot\('before-exact-copy-move',forceSnapshot\)/);
  assert.doesNotMatch(auditView,/processScan\(|setBooks\(|insertScannedBook\(/,'Audit scanning cannot call intake or catalog mutation paths');
  assert.match(source,/function FindPutAway\(/);
  assert.match(source,/function MoveBooksView\(/);
  assert.match(source,/function buildBookcaseNavigationIndex\(/);
  assert.match(source,/Leave this shelf audit\? The scan results for this session will be discarded\./);
  assert.match(source,/onAuditShelf=\{openShelfAudit\}/);
  assert.match(source,/<strong>\{summary\.accounted\}<\/strong><span>Correctly accounted for<\/span>/,'Final headline uses the combined accounted total');
  assert.match(source,/<h2>Correctly accounted for · \{summary\.accounted\}<\/h2>/,'Section total agrees with the completed-audit headline');
  assert.match(source,/matched automatically by ISBN/,'Automatic ISBN matches remain clearly identified');
  assert.match(source,/marked present manually; these are not ISBN matches/,'Manual confirmations remain visibly distinct from ISBN matches');
  assert.match(source,/APP_VERSION='3\.10\.8'/);
  assert.equal(isbn.toISBN13('0306406152'),'9780306406157');
  console.log('Shelf audit identity, read-only scanning, reconciliation, and exact-Copy correction: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
