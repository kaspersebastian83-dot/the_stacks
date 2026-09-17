#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
module.exports=[
  fs.readFileSync(path.join(root,'index.html'),'utf8'),
  fs.readFileSync(path.join(root,'src','styles.css'),'utf8'),
  fs.readFileSync(path.join(root,'src','App.jsx'),'utf8')
].join('\n');
