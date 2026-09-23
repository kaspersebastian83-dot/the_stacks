#!/usr/bin/env node
'use strict';

const {spawnSync}=require('node:child_process');
const path=require('node:path');

const suites=[
  'search-regression.test.js',
  'visual-browse.test.js',
  'library-browse-refinement.test.js',
  'core-model-regression.test.js',
  'isbn-regression.test.js',
  'scan-regression.test.js',
  'backup-roundtrip-regression.test.js',
  'location-regression.test.js',
  'find-put-away-regression.test.js',
  'bookcase-navigation-regression.test.js',
  'move-books-regression.test.js',
  'physical-library-integration.test.js',
  'storage-mode-regression.test.js',
  'reset-safety-regression.test.js'
];

let failures=0;
console.log(`Running ${suites.length} regression suites in deterministic order.\n`);

suites.forEach((suite,index)=>{
  const file=path.join(__dirname,suite);
  console.log(`[${index+1}/${suites.length}] RUN  ${suite}`);
  const result=spawnSync(process.execPath,[file],{
    cwd:path.join(__dirname,'..'),
    encoding:'utf8',
    env:{...process.env,FORCE_COLOR:'0'}
  });
  const stdout=result.stdout||'';
  const stderr=result.stderr||'';

  if(result.status===0&&!result.error){
    if(stdout.trim())console.log(stdout.trim());
    console.log(`[${index+1}/${suites.length}] PASS ${suite}\n`);
    return;
  }

  failures++;
  console.error(`[${index+1}/${suites.length}] FAIL ${suite}`);
  if(result.error)console.error(result.error.stack||result.error.message);
  if(stdout.trim())console.error('--- stdout ---\n'+stdout.trim());
  if(stderr.trim())console.error('--- stderr ---\n'+stderr.trim());
  if(result.signal)console.error(`Terminated by signal: ${result.signal}`);
  else console.error(`Exit code: ${result.status===null?'unknown':result.status}`);
  console.error('');
});

if(failures){
  console.error(`REGRESSION FAIL: ${failures} of ${suites.length} suites failed.`);
  process.exitCode=1;
}else{
  console.log(`REGRESSION PASS: ${suites.length} of ${suites.length} suites passed.`);
}
