#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const productionSource=require('./load-production-source');

(async()=>{
  const moduleUrl=pathToFileURL(path.join(__dirname,'..','src','core','isbn.mjs')).href;
  const isbn=await import(moduleUrl);

  assert.equal(isbn.isValidISBN13('9780306406157'),true);
  assert.equal(isbn.isValidISBN13('9780306406158'),false);
  assert.equal(isbn.isValidISBN10('0306406152'),true);
  assert.equal(isbn.isValidISBN10('097522980X'),true);
  assert.equal(isbn.isValidISBN10('0306406153'),false);
  assert.equal(isbn.toISBN13('0306406152'),'9780306406157');
  assert.equal(isbn.toISBN10('9780306406157'),'0306406152');
  assert.equal(isbn.normalizeISBN(' 0-306-40615-2 '),'0306406152');
  assert.equal(isbn.normalizeScannedCode('ISBN-13: 978-0-306-40615-7'),'9780306406157');
  assert.deepEqual(isbn.isbnVariants('0-306-40615-2'),['0306406152','9780306406157']);
  assert.deepEqual(isbn.extractMarcIsbn('ISBN 978-0-306-40615-7 (hardcover)'),['9780306406157']);
  assert.equal(isbn.normalizeISBN('not-an-isbn'),'NOTANISBN');
  assert.equal(isbn.isValidISBN('not-an-isbn'),false);
  assert.equal(isbn.isValidISBN(''),true,'Empty ISBN validity preserves the existing optional-field behavior');

  const appSource=fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
  assert.match(appSource,/from "\.\/core\/isbn\.mjs"/);
  assert.doesNotMatch(appSource,/function normalizeISBN\(/,'App.jsx must not retain a duplicate ISBN implementation');
  assert.match(productionSource,/function normalizeISBN\(/,'Structural regression source must include production modules outside App.jsx');

  console.log('ISBN_REGRESSION_PASS');
  console.log('Production ISBN module normalization, validation, conversion, scanner cleanup, and rescue extraction: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
