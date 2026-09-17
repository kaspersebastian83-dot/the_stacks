#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const srcRoot=path.join(root,'src');
const sourceExtensions=new Set(['.js','.jsx','.mjs','.css']);

function productionSourceFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())return productionSourceFiles(file);
    return sourceExtensions.has(path.extname(entry.name))?[file]:[];
  });
}

const files=[path.join(root,'index.html'),...productionSourceFiles(srcRoot)].sort((a,b)=>a.localeCompare(b));
module.exports=files.map(file=>fs.readFileSync(file,'utf8')).join('\n');
