function normalizeISBN(value){return String(value||'').replace(/[-\s]/g,'').toUpperCase();}
function isbn13CheckDigit(first12){const sum=first12.split('').reduce((a,d,i)=>a+Number(d)*(i%2?3:1),0);return String((10-(sum%10))%10);}
function isValidISBN10(value){const isbn=normalizeISBN(value);if(!/^\d{9}[\dX]$/.test(isbn))return false;const sum=isbn.split('').reduce((a,ch,i)=>a+(ch==='X'?10:Number(ch))*(10-i),0);return sum%11===0;}
function isValidISBN13(value){const isbn=normalizeISBN(value);return /^\d{13}$/.test(isbn)&&isbn13CheckDigit(isbn.slice(0,12))===isbn[12];}
function isValidISBN(value){const isbn=normalizeISBN(value);return !isbn||isValidISBN10(isbn)||isValidISBN13(isbn);}
function toISBN13(value){const isbn=normalizeISBN(value);if(!isbn)return '';if(isValidISBN13(isbn))return isbn;if(isValidISBN10(isbn)){const prefix='978'+isbn.slice(0,9);return prefix+isbn13CheckDigit(prefix);}return isbn;}
function toISBN10(value){const isbn=normalizeISBN(value);if(isValidISBN10(isbn))return isbn;if(!isValidISBN13(isbn)||!isbn.startsWith('978'))return'';const body=isbn.slice(3,12);const sum=body.split('').reduce((total,digit,index)=>total+Number(digit)*(10-index),0);const check=(11-(sum%11))%11;return body+(check===10?'X':String(check));}
function isbnVariants(value){const original=normalizeISBN(value);if(!original||!isValidISBN(original))return[];return [...new Set([original,toISBN13(original),toISBN10(original)].map(isbn=>String(isbn||'').trim()).filter(Boolean))].filter(isbn=>isValidISBN(isbn));}
function normalizeScannedCode(value){return normalizeISBN(String(value||'').replace(/^ISBN(?:-1[03])?:?/i,''));}
function extractMarcIsbn(value){
  const matches=String(value||'').match(/97[89][0-9Xx -]{10,20}|[0-9][0-9Xx -]{8,16}/g)||[];
  return matches.map(match=>normalizeISBN(match.trim())).filter(isbn=>isbn&&isValidISBN(isbn)).map(toISBN13);
}

export {extractMarcIsbn,isbn13CheckDigit,isbnVariants,isValidISBN,isValidISBN10,isValidISBN13,normalizeISBN,normalizeScannedCode,toISBN10,toISBN13};
