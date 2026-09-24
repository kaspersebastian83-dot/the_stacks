#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=require('./load-production-source');
const styles=fs.readFileSync(path.join(__dirname,'..','src','styles.css'),'utf8');
const between=(start,end)=>{
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Could not extract ${start}`);
  return source.slice(from,to);
};

const easy=between('function EasyScan','function ScanDesk');
const desk=between('function ScanDesk','function filterBooks');
const move=between('function MoveCopiesDialog','function LocationsView');
const edit=between('function EditModal','function StorageModePanel');

assert.match(easy,/Bookcase \*/);
assert.match(easy,/Shelf \*/);
assert.match(easy,/Room \(optional\)/);
assert.match(easy,/Choose a Bookcase and Shelf before scanning\./);
assert.match(easy,/disabled=\{!locationReady\}/,'Easy Scan setup prevents starting without the required location');
assert.match(easy,/hasMoveDestination\(session\.location\)/,'Easy Scan execution validates the active session location');

assert.match(desk,/hasMoveDestination\(defaultLoc\)/,'Scan Desk scan execution validates required fields');
assert.match(desk,/Choose a Bookcase and Shelf before scanning\./);
assert.match(desk,/Bookcase \*/);
assert.match(desk,/Shelf \*/);
assert.match(desk,/Room \(optional\)/);
assert.match(desk,/Box \(optional\)/);
assert.match(desk,/Position \(optional\)/);
assert.match(desk,/onDetected=\{code=>runScan\(code,'camera'\)\}/,'Camera uses the guarded Scan Desk execution path');
assert.match(desk,/onKeyDown=\{e=>\{if\(e\.key==='Enter'\)/,'Hardware scanner Enter reaches guarded submit handler');
assert.match(desk,/async function runBatch\(\)\{\s*if\(!hasMoveDestination\(defaultLoc\)\)/,'Batch ISBN processing validates before starting');

assert.match(move,/Choose a Bookcase and Shelf\./,'Move validation matches the existing Bookcase + Shelf rule');
assert.doesNotMatch(move,/Choose at least a Room, Bookcase, Shelf, or Box/,'Stale Move validation wording is removed');
assert.match(styles,/Bookcase and Shelf place this physical Copy in your library\./,'My Copy location includes the requested helper');
assert.match(edit,/\['Bookcase','Shelf'\]/,'Only Bookcase and Shelf are marked required in My Copy');
assert.match(edit,/\['Room','Box','Position'\]/,'Room, Box, and Position are explicitly optional in My Copy');
assert.match(styles,/book-detail-location>label:nth-child\(2\)\{order:1\}.*book-detail-location>label:nth-child\(5\)\{order:3\}.*book-detail-location>label:nth-child\(1\)\{order:4\}.*book-detail-location>label:nth-child\(4\)\{order:5\}/,'My Copy fields are displayed in the requested order');

console.log('Easy Scan, Scan Desk, My Copy, and Move Bookcase + Shelf requirements: PASS');
