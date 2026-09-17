#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','src','core','isbn.mjs'),'utf8');
const exportOffset=source.indexOf('\nexport {');
if(exportOffset<0)throw new Error('Could not locate ISBN module named exports');

module.exports=source.slice(0,exportOffset);
