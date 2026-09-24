import React,{useEffect,useMemo,useRef,useState} from "react";
import {BrowserMultiFormatOneDReader} from "@zxing/browser";
import {extractMarcIsbn,isbnVariants,isValidISBN,normalizeISBN,normalizeScannedCode,toISBN13} from "./core/isbn.mjs";
import {createAiMarkdown,createLibraryCsv,downloadTextFile,localDateStamp} from "./core/library-export.mjs";

const BOOKS_KEY='bookCatalog:library:v1';
const NATIVE_CATALOG_KEY='bookCatalog:nativeCatalog:v1';
const NATIVE_CATALOG_MODEL='work-edition-copy-v1';
const COLLECTIONS_KEY='bookCatalog:shelves:v1';
const VIEWS_KEY='bookCatalog:savedViews:v1';
const SETTINGS_KEY='bookCatalog:settings:v1';
const SNAPSHOT_KEY='bookCatalog:lastSnapshot:v1';
const MIGRATION_BACKUP_KEY='bookCatalog:preV3MigrationBackup:v1';
const SCHEMA_KEY='bookCatalog:schemaVersion:v1';
const STORAGE_MODE_KEY='bookCatalog:storageMode:v1';
const IDB_NAME='the-stacks-catalog-db';
const IDB_VERSION=1;
const IDB_STORE='kv';
const APP_VERSION='3.10.3';
const DEFAULT_SETTINGS={theme:'light',defaultStatus:'unread',defaultCollection:'',defaultLocation:blankLocation(),confirmDestructive:true,autoJsonSnapshot:true,backupReminderDays:14,compactMobile:false,showShortcutHints:true,preferGoogleBooksFallback:true};
const STATUS=[
  ['unread','Unread'],['want','Want to read'],['reading','Currently reading'],['read','Read'],['dnf','Did not finish'],['reference','Reference only']
];
const STATUS_LABEL=Object.fromEntries(STATUS);
const CHANGELOG=[
  {version:'3.10.3',date:'2026-09-23',items:['Unified scanning, My Copy, and physical Bookcase placement around Copy.location, with automatic recovery of existing Bookcase and Shelf data.']},
  {version:'3.10.2',date:'2026-09-23',items:['Polished Visual Bookcase with deterministic muted spines, clearer shelf structure, and a selected-Copy details and actions panel.']},
  {version:'3.10.1',date:'2026-09-23',items:['Added a visual physical Bookcase view with exact-Copy shelf cards and direct Move and Scan to Shelf actions.']},
  {version:'3.10.0',date:'2026-09-23',items:['Added full-library CSV and privacy-safe AI Markdown exports, generated locally while keeping JSON backup and restore separate.']},
  {version:'3.9.18',date:'2026-09-23',items:['Aligned partial Box locations and shelf labels across physical-library views, and made move undo refuse intervening Position changes.']},
  {version:'3.9.17',date:'2026-09-23',items:['Added exact-Copy Move actions and batch shelf moves, plus continuous Scan to Location with explicit Copy selection, session summary, and undo.']},
  {version:'3.9.16',date:'2026-09-23',items:['Added Bookcases browsing with Room → Bookcase → Shelf navigation, exact physical Copy inventories, and clear missing or incomplete location groups.']},
  {version:'3.9.15',date:'2026-09-23',items:['Added Find / Put Away for read-only ISBN ownership checks, exact physical Copy locations, and continuous scan-ready lookup.']},
  {version:'3.9.14',date:'2026-09-19',items:["Added physical-location sorting in Library and made each book's physical location easier to see."]},
  {version:'3.9.13',date:'2026-09-17',items:['Added iPhone-compatible camera barcode scanning with a bundled fallback decoder while preserving the existing native scan and physical-copy workflow.']},
  {version:'3.9.12',date:'2026-09-17',items:['Added automated regression coverage and continuous safety checks for catalog identity, physical Copies, search, browsing, locations, scanning, and backup/restore behavior.']},
  {version:'3.9.11',date:'2026-09-16',items:['Refined Authors, Series, and Subjects browsing with clearer Work/Copy counts, alphabetical exploration, richer detail views, and direct Visual Browse for selected library subsets.']},
  {version:'3.9.10',date:'2026-09-16',items:['Added Visual Browse, an immersive cover-first way to flip through filtered physical books with swipe, keyboard, and perspective navigation.']},
  {version:'3.9.9',date:'2026-09-16',items:['Improved catalog search with accent and punctuation tolerance, careful typo matching, and more useful relevance ordering.']},
  {version:'3.9.8',date:'2026-09-14',items:['Improved physical inventory with hierarchical location browsing and safer multi-book location assignment and moves.']},
  {version:'3.9.7',date:'2026-09-14',items:['Fixed oversized book covers on Home so real cover images remain contained within Recently added cards.']},
  {version:'3.9.6',date:'2026-09-14',items:['Added clearer portable-backup health, configurable reminders, and consistent backup status across Home and Settings.']},
  {version:'3.9.5',date:'2026-09-13',items:['Improved book recognition by routing Google Books ISBN lookups through authenticated secure access.']},
  {version:'3.9.4',date:'2026-09-13',items:['Improved ISBN recognition with ISBN-10/13 rescue, additional Open Library lookup, and transient provider retries.']},
  {version:'3.9.3',date:'2026-09-13',items:['Added safe Library data controls for backups, a deterministic sample library, and verified library reset.']},
  {version:'3.9.2',date:'2026-09-13',items:['Improved empty states and helper text across Library, Organize, Shelves, and catalog workflows.']},
  {version:'3.9.1',date:'2026-09-13',items:['Clarified Collections versus physical Shelf terminology across the interface.']},
  {version:'3.9.0',date:'2026-09-13',items:['Added Library browsing by authors, series, and subjects.']},
  {version:'3.8.0',date:'2026-09-13',items:['Added series, translator, editor, and original publication year with metadata and backup support.']},
  {version:'3.7.6',date:'2026-09-12',items:['Redesigned book details around Book, Edition, My copy, and Reading for clearer everyday catalog editing.']},
  {version:'3.7.5',date:'2026-09-12',items:['Added a guided identification assistant for unresolved books with title and author catalog search.']},
  {version:'3.7.4',date:'2026-09-12',items:['Enabled Library of Congress metadata fallback in the browser through a dedicated secure proxy.']},
  {version:'3.7.3',date:'2026-09-12',items:['Added a DNB fallback and an isolated Library of Congress metadata adapter.']},
  {version:'3.7.2',date:'2026-09-12',items:['Separated normal multiple-copy ownership from genuine possible duplicate records.']},
  {version:'3.7.1',date:'2026-09-12',items:['Simplified book organization into Needs identification, Ready to shelve, and Other attention.']},
  {version:'3.7.0',date:'2026-09-12',items:['Redesigned Home around reading and the physical library, with clearer identification and organization tasks.']},
  {version:'3.6.12',date:'2026-09-12',items:['Valid scanned ISBNs without metadata are now preserved in a Needs identification workflow.']},
  {version:'3.6.11',date:'2026-09-11',items:['Fixed Copy-level shelf consistency between shelf views and book editing.']},
  {version:'3.6.10',date:'2026-09-11',items:['Book editors now show and safely remove unlisted shelf memberships.']},
  {version:'3.6.9',date:'2026-09-11',items:['Fixed Scan Desk destination handling and preserved empty collections.']},
  {version:'3.6.8',date:'2026-09-11',items:['Added a subtle checkmark to covers of books marked as Read.']},
  {version:'3.6.7',date:'2026-09-11',items:['Easy Scan: choose camera or hardware barcode scanner mode without starting the camera unnecessarily.']},
  {version:'3.6.6',date:'2026-09-11',items:['Easy Scan: hardware USB and Bluetooth barcode scanners now add ISBNs through the same safe native copy workflow as the camera.']},
  {version:'3.6.5',date:'2026-09-11',items:['Shelf layout: changed collection organization to a side-by-side Unshelved → selected shelf workflow.']},
  {version:'3.6.4',date:'2026-09-11',items:['Shelf layout: placed the selected shelf above the direct Unshelved pile for upward drag sorting.']},
  {version:'3.6.3',date:'2026-09-11',items:['Shelf Sorting Layout: kept quick shelf targets above Unshelved books, sticky and horizontally scrollable, with clearer drag targets.']},
  {version:'3.6.2',date:'2026-09-11',items:['Reliable portable catalog backup and validated restore.']},
  {version:'3.6.1',date:'2026-09-11',items:['Quick Shelf Sorting: drag unshelved Copies directly onto real shelf tabs, update organization queues immediately, and sort selected shelf views without changing catalog data.']},
  {version:'3.6.0',date:'2026-09-11',items:['Sort Desk: added a fast visual workflow for assigning newly scanned physical copies to collections.']},
  {version:'3.5.1',date:'2026-09-11',items:['Balanced UI: restored Intake and visual shelf organization while keeping quiet navigation, collapsed Library filters, and focused Settings.']},
  {version:'3.5.0',date:'2026-09-11',items:['Quiet UI: simplified everyday navigation, Home, Library, Shelves, book editing, and Settings while keeping advanced catalog tools available contextually.']},
  {version:'3.4.1',date:'2026-09-11',items:['Simplified the active Easy Scan screen into a camera-first child-facing surface with a visual barcode target and quiet feedback.','Moved Easy Scan finish, undo, destination details, and recent session history behind a two-second parent-control hold.','Added a gentle native success sound and occasional larger confirmation while preserving the native Work / Edition / Copy scan path.']},
  {version:'3.4.0',date:'2026-09-11',items:['Added Easy Scan: a child-friendly camera intake flow with a parent setup step for shelf, location, and reading status.','Added barcode release detection and cooldown so a barcode held in view cannot create repeated accidental copies.','Added a scoped Undo last action for the Easy Scan session, using the native copy deletion path and a safety snapshot.']},
  {version:'3.3.6',date:'2026-09-11',items:['Fixed batch intake so repeated ISBNs are processed as additional physical copies instead of being discarded.','Added Recent scans entries for invalid values encountered during batch intake.','Added a distinct Physical copy scan result and assigned native Work, Edition, and Copy IDs immediately when scanning.','Hardened sequential batch scanning so every result is committed before the next ISBN is processed.','Contained unexpected scan failures so they appear in Recent scans and do not stop the rest of a batch.','Preserved metadata lookup provenance on newly scanned editions.']},
  {version:'3.3.5',date:'2026-05-03',items:['Added a recent scan queue on Scan Desk with the last 10 scan results.','Added a safe Undo add action for recent successful scans, using the existing delete confirmation and safety snapshot flow.','Made accidental duplicate scan cleanup faster without leaving Scan Desk.']},
  {version:'3.3.4',date:'2026-05-02',items:['Changed duplicate detection so same physical copy IDs, same native editions, same ISBNs, and same title/author matches all appear in Duplicate Review.','Made same-edition physical-copy groups visible without encouraging accidental merge of intentional extra copies.','Updated Library, Review, Quality, reports, and dashboard duplicate counts to include native physical-copy duplicates.']},
  {version:'3.3.3',date:'2026-05-02',items:['Added an Intake Queue workspace for newly added, unshelved, recently added, and needs-review books.','Added bulk intake actions to move or add selected books to shelves, assign location, set status, and mark reviewed.','Added Intake Queue access from Home, Tools, and the command palette.']},
  {version:'3.3.2',date:'2026-05-02',items:['Added a sticky Unshelved tray on the Bookcase page so intake books stay reachable while scrolling shelves.','Added shelf picker controls on Bookcase cards for faster move/add actions without drag and drop.','Kept the full Unshelved shelf view available from the Unshelved chip and tray button.']},
  {version:'3.3.1',date:'2026-05-02',items:['Fixed the command palette crash and made the command entry visible in compact layouts.','Fixed native catalog loading for Work records and preserved existing Work / Edition / Copy fields during simplified book edits.','Clarified import preview duplicate categories and focused Home and Scan Desk around faster intake workflows.']},
  {version:'3.3.0',date:'2026-05-01',items:['Made Work / Edition / Copy the native catalog storage model instead of a preview-only layer.','Kept the simplified UI as a compatibility view generated from native physical-copy records.','Changed ISBN re-scans to add another physical copy instead of blocking as a duplicate.']},
  {version:'3.2.0',date:'2026-05-01',items:['Simplified the main UI to four core areas: Home, Library, Shelves, and Settings.','Moved advanced catalog tools behind Home suggestions, Settings tools, and the command palette.','Simplified Library into a search-first list with collapsible filters and fewer always-visible buttons.']},
  {version:'3.1.1',date:'2026-05-01',items:['Removed the redundant older interface-mode toggle before the larger simplified-navigation pass.','Added batch ISBN intake on the Scan Desk for pasted lists, hardware-scanner sessions, and multi-book intake workflows.','Clarified scan-session language so continuous camera scanning and batch list processing are easier to understand.']},
  {version:'3.1.0',date:'2026-05-01',items:['Added a calmer primary navigation with optional advanced tools.','Added a first-run path on Dashboard for demo exploration, first book entry, and backup setup.','Added clearer safety guidance around reports, settings, duplicate merges, and catalog-model actions.','Expanded destructive confirmations with what-will-happen, what-will-not-happen, and recovery notes.']},
  {version:'3.0.0',date:'2026-05-01',items:['Added the Work / Edition / Copy architecture layer.','Added a Works workspace with work groups, edition groups, and physical-copy views.','Added safe v3 ID migration that stamps workId, editionId, and copyId onto existing records without deleting the v2 book-record data.','Added v3 model JSON export and print-friendly Work / Edition / Copy inventory.']},
  {version:'2.9.1',date:'2026-05-01',items:['Added pre-v3 migration safety: dry-run Work / Edition / Copy migration reports, migration backups, local rollback, and demo migration previews.','Added schema/export validation so users can see risky records before any future data-model migration.','Added a Migration Safety workspace and Settings panel to protect catalog data before the v3.0 architecture change.']},
  {version:'2.9.0',date:'2026-05-01',items:['Added productivity and output polish: configurable reports, guided cleanup assistant, quick edit drawer, location management tools, and stronger backup confidence prompts.','Added printable report column selection and report title/subtitle controls so saved views and inventory exports are more useful.','Added quick-edit actions for status, rating, tags, shelves, location, review state, and lending without opening the full editor.']},
  {version:'2.8.0',date:'2026-05-01',items:['Added multi-candidate metadata search so users can compare Open Library and Google Books matches before updating a record.','Added candidate scoring, source/confidence badges, and field coverage counts to make metadata choices easier.','Improved title/author fallback lookup and kept safe fill-missing behavior as the default for bulk enrichment.']},
  {version:'2.7.0',date:'2026-05-01',items:['Added mobile camera barcode scanning with continuous scan mode and graceful manual fallback.','Added scan-session controls for destination shelf and default physical location during intake.','Added session counters and camera-permission diagnostics so mobile scanning is safer and easier to troubleshoot.']},
  {version:'2.6.0',date:'2026-05-01',items:['Added optional Larger Library Mode using IndexedDB for books, shelves, saved views, settings, and safety snapshots.','Added safe migration controls from localStorage to IndexedDB while keeping JSON backup as the recovery path.','Added storage-mode diagnostics and tools to copy the active catalog back to localStorage for portable/fallback use.']},
  {version:'2.5.0',date:'2026-05-01',items:['Added Reports workspace with printable catalog, location, lending, missing metadata, duplicate, and current-view reports.','Added Locations workspace for room/bookcase/shelf inventory, missing-location cleanup, and location-specific printouts.','Added Dashboard workspace with saved-view cards and high-value cleanup shortcuts for daily catalog work.']},
  {version:'2.4.0',date:'2026-05-01',items:['Added metadata enrichment preview with field-by-field compare before external data changes a record.','Added source, confidence, match-method, and updated-at metadata tracking for enrichment actions.','Added safer cover refresh and title/author metadata search from Review, Quality, and the editor.']},
  {version:'2.3.0',date:'2026-05-01',items:['Added performance and storage hardening: debounced search, load-more Library rendering, storage diagnostics, and cover-size protection.','Added automatic cover image resizing/compression before local storage to reduce backup size and prevent localStorage failures.','Added catalog storage warnings and a Settings diagnostics panel for embedded covers, largest cover size, and storage risk.']},
  {version:'2.2.0',date:'2026-05-01',items:['Added accessibility and keyboard polish: command palette arrow navigation, modal focus management, stronger focus states, better labels, and more consistent Escape handling.']},
  {version:'2.1.1',date:'2026-05-01',items:['Bug-fix release: fixed Scan Desk unshelved/default-shelf behavior, made shelf actions safer, improved demo cleanup, hardened tag validation, and reduced repeated backup reminders.']},
  {version:'2.1.0',date:'2026-05-01',items:['Added UI polish: grouped navigation, a tabbed edit modal, onboarding guidance, demo catalog tools, clearer focus states, and more consistent action styling.']},
  {version:'2.0.4',date:'2026-05-01',items:['Added Bookcase move/add modes, clearer multi-shelf badges, remove-from-shelf actions, stronger catalog validation, and safer repair handling.']},
  {version:'2.0.3',date:'2026-05-01',items:['Fixed a Bookcase drag/drop crash caused by a helper function name colliding with the shelf state setter, and added data repair for any null records created by the crash.']},
  {version:'2.0.2',date:'2026-05-01',items:['Improved the Bookcase workflow with an obvious new-shelf control, shelf drop targets, clearer drag/drop instructions, and true drag-to-move behavior between collections.']},
  {version:'2.0.1',date:'2026-05-01',items:['Fixed the v2.0 browser blank-page issue by simplifying the duplicate field-merge and quality JSX so the app opens reliably.',]},
  {version:'2.0.0',date:'2026-05-01',items:['Added a Quality workspace for metadata completeness, cleanup prioritization, and smart work-group detection.','Added title/author metadata fallback when ISBN lookup is missing or unavailable.','Added field-by-field duplicate merge so users can choose the best title, author, cover, notes, shelves, tags, status, location, and copy data before merging.']},
  {version:'1.9.1',date:'2026-05-01',items:[
    'Added a stabilization pass with safer migrations, import/restore previews, and clearer restore choices.',
    'Added a Google Books metadata fallback for ISBN lookup when Open Library has no matching result.',
    'Improved local persistence protection, data repair, and global runtime error reporting.'
  ]},
  {version:'1.9.0',date:'2026-05-01',items:[
    'Added Phase 5 productivity tools: command palette, keyboard shortcuts, Help workspace, and smarter search syntax.',
    'Added fielded search operators such as status:read, tag:chemistry, room:office, rating>=4, cover:missing, and lent:overdue.',
    'Added a guided Help workspace with catalog-model guidance, workflow shortcuts, and search examples.'
  ]},
  {version:'1.8.0',date:'2026-05-01',items:[
    'Added Phase 4 reliability tools: JSON backup/restore, app settings, local safety snapshots, maintenance actions, and mobile quick actions.',
    'Added a Settings workspace for defaults, theme choice, backup reminders, catalog repair, and data-health checks.',
    'Added full-fidelity JSON export/import so CSV can stay spreadsheet-friendly while JSON preserves every catalog field.'
  ]},
  {version:'1.7.0',date:'2026-05-01',items:[
    'Added Phase 3 mature catalog features: edition/copy fields, lending tracking, cover tools, reading dates, and a Stats dashboard.',
    'Added a Lending workspace for current loans, overdue items, and loan history.',
    'Extended CSV import/export so copy, loan, cover, and reading-history data can be backed up.'
  ]},
  {version:'1.6.0',date:'2026-05-01',items:[
    'Added Phase 2 workflow tools: Duplicate Review, Library bulk edit, richer saved views, and metadata retry actions.',
    'Added built-in saved views for cleanup work such as Needs Review, Duplicates, Missing Covers, and Unread.',
    'Added safe duplicate merge actions that preserve tags, shelves, location, rating, and notes.'
  ]},
  {version:'1.5.0',date:'2026-05-01',items:[
    'Separated collections, tags, reading status, and physical location into distinct catalog fields.',
    'Added fixed reading statuses, structured location fields, and a first-class Needs Review workflow.',
    'Added advanced Library filters, saved views, and a Tag Manager with rename, merge, and delete actions.',
    'Stopped using automatic author, publisher, and genre shelves as primary navigation.'
  ]},
  {version:'1.4.0',date:'2026-05-01',items:['Reduced shelf clutter by treating author, publisher, and genre as filters instead of automatic shelves.']},
  {version:'1.3.0',date:'2026-05-01',items:['Added Scan, Library, and Bookcase workspaces.','Added multi-shelf books and a dense Library table.']}
];

function Icon({name,size=16,spin=false}){
  const common={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round',style:{display:'inline-block',verticalAlign:'middle',flexShrink:0,animation:spin?'spin 1s linear infinite':undefined}};
  const p={
    book:<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    search:<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
    scan:<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="11" width="10" height="2"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    x:<><path d="M18 6 6 18M6 6l12 12"/></>,
    trash:<><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    save:<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    tag:<><path d="M20 12 12 20 4 12V4h8l8 8z"/><circle cx="8" cy="8" r="1"/></>,
    filter:<><path d="M22 3H2l8 9.5V20l4-2v-5.5L22 3z"/></>,
    check:<><path d="m20 6-11 11-5-5"/></>,
    alert:<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
    spin:<path d="M12 2a10 10 0 0 1 0 20"/>,
    star:<polygon points="12 2 15 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.3 12 2"/>,
    lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    gear:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56v.08h-3v-.08A1.7 1.7 0 0 0 10.66 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.04h-.08v-3h.08A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98 8.72 5.86l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56v-.08h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9.92a1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15z"/></>
  };
  return <svg {...common}>{p[name]||p.book}</svg>;
}

function ReadBadge({book,offset=false}){return book?.status==='read'?<span className={'read-badge '+(offset?'read-badge-offset':'')} title="Read" role="img" aria-label="Read"><Icon name="check" size={13}/></span>:null;}

function uniq(arr){return [...new Set((arr||[]).map(s=>String(s||'').trim()).filter(Boolean))];}
function normalizePersonList(value){const values=Array.isArray(value)?value:String(value||'').split(/[;\n]+/);return uniq(values.map(name=>String(name||'').trim().replace(/[\s\/:;,]+$/,'').trim()));}
function personListInput(value){return Array.isArray(value)?value.join('; '):String(value||'');}
function normalizeOriginalPublicationYear(value){const year=String(value||'').trim();if(!year)return'';if(!/^\d{4}$/.test(year))return'';const number=Number(year);return number>=1000&&number<=new Date().getFullYear()+1?year:'';}
function structuredOriginalPublicationYear(value){const year=String(value||'').trim().match(/^(\d{4})/)?.[1]||'';return normalizeOriginalPublicationYear(year);}
function normalizeSeriesText(value){return String(value||'').trim();}
function normalizeSeriesNumber(value){return String(value||'').trim();}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function statusLabel(status){return STATUS_LABEL[status]||'Unread';}
const FORMAT_OPTIONS=['','Hardcover','Paperback','Mass market paperback','Ebook','Audiobook','Journal','Other'];
const CONDITION_OPTIONS=['','New','Very good','Good','Acceptable','Damaged','Needs repair'];
function todayISO(){return new Date().toISOString().slice(0,10);}
function blankLocation(){return {room:'',bookcase:'',shelf:'',box:'',position:''};}
function normalizeLocation(loc){if(!loc)return blankLocation();if(typeof loc==='string')return {room:loc,bookcase:'',shelf:'',box:'',position:''};return {...blankLocation(),...loc};}
function namedLocationPart(label,value){const text=String(value||'').trim();return text?new RegExp('^'+label+'\\b','i').test(text)?text:label+' '+text:'';}
function locationText(book){const l=normalizeLocation(book.location);return [l.bookcase,namedLocationPart('Shelf',l.shelf),l.room&&`Room: ${l.room}`,namedLocationPart('Box',l.box),l.position&&`#${l.position}`].filter(Boolean).join(' · ');}
function hasUnassignedCoreLocation(location){const l=normalizeLocation(location);return !String(l.bookcase||'').trim()||!String(l.shelf||'').trim();}
function physicalLocationParts(location){const l=normalizeLocation(location);return {primary:[l.bookcase,namedLocationPart('Shelf',l.shelf)].filter(Boolean).join(' · '),secondary:[l.room,namedLocationPart('Box',l.box),l.position&&'#'+l.position].filter(Boolean).join(' · ')};}
function PhysicalLocation({location,compact=false}){const missing=hasUnassignedCoreLocation(location);const parts=physicalLocationParts(location);return <span className={'physical-location '+(compact?'compact ':'')+(missing?'missing':'')}><span className="physical-location-label">Location</span><strong>{missing?(compact?'Location not assigned':'⚠ Location not assigned'):parts.primary||parts.secondary}</strong>{!missing&&parts.primary&&parts.secondary&&<small>{parts.secondary}</small>}</span>;}
function isLentOut(book){return Boolean(String(book.lentTo||'').trim()&&!book.returnedDate);}
function isOverdue(book){return isLentOut(book)&&book.dueDate&&book.dueDate<todayISO();}
function loanText(book){if(isLentOut(book))return `${isOverdue(book)?'Overdue: ':'Lent to '}${book.lentTo}${book.dueDate?` · due ${book.dueDate}`:''}`;if(book.returnedDate)return `Returned ${book.returnedDate}`;return ''}

function normalizeSettings(settings){const next={...DEFAULT_SETTINGS,...(settings||{})};next.defaultLocation=normalizeLocation(settings?.defaultLocation);if(!STATUS_LABEL[next.defaultStatus])next.defaultStatus='unread';if(!['light','dark'].includes(next.theme))next.theme='light';next.backupReminderDays=Math.max(0,Number(next.backupReminderDays)||0);return next}
const BACKUP_HEALTH=Object.freeze({EMPTY:'EMPTY',FRESH:'FRESH',DUE_SOON:'DUE_SOON',OVERDUE:'OVERDUE',NEVER_BACKED_UP:'NEVER_BACKED_UP',REMINDERS_OFF:'REMINDERS_OFF'});
function getBackupHealth(settings,hasCatalog,now=Date.now()){
  const normalized=normalizeSettings(settings);const reminderDays=normalized.backupReminderDays;const raw=normalized.lastBackupAt;const parsed=raw?new Date(raw).getTime():NaN;const hasValidBackup=Number.isFinite(parsed);const ageExact=hasValidBackup?Math.max(0,(now-parsed)/86400000):null;const ageDays=ageExact===null?null:Math.floor(ageExact);const ageLabel=ageDays===null?'Not recorded':ageDays===0?'Today':ageDays===1?'Yesterday':`${ageDays} days ago`;const lastBackupLocal=hasValidBackup?formatLocalTimestamp(raw):'Not recorded';
  const result={reminderDays,hasValidBackup,ageDays,ageLabel,lastBackupLocal,lastBackupAt:hasValidBackup?raw:'',shouldRemind:false};
  if(!hasCatalog)return {...result,state:BACKUP_HEALTH.EMPTY,tone:'good',statusLabel:'No backup needed yet',detail:'Add books before saving your first portable backup.'};
  if(reminderDays===0)return {...result,state:BACKUP_HEALTH.REMINDERS_OFF,tone:'neutral',statusLabel:'Reminders off',detail:hasValidBackup?`Last portable backup: ${ageLabel}.`:'No portable backup is recorded. Reminders are off.'};
  if(!hasValidBackup)return {...result,state:BACKUP_HEALTH.NEVER_BACKED_UP,tone:'warn',statusLabel:'Backup recommended',detail:"You haven't saved a portable backup of this library yet.",shouldRemind:true};
  if(ageExact>=reminderDays)return {...result,state:BACKUP_HEALTH.OVERDUE,tone:'warn',statusLabel:'Backup recommended',detail:`Your last portable backup was ${ageLabel}.`,shouldRemind:true};
  const dueSoonWindow=Math.max(2,reminderDays*.2);
  if(ageExact>=reminderDays-dueSoonWindow)return {...result,state:BACKUP_HEALTH.DUE_SOON,tone:'warn',statusLabel:'Backup due soon',detail:`Last portable backup: ${ageLabel}.`};
  return {...result,state:BACKUP_HEALTH.FRESH,tone:'good',statusLabel:'Backup up to date',detail:`Last portable backup: ${ageLabel}.`};
}
function catalogPayload(books,collections,savedViews,settings,nativeCatalog){const catalog=normalizeNativeCatalog(nativeCatalog&&nativeCatalog.copies?.length?nativeCatalog:nativeCatalogFromBookViews(books));const compatibilityBooks=nativeCatalogToBookViews(catalog);return {app:'The Stacks',kind:'native-work-edition-copy-catalog',version:APP_VERSION,schemaVersion:3,modelVersion:NATIVE_CATALOG_MODEL,exportedAt:new Date().toISOString(),catalog,books:compatibilityBooks,compatibilityBooks,collections:uniq(collections).filter(x=>!isAutoFacet(x)),savedViews:savedViews||[],settings:normalizeSettings(settings)}}
function migrationStringKey(value){return normalizedTitle(String(value||'')).replace(/[^a-z0-9]+/g,' ').trim();}
function migrationWorkKey(book){const title=migrationStringKey(String(book?.title||'').replace(/\s*[:;–—-].*$/,''));const author=migrationStringKey(String(book?.authors||'').split(',')[0]||'').split(' ').slice(0,3).join(' ');return title?`${title}|${author}`:'';}
function migrationEditionKey(book){const work=migrationWorkKey(book)||`book:${book?.id||genId()}`;const isbn=normalizeISBN(book?.isbn||'');if(isbn&&isValidISBN(isbn))return `${work}|isbn:${toISBN13(isbn)}`;return `${work}|edition:${migrationStringKey(book?.publisher)}|${String(book?.year||'').trim()}|${migrationStringKey(book?.language)}|${migrationStringKey(book?.format)}|${migrationStringKey(book?.edition)}`;}
function plannedCopyCount(book){const n=Number(book?.copyCount);return Number.isFinite(n)&&n>0?Math.max(1,Math.round(n)):1;}
function catalogSchemaIssues(books=[],collections=[]){const issues=[];const safe=(books||[]);const ids={};safe.forEach((b,i)=>{if(!b||typeof b!=='object'){issues.push(`Record ${i+1}: blank or corrupted book record`);return;}if(!b.id)issues.push(`Record ${i+1}: missing ID`);else ids[b.id]=(ids[b.id]||0)+1;if(b.status&&!STATUS_LABEL[b.status])issues.push(`${b.title||b.id}: invalid reading status`);if(b.isbn&&!isValidISBN(b.isbn))issues.push(`${b.title||b.id}: invalid ISBN`);if(!Array.isArray(b.tags))issues.push(`${b.title||b.id}: tags are not stored as an array`);if(!Array.isArray(b.collections)&&b.shelf===undefined)issues.push(`${b.title||b.id}: shelves/collections need normalization`);const l=normalizeLocation(b.location);if(typeof l!=='object')issues.push(`${b.title||b.id}: location is malformed`);});Object.entries(ids).filter(([,n])=>n>1).forEach(([id,n])=>issues.push(`Duplicate ID ${id} appears ${n} times`));(collections||[]).filter(c=>!String(c||'').trim()).forEach(()=>issues.push('Collection list contains an empty collection name'));(collections||[]).filter(isAutoFacet).forEach(c=>issues.push(`Auto facet stored as a collection: ${c}`));return issues;}
function buildPreV3MigrationPlan(books=[],collections=[]){const safe=(books||[]).filter(b=>b&&typeof b==='object').map(normalizeBook);const works=new Map();const editions=new Map();const manual=[];const copyTotal=safe.reduce((sum,b)=>sum+plannedCopyCount(b),0);const duplicateRisk=duplicateGroups(safe);const schemaIssues=catalogSchemaIssues(books,collections);safe.forEach(b=>{const wk=migrationWorkKey(b);const ek=migrationEditionKey(b);if(wk){const list=works.get(wk)||[];list.push(b);works.set(wk,list);}else manual.push({id:b.id,title:b.title||'Untitled',reason:'Missing title for work grouping'});const ed=editions.get(ek)||[];ed.push(b);editions.set(ek,ed);const reasons=[];if(!b.title||/^Unknown|Untitled/i.test(b.title))reasons.push('weak title');if(!b.authors)reasons.push('missing author');if(b.isbn&&!isValidISBN(b.isbn))reasons.push('invalid ISBN');if(!b.isbn)reasons.push('missing ISBN');if(needsReview(b,safe))reasons.push('needs review');if(metadataScore(b,safe)<55)reasons.push('low metadata score');if(reasons.length)manual.push({id:b.id,title:b.title||'Untitled',reason:uniq(reasons).join(', ')});});const workRows=[...works.entries()].map(([key,items])=>({key,title:items[0]?.title||'Untitled work',author:items[0]?.authors||'',records:items.length,editions:uniq(items.map(migrationEditionKey)).length,copies:items.reduce((sum,b)=>sum+plannedCopyCount(b),0)})).sort((a,b)=>b.records-a.records||a.title.localeCompare(b.title));const editionRows=[...editions.entries()].map(([key,items])=>({key,title:items[0]?.title||'Untitled edition',isbn:items.find(b=>b.isbn)?.isbn||'',records:items.length,copies:items.reduce((sum,b)=>sum+plannedCopyCount(b),0),publisher:items[0]?.publisher||'',year:items[0]?.year||''})).sort((a,b)=>b.records-a.records||a.title.localeCompare(b.title));const ambiguousWorks=workRows.filter(w=>w.records>1&&w.editions>1);const duplicateEditionRecords=editionRows.filter(e=>e.records>1);return {generatedAt:new Date().toISOString(),appVersion:APP_VERSION,currentRecords:safe.length,plannedWorks:workRows.length,plannedEditions:editionRows.length,plannedCopies:copyTotal,duplicateGroups:duplicateRisk.length,duplicateEditionRecords:duplicateEditionRecords.length,ambiguousWorks:ambiguousWorks.length,manualReviewItems:uniq(manual.map(x=>`${x.id}|${x.reason}`)).length,schemaIssues,topWorks:workRows.slice(0,10),topEditions:editionRows.slice(0,10),ambiguousWorkSamples:ambiguousWorks.slice(0,8),duplicateEditionSamples:duplicateEditionRecords.slice(0,8),manualReviewSamples:manual.slice(0,12)};}

function v3StableId(prefix,key){const raw=String(key||prefix).toLowerCase();let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}return prefix+'_'+Math.abs(h>>>0).toString(36);}
function v3WorkId(book){return book?.workId||v3StableId('work',migrationWorkKey(book)||('book:'+String(book?.id||'')));}
function v3EditionId(book){return book?.editionId||v3StableId('edition',migrationEditionKey(book)||('book:'+String(book?.id||'')));}
function v3CopyId(book,index=0){return book?.copyId||v3StableId('copy',`${v3EditionId(book)}|${book?.id||genId()}|${index}`);}
function v3WorkTitle(book){return String(book?.title||'Untitled work').replace(/\s+/g,' ').trim();}
function v3WorkAuthor(book){return String(book?.authors||'').split(',')[0].trim();}
function editionSignature(book){const bits=[];if(book?.isbn)bits.push(toISBN13(book.isbn));if(book?.publisher)bits.push(book.publisher);if(book?.year)bits.push(book.year);if(book?.language)bits.push(book.language);if(book?.format)bits.push(book.format);if(book?.edition)bits.push(book.edition);return bits.filter(Boolean).join(' · ')||'Unspecified edition';}
function copyLabel(copy){return [copy.locationText||'No location',copy.condition,copy.lentTo&&`lent to ${copy.lentTo}`].filter(Boolean).join(' · ')||'Physical copy';}
function buildV3CatalogModel(books=[]){
  const safe=(books||[]).filter(b=>b&&typeof b==='object').map(normalizeBook);
  const works=new Map();const editions=new Map();const copies=[];
  safe.forEach(book=>{
    const workId=v3WorkId(book);const editionId=v3EditionId(book);const baseCopies=plannedCopyCount(book);
    if(!works.has(workId))works.set(workId,{id:workId,key:migrationWorkKey(book),title:v3WorkTitle(book),author:v3WorkAuthor(book),originalYear:book.year||'',originalPublicationYear:normalizeOriginalPublicationYear(book.originalPublicationYear),series:normalizeSeriesText(book.series),seriesNumber:normalizeSeriesNumber(book.seriesNumber),tags:new Set(),notes:[],bookIds:[],editionIds:new Set(),copyIds:new Set(),needsReview:false,quality:0});
    const work=works.get(workId);work.bookIds.push(book.id);work.editionIds.add(editionId);work.needsReview=work.needsReview||needsReview(book,safe);work.quality=Math.max(work.quality,metadataScore(book,safe));(book.tags||[]).forEach(t=>work.tags.add(t));if(book.notes)work.notes.push(book.notes);
    if(!editions.has(editionId))editions.set(editionId,{id:editionId,workId,title:book.title||work.title,authors:book.authors||work.author,isbn:book.isbn||'',publisher:book.publisher||'',year:book.year||'',language:book.language||'',format:book.format||'',edition:book.edition||'',translators:normalizePersonList(book.translators),editors:normalizePersonList(book.editors),pages:book.pages||'',cover:book.cover||'',metadataSource:book.metadataSource||'',bookIds:[],copyIds:new Set(),signature:editionSignature(book)});
    const ed=editions.get(editionId);ed.bookIds.push(book.id);
    for(let i=0;i<baseCopies;i++){
      const copyId=baseCopies===1?v3CopyId(book,0):v3StableId('copy',`${editionId}|${book.id}|${i+1}`);
      const copy={id:copyId,editionId,workId,bookId:book.id,copyNumber:i+1,location:normalizeLocation(book.location),locationText:locationText(book),condition:book.condition||'',acquisitionDate:book.acquisitionDate||'',acquisitionSource:book.acquisitionSource||'',copyNotes:book.copyNotes||'',lentTo:book.lentTo||'',lentDate:book.lentDate||'',dueDate:book.dueDate||'',returnedDate:book.returnedDate||'',collections:collectionNames(book),status:book.status||'unread',rating:book.rating||0};
      copies.push(copy);work.copyIds.add(copyId);ed.copyIds.add(copyId);
    }
  });
  const workList=[...works.values()].map(w=>({...w,tags:[...w.tags],notes:uniq(w.notes).join('\n\n'),editionIds:[...w.editionIds],copyIds:[...w.copyIds]})).sort((a,b)=>a.title.localeCompare(b.title));
  const editionList=[...editions.values()].map(e=>({...e,copyIds:[...e.copyIds]})).sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  const byWork=new Map(workList.map(w=>[w.id,w]));const byEdition=new Map(editionList.map(e=>[e.id,e]));
  const ambiguousWorks=workList.filter(w=>w.editionIds.length>1||w.bookIds.length>1);
  const duplicateEditions=editionList.filter(e=>e.bookIds.length>1||e.copyIds.length>1);
  return {version:'3.0.0',generatedAt:new Date().toISOString(),works:workList,editions:editionList,copies,byWork,byEdition,ambiguousWorks,duplicateEditions,sourceBooks:safe.length};
}
function v3StampedBook(book){const b=normalizeBook(book);return {...b,workId:v3WorkId(b),editionId:v3EditionId(b),copyId:v3CopyId(b),catalogModel:'work-edition-copy-v3',updatedAt:new Date().toISOString()};}
function v3MigrationSummary(before=[],after=[]){const oldMissing=(before||[]).filter(b=>!b?.workId||!b?.editionId||!b?.copyId).length;const model=buildV3CatalogModel(after);return {stamped:oldMissing,works:model.works.length,editions:model.editions.length,copies:model.copies.length,ambiguousWorks:model.ambiguousWorks.length,duplicateEditions:model.duplicateEditions.length};}
function v3ExportPayload(books,collections,savedViews,settings){return catalogPayload(books,collections,savedViews,settings);}
function printV3Inventory(books){const model=buildV3CatalogModel(books);let body=`<p>${model.works.length} works · ${model.editions.length} editions · ${model.copies.length} physical copies.</p>`;model.works.forEach(work=>{const eds=model.editions.filter(e=>e.workId===work.id);body+=`<div class="section"><h2>${escapeHTML(work.title)}</h2><p class="small">${escapeHTML(work.author||'Unknown author')} · ${eds.length} edition${eds.length===1?'':'s'} · ${work.copyIds.length} cop${work.copyIds.length===1?'y':'ies'}</p>`;eds.forEach(ed=>{const copies=model.copies.filter(c=>c.editionId===ed.id);body+=`<h3>${escapeHTML(ed.signature)}</h3><table><thead><tr><th>Copy</th><th>Location</th><th>Condition</th><th>Status</th><th>Lending</th><th>Collections</th></tr></thead><tbody>${copies.map(c=>`<tr><td>${c.copyNumber}</td><td>${escapeHTML(c.locationText||'')}</td><td>${escapeHTML(c.condition||'')}</td><td>${escapeHTML(statusLabel(c.status))}</td><td>${escapeHTML(c.lentTo?`${c.lentTo}${c.dueDate?' · due '+c.dueDate:''}`:'')}</td><td>${escapeHTML((c.collections||[]).join(', '))}</td></tr>`).join('')}</tbody></table>`;});body+='</div>';});openPrintHTML(reportShell('Work / Edition / Copy Inventory',`${model.works.length} works · ${model.copies.length} physical copies`,body));}

function nativeCatalogStats(catalog){catalog=normalizeNativeCatalog(catalog);return {works:catalog.works.length,editions:catalog.editions.length,copies:catalog.copies.length};}
function validateNativeBackupCatalog(catalog){const issues=[];if(!isNativeCatalog(catalog))return {valid:false,issues:['Native catalog must contain Works, Editions, and Copies arrays.']};const ids=(items,label)=>{const seen=new Set();items.forEach((item,index)=>{const id=String(item?.id||'').trim();if(!item||typeof item!=='object')issues.push(label+' '+(index+1)+' is not an object');else if(!id)issues.push(label+' '+(index+1)+' is missing an ID');else if(seen.has(id))issues.push('Duplicate '+label.toLowerCase()+' ID: '+id);else seen.add(id)});return seen};const works=ids(catalog.works,'Work');ids(catalog.editions,'Edition');ids(catalog.copies,'Copy');const editions=new Map(catalog.editions.map(e=>[String(e.id||'').trim(),e]));catalog.editions.forEach((e,i)=>{if(!works.has(String(e?.workId||'').trim()))issues.push('Edition '+(i+1)+' references a missing Work')});catalog.copies.forEach((c,i)=>{const ed=editions.get(String(c?.editionId||'').trim());if(!ed){issues.push('Copy '+(i+1)+' references a missing Edition');return}const workId=String(c?.workId||ed.workId||'').trim();if(!works.has(workId))issues.push('Copy '+(i+1)+' does not resolve to an existing Work');else if(c?.workId&&String(c.workId).trim()!==String(ed.workId||'').trim())issues.push('Copy '+(i+1)+' Work does not match its Edition')});return {valid:!issues.length,issues,stats:{works:catalog.works.length,editions:catalog.editions.length,copies:catalog.copies.length}}}
function validatePortableBackup(raw){const outer=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null;const data=outer?.kind==='native-model-backup'&&outer.payload?outer.payload:raw;if(outer?.app&&outer.app!=='The Stacks'||data&&typeof data==='object'&&!Array.isArray(data)&&data.app&&data.app!=='The Stacks')return {valid:false,issues:['This file is not a The Stacks backup.']};const native=nativeSourceFromData(data);if(native){const checked=validateNativeBackupCatalog(native);if(!checked.valid)return checked;return {...checked,legacy:false,migrated:migrateCatalogData(data),createdAt:data.exportedAt||data.createdAt||outer?.createdAt||'',version:data.version||data.appVersion||outer?.version||''}}const legacyBooks=Array.isArray(data)?data:(Array.isArray(data?.books)?data.books:(Array.isArray(data?.compatibilityBooks)?data.compatibilityBooks:null));if(!legacyBooks||legacyBooks.some(book=>!book||typeof book!=='object'))return {valid:false,issues:['This file does not contain a supported The Stacks catalog payload.']};const migrated=migrateCatalogData(data);return {valid:true,issues:[],legacy:true,migrated,stats:nativeCatalogStats(migrated.nativeCatalog),createdAt:data?.exportedAt||data?.createdAt||outer?.createdAt||'',version:data?.version||data?.appVersion||outer?.version||''}}
function preparePortableBackup(books,collections,savedViews,settings,nativeCatalog){let payload;try{payload=JSON.parse(JSON.stringify(catalogPayload(books,collections,savedViews,settings,nativeCatalog)))}catch{throw new Error('The catalog could not be serialized as JSON.')}const checked=validatePortableBackup(payload);if(!checked.valid)throw new Error(checked.issues[0]||'The backup structure is invalid.');return {payload,checked}}
function blankNativeCatalog(){const now=new Date().toISOString();return {modelVersion:NATIVE_CATALOG_MODEL,createdAt:now,updatedAt:now,works:[],editions:[],copies:[]};}
function isNativeCatalog(value){return Boolean(value&&typeof value==='object'&&Array.isArray(value.works)&&Array.isArray(value.editions)&&Array.isArray(value.copies));}
function nativeSourceFromData(data){if(!data||typeof data!=='object')return null;if(isNativeCatalog(data.catalog))return data.catalog;if(isNativeCatalog(data.model))return data.model;if(isNativeCatalog(data))return data;return null;}
function ensureUniqueId(id,prefix,seed,used){let out=String(id||'').trim()||v3StableId(prefix,seed||genId());let n=2;while(used.has(out)){out=v3StableId(prefix,(seed||out)+'|'+(n++));}used.add(out);return out;}
function normalizeNativeCatalog(raw){
  if(!raw||typeof raw!=='object')return blankNativeCatalog();
  const source=nativeSourceFromData(raw)||raw;
  const now=new Date().toISOString();
  const usedWorks=new Set(),usedEditions=new Set(),usedCopies=new Set();
  const works=[];const editions=[];const copies=[];const workMap=new Map();const editionMap=new Map();
  (Array.isArray(source.works)?source.works:[]).forEach((w,i)=>{
    if(!w||typeof w!=='object')return;
    const id=ensureUniqueId(w.id,'work',(w.title||'work')+'|'+i,usedWorks);
    const work={id,title:String(w.title||'Untitled work').trim()||'Untitled work',author:String(w.author||w.authors||'').trim(),authors:String(w.authors||w.author||'').trim(),originalYear:String(w.originalYear||w.year||'').trim(),originalPublicationYear:normalizeOriginalPublicationYear(w.originalPublicationYear),series:normalizeSeriesText(w.series),seriesNumber:normalizeSeriesNumber(w.seriesNumber),tags:uniq(Array.isArray(w.tags)?w.tags:String(w.tags||'').split(';')),notes:String(w.notes||'').trim(),bookIds:Array.isArray(w.bookIds)?w.bookIds:[],editionIds:Array.isArray(w.editionIds)?w.editionIds:[],copyIds:Array.isArray(w.copyIds)?w.copyIds:[],createdAt:w.createdAt||source.createdAt||now,updatedAt:w.updatedAt||source.updatedAt||now};
    workMap.set(id,work);works.push(work);
  });
  (Array.isArray(source.editions)?source.editions:[]).forEach((e,i)=>{
    if(!e||typeof e!=='object')return;
    const fallbackBook=normalizeBook(e);
    const workId=String(e.workId||'').trim()||v3StableId('work',(e.title||e.id||i)+'|'+(e.authors||''));
    if(!workMap.has(workId)){
      const w={id:workId,title:String(e.title||'Untitled work').trim()||'Untitled work',author:String(e.authors||e.author||'').split(',')[0].trim(),authors:String(e.authors||e.author||'').trim(),originalYear:String(e.year||'').trim(),originalPublicationYear:'',series:'',seriesNumber:'',tags:[],notes:'',bookIds:[],editionIds:[],copyIds:[],createdAt:e.createdAt||now,updatedAt:e.updatedAt||now};
      workMap.set(workId,w);works.push(w);usedWorks.add(workId);
    }
    const id=ensureUniqueId(e.id,'edition',workId+'|'+(e.isbn||e.title||i),usedEditions);
    const edition={id,workId,title:String(e.title||workMap.get(workId)?.title||'Untitled edition').trim()||'Untitled edition',authors:String(e.authors||workMap.get(workId)?.authors||workMap.get(workId)?.author||'').trim(),isbn:e.isbn&&isValidISBN(e.isbn)?toISBN13(e.isbn):String(e.isbn||'').trim(),publisher:String(e.publisher||'').trim(),year:String(e.year||'').trim(),language:String(e.language||'').trim(),format:String(e.format||'').trim(),edition:String(e.edition||'').trim(),translators:normalizePersonList(e.translators),editors:normalizePersonList(e.editors),pages:e.pages||'',cover:e.cover||'',metadataSource:String(e.metadataSource||'').trim(),metadataConfidence:String(e.metadataConfidence||'').trim(),metadataMatchMethod:String(e.metadataMatchMethod||'').trim(),metadataUpdatedAt:String(e.metadataUpdatedAt||'').trim(),signature:e.signature||editionSignature(fallbackBook),bookIds:Array.isArray(e.bookIds)?e.bookIds:[],copyIds:Array.isArray(e.copyIds)?e.copyIds:[],createdAt:e.createdAt||now,updatedAt:e.updatedAt||now};
    editionMap.set(id,edition);editions.push(edition);const w=workMap.get(workId);w.editionIds=uniq([...(w.editionIds||[]),id]);
  });
  (Array.isArray(source.copies)?source.copies:[]).forEach((c,i)=>{
    if(!c||typeof c!=='object')return;
    let editionId=String(c.editionId||'').trim();let ed=editionMap.get(editionId);
    if(!ed){
      const phantomBook=normalizeBook({...c,id:c.sourceBookId||c.bookId||c.id,title:c.title||'Untitled edition',authors:c.authors||''});
      const workId=String(c.workId||'').trim()||v3WorkId(phantomBook);
      if(!workMap.has(workId)){const w={id:workId,title:phantomBook.title,author:v3WorkAuthor(phantomBook),authors:phantomBook.authors,originalYear:phantomBook.year,originalPublicationYear:normalizeOriginalPublicationYear(phantomBook.originalPublicationYear),series:normalizeSeriesText(phantomBook.series),seriesNumber:normalizeSeriesNumber(phantomBook.seriesNumber),tags:[],notes:'',bookIds:[],editionIds:[],copyIds:[],createdAt:c.createdAt||now,updatedAt:c.updatedAt||now};workMap.set(workId,w);works.push(w);usedWorks.add(workId);}
      editionId=editionId||v3EditionId(phantomBook);if(usedEditions.has(editionId))editionId=ensureUniqueId('', 'edition', workId+'|phantom|'+i, usedEditions);else usedEditions.add(editionId);
      ed={id:editionId,workId,title:phantomBook.title,authors:phantomBook.authors,isbn:phantomBook.isbn,publisher:phantomBook.publisher,year:phantomBook.year,language:phantomBook.language,format:phantomBook.format,edition:phantomBook.edition,translators:normalizePersonList(phantomBook.translators),editors:normalizePersonList(phantomBook.editors),pages:phantomBook.pages,cover:phantomBook.cover,metadataSource:'',metadataConfidence:'',metadataMatchMethod:'',metadataUpdatedAt:'',signature:editionSignature(phantomBook),bookIds:[],copyIds:[],createdAt:c.createdAt||now,updatedAt:c.updatedAt||now};
      editionMap.set(editionId,ed);editions.push(ed);const w=workMap.get(workId);w.editionIds=uniq([...(w.editionIds||[]),editionId]);
    }
    const workId=String(c.workId||ed.workId||'').trim();
    const id=ensureUniqueId(c.id||c.copyId,'copy',editionId+'|'+(c.sourceBookId||c.bookId||i),usedCopies);
    const copy={id,copyId:id,editionId,workId,sourceBookId:String(c.sourceBookId||c.bookId||c.id||'').trim(),copyNumber:Math.max(1,Number(c.copyNumber)||1),location:normalizeLocation(c.location),condition:String(c.condition||'').trim(),acquisitionDate:String(c.acquisitionDate||'').trim(),acquisitionSource:String(c.acquisitionSource||'').trim(),copyNotes:c.copyNotes||'',lentTo:String(c.lentTo||'').trim(),lentDate:String(c.lentDate||'').trim(),dueDate:String(c.dueDate||'').trim(),returnedDate:String(c.returnedDate||'').trim(),collections:collectionNames(c),tags:uniq(Array.isArray(c.tags)?c.tags:String(c.tags||'').split(';')),status:STATUS_LABEL[c.status]?c.status:'unread',rating:Math.max(0,Math.min(5,Number(c.rating)||0)),startedAt:String(c.startedAt||'').trim(),finishedAt:String(c.finishedAt||'').trim(),readCount:Math.max(0,Number(c.readCount)||0),privateReview:c.privateReview||'',notes:c.notes||'',reviewed:Boolean(c.reviewed),needsIdentification:Boolean(c.needsIdentification),demo:Boolean(c.demo),addedAt:c.addedAt||c.createdAt||now,updatedAt:c.updatedAt||now};
    copies.push(copy);ed.copyIds=uniq([...(ed.copyIds||[]),id]);ed.bookIds=uniq([...(ed.bookIds||[]),copy.sourceBookId||id]);const w=workMap.get(workId);if(w){w.copyIds=uniq([...(w.copyIds||[]),id]);w.bookIds=uniq([...(w.bookIds||[]),copy.sourceBookId||id]);copy.tags.forEach(t=>{if(!(w.tags||[]).includes(t))w.tags.push(t);});}
  });
  works.forEach(w=>{w.editionIds=uniq(editions.filter(e=>e.workId===w.id).map(e=>e.id));w.copyIds=uniq(copies.filter(c=>c.workId===w.id).map(c=>c.id));});
  editions.forEach(e=>{e.copyIds=uniq(copies.filter(c=>c.editionId===e.id).map(c=>c.id));});
  return {modelVersion:NATIVE_CATALOG_MODEL,createdAt:source.createdAt||now,updatedAt:now,works:works.sort((a,b)=>a.title.localeCompare(b.title)),editions:editions.sort((a,b)=>(a.title||'').localeCompare(b.title||'')),copies:copies.sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''))};
}
function nativeCatalogFromBookViews(books=[],previous=null){
  previous=normalizeNativeCatalog(previous);
  const prevWorks=new Map(previous.works.map(w=>[w.id,w]));
  const prevEditions=new Map(previous.editions.map(e=>[e.id,e]));
  const prevCopies=new Map(previous.copies.map(c=>[c.id,c]));
  const now=new Date().toISOString();const works=new Map(),editions=new Map(),copies=[];const seenCopies=new Set();
  (books||[]).filter(b=>b&&typeof b==='object').map(normalizeBook).forEach(book=>{
    const workId=book.workId||v3WorkId(book);const editionId=book.editionId||v3EditionId(book);
    if(!works.has(workId)){const prev=prevWorks.get(workId)||{};works.set(workId,{...prev,id:workId,title:v3WorkTitle(book)||prev.title||'Untitled work',author:v3WorkAuthor(book)||prev.author||'',authors:book.authors||prev.authors||prev.author||'',originalYear:book.year||prev.originalYear||'',originalPublicationYear:normalizeOriginalPublicationYear(book.originalPublicationYear),series:normalizeSeriesText(book.series),seriesNumber:normalizeSeriesNumber(book.seriesNumber),tags:uniq([...(prev.tags||[]),...(book.tags||[])]),notes:book.notes||prev.notes||'',bookIds:[],editionIds:[],copyIds:[],createdAt:prev.createdAt||book.addedAt||now,updatedAt:book.updatedAt||now});}
    else{const w=works.get(workId);w.tags=uniq([...(w.tags||[]),...(book.tags||[])]);if(book.notes&&!w.notes)w.notes=book.notes;}
    if(!editions.has(editionId)){const prev=prevEditions.get(editionId)||{};editions.set(editionId,{...prev,id:editionId,workId,title:book.title||prev.title||works.get(workId).title,authors:book.authors||prev.authors||works.get(workId).authors||works.get(workId).author,isbn:book.isbn||prev.isbn||'',publisher:book.publisher||prev.publisher||'',year:book.year||prev.year||'',language:book.language||prev.language||'',format:book.format||prev.format||'',edition:book.edition||prev.edition||'',translators:normalizePersonList(book.translators),editors:normalizePersonList(book.editors),pages:book.pages||prev.pages||'',cover:book.cover||prev.cover||'',metadataSource:book.metadataSource||prev.metadataSource||'',metadataConfidence:book.metadataConfidence||prev.metadataConfidence||'',metadataMatchMethod:book.metadataMatchMethod||prev.metadataMatchMethod||'',metadataUpdatedAt:book.metadataUpdatedAt||prev.metadataUpdatedAt||'',signature:editionSignature(book)||prev.signature,bookIds:[],copyIds:[],createdAt:prev.createdAt||book.addedAt||now,updatedAt:book.updatedAt||prev.updatedAt||now});}
    const copiesForRow=plannedCopyCount(book);
    for(let i=0;i<copiesForRow;i++){
      let copyId=i===0?(book.copyId||book.id||v3CopyId(book,0)):v3StableId('copy',editionId+'|'+book.id+'|'+(i+1));let suffix=2;while(seenCopies.has(copyId)){copyId=v3StableId('copy',editionId+'|'+book.id+'|'+(i+1)+'|'+(suffix++));}seenCopies.add(copyId);
      const prev=prevCopies.get(copyId)||{};
      const copy={...prev,id:copyId,copyId,editionId,workId,sourceBookId:book.id||prev.sourceBookId||'',copyNumber:i+1,location:normalizeLocation(book.location),condition:book.condition||prev.condition||'',acquisitionDate:book.acquisitionDate||prev.acquisitionDate||'',acquisitionSource:book.acquisitionSource||prev.acquisitionSource||'',copyNotes:book.copyNotes||prev.copyNotes||'',lentTo:book.lentTo||prev.lentTo||'',lentDate:book.lentDate||prev.lentDate||'',dueDate:book.dueDate||prev.dueDate||'',returnedDate:book.returnedDate||prev.returnedDate||'',collections:collectionNames(book),tags:uniq([...(prev.tags||[]),...(book.tags||[])]),status:book.status||prev.status||'unread',rating:book.rating||prev.rating||0,startedAt:book.startedAt||prev.startedAt||'',finishedAt:book.finishedAt||prev.finishedAt||'',readCount:Math.max(0,Number(book.readCount!==''&&book.readCount!==undefined?book.readCount:prev.readCount)||0),privateReview:book.privateReview||prev.privateReview||'',notes:book.notes||prev.notes||'',reviewed:Boolean(book.reviewed),needsIdentification:Boolean(book.needsIdentification),demo:Boolean(book.demo||prev.demo),addedAt:book.addedAt||prev.addedAt||now,updatedAt:book.updatedAt||now};
      copies.push(copy);const w=works.get(workId);const e=editions.get(editionId);w.bookIds=uniq([...w.bookIds,book.id]);w.editionIds=uniq([...w.editionIds,editionId]);w.copyIds=uniq([...w.copyIds,copyId]);e.bookIds=uniq([...e.bookIds,book.id]);e.copyIds=uniq([...e.copyIds,copyId]);
    }
  });
  return normalizeNativeCatalog({modelVersion:NATIVE_CATALOG_MODEL,createdAt:previous?.createdAt||now,updatedAt:now,works:[...works.values()],editions:[...editions.values()],copies});
}
function nativeCatalogToBookViews(catalog){
  catalog=normalizeNativeCatalog(catalog);const worksById=new Map(catalog.works.map(w=>[w.id,w]));const editionsById=new Map(catalog.editions.map(e=>[e.id,e]));
  return catalog.copies.map(copy=>{const ed=editionsById.get(copy.editionId)||{};const work=worksById.get(copy.workId||ed.workId)||{};return normalizeBook({id:copy.id,workId:work.id||copy.workId||ed.workId||'',editionId:ed.id||copy.editionId||'',copyId:copy.id,catalogModel:NATIVE_CATALOG_MODEL,isbn:ed.isbn||'',title:ed.title||work.title||'Untitled book',authors:ed.authors||work.authors||work.author||'',originalPublicationYear:work.originalPublicationYear||'',series:work.series||'',seriesNumber:work.seriesNumber||'',year:ed.year||work.originalYear||'',publisher:ed.publisher||'',translators:ed.translators||[],editors:ed.editors||[],pages:ed.pages||'',cover:ed.cover||'',metadataSource:ed.metadataSource||'',metadataConfidence:ed.metadataConfidence||'',metadataMatchMethod:ed.metadataMatchMethod||'',metadataUpdatedAt:ed.metadataUpdatedAt||'',edition:ed.edition||'',format:ed.format||'',language:ed.language||'',condition:copy.condition||'',copyCount:1,acquisitionDate:copy.acquisitionDate||'',acquisitionSource:copy.acquisitionSource||'',copyNotes:copy.copyNotes||'',lentTo:copy.lentTo||'',lentDate:copy.lentDate||'',dueDate:copy.dueDate||'',returnedDate:copy.returnedDate||'',startedAt:copy.startedAt||'',finishedAt:copy.finishedAt||'',readCount:copy.readCount||0,privateReview:copy.privateReview||'',collections:copy.collections||[],tags:uniq([...(work.tags||[]),...(copy.tags||[])]),status:copy.status||'unread',location:normalizeLocation(copy.location),rating:copy.rating||0,notes:copy.notes||work.notes||'',reviewed:Boolean(copy.reviewed),needsIdentification:Boolean(copy.needsIdentification),addedAt:copy.addedAt||work.createdAt||new Date().toISOString(),updatedAt:copy.updatedAt||ed.updatedAt||work.updatedAt||'',demo:Boolean(copy.demo)});});
}

function lookupOwnedISBN(catalog,raw){
  const entered=normalizeISBN(raw);
  if(!entered||!isValidISBN(entered))return {state:'invalid',isbn:'',copies:[],editions:[]};
  const isbn=toISBN13(entered);
  const editions=(catalog?.editions||[]).filter(edition=>edition?.isbn&&isValidISBN(edition.isbn)&&toISBN13(edition.isbn)===isbn);
  const editionsById=new Map(editions.map(edition=>[edition.id,edition]));
  const worksById=new Map((catalog?.works||[]).map(work=>[work.id,work]));
  const copies=(catalog?.copies||[]).filter(copy=>editionsById.has(copy.editionId)).map(copy=>({copy,edition:editionsById.get(copy.editionId),work:worksById.get(copy.workId||editionsById.get(copy.editionId).workId)||null}));
  return {state:copies.length?'owned':'not-owned',isbn,editions,copies};
}

function migrationBackupPayload(books,collections,savedViews,settings){const payload=catalogPayload(books,collections,savedViews,settings);return {app:'The Stacks',kind:'native-model-backup',version:APP_VERSION,createdAt:new Date().toISOString(),payload,migrationPlan:buildPreV3MigrationPlan(payload.books,payload.collections)}}
function migrationBackupInfo(){try{const data=safeJSONParse(localStorage.getItem(MIGRATION_BACKUP_KEY),null);return data?.payload?{createdAt:data.createdAt,records:data.payload.books?.length||0,version:data.version||'unknown'}:null}catch{return null}}
function downloadJSON(data,label){try{const json=JSON.stringify(data,null,2);const stamp=new Date().toISOString().replace(/[:.]/g,'-').replace('T','-').slice(0,19);const filename=label==='backup'?'the-stacks-backup-'+stamp+'.json':'stacks-'+label+'-'+stamp+'.json';const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=Object.assign(document.createElement('a'),{href:url,download:filename});document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);return true}catch{return false}}
function formatBytes(n){n=Number(n)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(2)} MB`}
function formatLocalTimestamp(value){if(!value)return 'Not recorded';const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Not recorded';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(date)}catch{return date.toLocaleString()}}
const LOCAL_STORAGE_SOFT_LIMIT=4.5*1024*1024;
const COVER_WARN_BYTES=450*1024;
function textBytes(s){return String(s||'').length*2;}
function coverBytes(book){return String(book?.cover||'').startsWith('data:')?textBytes(book.cover):0;}
function storageDiagnostics(books,collections,savedViews,settings){const embedded=(books||[]).filter(b=>String(b?.cover||'').startsWith('data:'));const sizes=embedded.map(coverBytes);const largest=sizes.length?Math.max(...sizes):0;const totalCovers=sizes.reduce((a,b)=>a+b,0);const estimate=storageEstimate();const backupBytes=catalogStorageBytes(catalogPayload(books,collections,savedViews,settings));const warnings=[];if(estimate>LOCAL_STORAGE_SOFT_LIMIT)warnings.push('Browser storage is close to the common 5 MB localStorage limit. Export a JSON backup and reduce embedded covers.');if(largest>COVER_WARN_BYTES)warnings.push('At least one embedded cover is large. Use compressed uploads or ISBN cover URLs.');if((books||[]).length>800)warnings.push('Large catalog: Library uses load-more rendering, but backups and searches may still take longer.');return {estimate,backupBytes,embeddedCovers:embedded.length,totalCoverBytes:totalCovers,largestCoverBytes:largest,oversizedCovers:sizes.filter(n=>n>COVER_WARN_BYTES).length,storagePercent:storagePercentAfter(estimate),warnings};}
async function compressImageFile(file,maxEdge=900,quality=.78){if(!file)return '';if(file.size>COVER_WARN_BYTES&&!confirm('This cover image is large. The app will resize and compress it before saving. Continue?'))return '';const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read image'));r.readAsDataURL(file);});const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load image'));image.src=dataUrl;});const scale=Math.min(1,maxEdge/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);let out=canvas.toDataURL('image/jpeg',quality);if(textBytes(out)>COVER_WARN_BYTES)out=canvas.toDataURL('image/jpeg',.62);return out;}
function storageEstimate(){try{let total=0;for(const k of [NATIVE_CATALOG_KEY,BOOKS_KEY,COLLECTIONS_KEY,VIEWS_KEY,SETTINGS_KEY,SNAPSHOT_KEY]){total+=String(localStorage.getItem(k)||'').length*2}return total}catch{return 0}}
function safeJSONParse(raw,fallback=null){try{return raw?JSON.parse(raw):fallback}catch{return fallback}}
function safeLocalSet(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function idbAvailable(){return typeof window!=='undefined'&&'indexedDB' in window}
function getPreferredStorageMode(){try{return localStorage.getItem(STORAGE_MODE_KEY)==='indexeddb'?'indexeddb':'localStorage'}catch{return 'localStorage'}}
function setPreferredStorageMode(mode){try{localStorage.setItem(STORAGE_MODE_KEY,mode==='indexeddb'?'indexeddb':'localStorage')}catch{}}
function openStacksDB(){return new Promise((resolve,reject)=>{if(!idbAvailable()){reject(new Error('IndexedDB is not available in this browser'));return;}const req=indexedDB.open(IDB_NAME,IDB_VERSION);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open IndexedDB'));});}
function withIDBStore(mode,work){return openStacksDB().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,mode);const store=tx.objectStore(IDB_STORE);let result;try{result=work(store)}catch(err){reject(err);return;}tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error||new Error('IndexedDB transaction failed'))};tx.onabort=()=>{db.close();reject(tx.error||new Error('IndexedDB transaction aborted'))};}));}
function idbGetKV(key){return withIDBStore('readonly',store=>new Promise((resolve,reject)=>{const req=store.get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not read IndexedDB value'));}));}
function idbSetKV(key,value){return withIDBStore('readwrite',store=>store.put(value,key));}
function idbDeleteKV(key){return withIDBStore('readwrite',store=>store.delete(key));}
async function idbLoadCatalogPayload(){const [catalog,books,collections,savedViews,settings,snapshot,appVersion]=await Promise.all(['catalog','books','collections','savedViews','settings','snapshot','appVersion'].map(k=>idbGetKV(k).catch(()=>undefined)));return {catalog:isNativeCatalog(catalog)?catalog:null,books:Array.isArray(books)?books:[],collections:Array.isArray(collections)?collections:[],savedViews:Array.isArray(savedViews)?savedViews:[],settings:settings||{},snapshot,appVersion:appVersion||'unknown'};}
async function idbSaveCatalogPayload(payload){await Promise.all([idbSetKV('catalog',payload.catalog||nativeCatalogFromBookViews(payload.books||[])),idbSetKV('books',payload.books||[]),idbSetKV('collections',payload.collections||[]),idbSetKV('savedViews',payload.savedViews||[]),idbSetKV('settings',payload.settings||{}),idbSetKV('appVersion',APP_VERSION),idbSetKV('updatedAt',new Date().toISOString())]);}
async function idbSaveCurrentCatalog(books,collections,savedViews,settings){await idbSaveCatalogPayload(catalogPayload(books,collections,savedViews,settings));}
async function idbStorageInfo(){try{const estimate=await navigator.storage?.estimate?.();return {usage:estimate?.usage||0,quota:estimate?.quota||0}}catch{return {usage:0,quota:0}}}
async function loadCatalogFromLocalStorage(){const rawCatalog=safeJSONParse(localStorage.getItem(NATIVE_CATALOG_KEY),null);const rawBooks=safeJSONParse(localStorage.getItem(BOOKS_KEY),[]);const rawCollections=safeJSONParse(localStorage.getItem(COLLECTIONS_KEY),[]);const rawViews=safeJSONParse(localStorage.getItem(VIEWS_KEY),[]);const rawSettings=safeJSONParse(localStorage.getItem(SETTINGS_KEY),null);return {catalog:isNativeCatalog(rawCatalog)?rawCatalog:null,books:Array.isArray(rawBooks)?rawBooks:[],collections:Array.isArray(rawCollections)?rawCollections:[],savedViews:Array.isArray(rawViews)?rawViews:[],settings:rawSettings||{}};}
async function loadCatalogFromPreferredStorage(){const preferred=getPreferredStorageMode();if(preferred==='indexeddb'){try{const data=await idbLoadCatalogPayload();if(data.catalog?.copies?.length||(data.books||[]).length||(data.collections||[]).length||(data.savedViews||[]).length||Object.keys(data.settings||{}).length)return {mode:'indexeddb',data};}catch(err){console.warn('IndexedDB load failed; falling back to localStorage',err);}}return {mode:'localStorage',data:await loadCatalogFromLocalStorage()};}
function writeLocalCatalogPayload(payload){const ok0=safeLocalSet(NATIVE_CATALOG_KEY,JSON.stringify(payload.catalog||nativeCatalogFromBookViews(payload.books||[])));const ok1=safeLocalSet(BOOKS_KEY,JSON.stringify(payload.books||[]));const ok2=safeLocalSet(COLLECTIONS_KEY,JSON.stringify(payload.collections||[]));const ok3=safeLocalSet(VIEWS_KEY,JSON.stringify(payload.savedViews||[]));const ok4=safeLocalSet(SETTINGS_KEY,JSON.stringify(payload.settings||{}));safeLocalSet(SCHEMA_KEY,APP_VERSION);return ok0&&ok1&&ok2&&ok3&&ok4;}
async function storeVerifiedSafetySnapshot(payload,mode,io={}){
  const setIDB=io.setIDB||idbSetKV;const getIDB=io.getIDB||idbGetKV;const setLocal=io.setLocal||safeLocalSet;const getLocal=io.getLocal||(()=>safeJSONParse(localStorage.getItem(SNAPSHOT_KEY),null));
  if(mode==='indexeddb'){
    await setIDB('snapshot',payload);
    const stored=await getIDB('snapshot');
    if(!stored||stored.snapshotAt!==payload.snapshotAt)throw new Error('IndexedDB snapshot verification failed');
  }else{
    if(!setLocal(SNAPSHOT_KEY,JSON.stringify(payload)))throw new Error('Local snapshot could not be saved');
    const stored=getLocal();
    if(!stored||stored.snapshotAt!==payload.snapshotAt)throw new Error('Local snapshot verification failed');
  }
  return payload;
}
async function prepareLibraryResetPayload(current,mode,io={}){
  const currentCatalog=normalizeNativeCatalog(current?.catalog);const checked=validatePortableBackup(current);
  if(!checked.valid)throw new Error(checked.issues?.[0]||'Catalog validation failed');
  if(currentCatalog.copies.length){const snapshot={...current,snapshotLabel:'before-reset-library',snapshotAt:new Date().toISOString()};await storeVerifiedSafetySnapshot(snapshot,mode,io);}
  return catalogPayload([],[],[],current.settings||DEFAULT_SETTINGS,blankNativeCatalog());
}
function canLoadSampleLibrary(catalog){return nativeCatalogStats(normalizeNativeCatalog(catalog)).copies===0;}
function storagePercentAfter(bytes){const limit=5*1024*1024;return Math.min(100,Math.round((Number(bytes)||0)/limit*100));}
function catalogStorageBytes(payload){try{return JSON.stringify(payload).length*2}catch{return 0}}
function bookIdentity(book){if(book?.copyId)return `copy:${book.copyId}`;const isbn=normalizeISBN(book?.isbn||'');if(isbn&&isValidISBN(isbn))return `isbn:${toISBN13(isbn)}`;const t=normalizedTitle(book?.title);const a=normalizedTitle(book?.authors||book?.author);return t?`title:${t}|${a}`:`id:${book?.id||genId()}`;}
function importMatchKind(book,candidates=[]){
  const b=normalizeBook(book);
  const isbn=normalizeISBN(b.isbn||'');
  const isbn13=isbn&&isValidISBN(isbn)?toISBN13(isbn):'';
  const workId=b.workId||v3WorkId(b);
  const title=normalizedTitle(b.title);
  const author=normalizedTitle(b.authors||b.author);
  if(b.copyId&&candidates.some(x=>x.copyId===b.copyId||x.id===b.copyId))return 'copy';
  if(b.editionId&&candidates.some(x=>x.editionId===b.editionId))return 'edition';
  if(isbn13&&candidates.some(x=>normalizeISBN(x.isbn)&&isValidISBN(x.isbn)&&toISBN13(x.isbn)===isbn13))return 'edition';
  if(workId&&candidates.some(x=>(x.workId||v3WorkId(x))===workId))return 'work';
  if(title&&candidates.some(x=>normalizedTitle(x.title)===title&&normalizedTitle(x.authors||x.author)===author))return 'work';
  return '';
}
function backfillNativeCopyLocations(catalog,compatibilityBooks=[]){
  const normalizedBooks=(compatibilityBooks||[]).filter(book=>book&&typeof book==='object').map(book=>normalizeBook({
    ...book,
    location:book.location||{room:book.room,bookcase:book.bookcase,shelf:book.physicalShelf||book.shelfNo||book.locationShelf,box:book.box,position:book.position}
  }));
  const uniqueBooks=new Map();
  for(const book of normalizedBooks){const key=JSON.stringify([book.id||'',book.copyId||'',book.editionId||'']);const previous=uniqueBooks.get(key);if(!previous){uniqueBooks.set(key,book);continue;}const merged={...normalizeLocation(previous.location)};const candidate=normalizeLocation(book.location);for(const field of ['room','bookcase','shelf','box','position'])if(!String(merged[field]||'').trim()&&String(candidate[field]||'').trim())merged[field]=candidate[field];uniqueBooks.set(key,{...previous,location:merged});}
  const books=[...uniqueBooks.values()];
  const next={...catalog,copies:catalog.copies.map(copy=>{
    const current=normalizeLocation(copy.location);
    if(String(current.bookcase||'').trim()&&String(current.shelf||'').trim())return copy;
    const candidates=books.filter(book=>{
      const stableCopyId=String(book.copyId||'').trim();
      const bookId=String(book.id||'').trim();
      const copyId=String(copy.id||'').trim();
      const sourceBookId=String(copy.sourceBookId||'').trim();
      const exactCopy=stableCopyId&&stableCopyId===copyId;
      const exactNativeId=bookId===copyId;
      const associatedBook=sourceBookId&&bookId===sourceBookId;
      const identityMatches=exactCopy||exactNativeId||associatedBook;
      return identityMatches&&(!book.editionId||book.editionId===copy.editionId);
    });
    if(candidates.length!==1)return copy;
    const matchedBook=candidates[0];
    const otherCopyMatches=catalog.copies.filter(other=>{
      if(other.id===copy.id||other.editionId!==matchedBook.editionId)return false;
      const bookId=String(matchedBook.id||'').trim(),copyId=String(matchedBook.copyId||'').trim();
      return (copyId&&copyId===String(other.id||'').trim())||bookId===String(other.id||'').trim()||(String(other.sourceBookId||'').trim()&&bookId===String(other.sourceBookId).trim());
    });
    if(otherCopyMatches.length)return copy;
    const legacy=normalizeLocation(matchedBook.location);
    const merged={...current};let changed=false;
    for(const field of ['room','bookcase','shelf','box','position']){
      if(!String(merged[field]||'').trim()&&String(legacy[field]||'').trim()){merged[field]=legacy[field];changed=true;}
    }
    return changed?{...copy,location:merged}:copy;
  })};
  return next;
}
function migrateCatalogData(raw){
  const data=Array.isArray(raw)?{books:raw}:((raw&&typeof raw==='object')?raw:{});
  const nativeSource=nativeSourceFromData(data);
  if(nativeSource){const normalizedCatalog=normalizeNativeCatalog(nativeSource);const nativeCatalog=backfillNativeCopyLocations(normalizedCatalog,[...(Array.isArray(data.books)?data.books:[]),...(Array.isArray(data.compatibilityBooks)?data.compatibilityBooks:[])]);const books=nativeCatalogToBookViews(nativeCatalog);const collections=uniq([...(Array.isArray(data.collections)?data.collections:[]),...(Array.isArray(data.shelves)?data.shelves:[]),...books.flatMap(collectionNames)]).filter(x=>!isAutoFacet(x));const savedViews=Array.isArray(data.savedViews)?data.savedViews:[];const settings=normalizeSettings(data.settings||{});return {books,collections,savedViews,settings,nativeCatalog,sourceVersion:data.version||data.appVersion||'native'};}
  const rawBooks=Array.isArray(data.books)?data.books:(Array.isArray(data.compatibilityBooks)?data.compatibilityBooks:[]);
  const books=rawBooks.filter(b=>b&&typeof b==='object').map(b=>normalizeBook({
    ...b,
    collections: b.collections || b.shelves || (b.shelf?[b.shelf]:[]) || [],
    status: b.status || (b.currentlyReading?'reading':b.wantToRead?'want':b.read?'read':undefined),
    location: b.location || {room:b.room,bookcase:b.bookcase,shelf:b.physicalShelf||b.shelfNo||b.locationShelf,box:b.box,position:b.position},
    startedAt: b.startedAt || b.dateStarted,
    finishedAt: b.finishedAt || b.dateFinished,
    privateReview: b.privateReview || b.review || ''
  }));
  const collections=uniq([...(Array.isArray(data.collections)?data.collections:[]),...(Array.isArray(data.shelves)?data.shelves:[]),...books.flatMap(collectionNames)]).filter(x=>!isAutoFacet(x));
  const savedViews=Array.isArray(data.savedViews)?data.savedViews:[];
  const settings=normalizeSettings(data.settings||{});
  const nativeCatalog=nativeCatalogFromBookViews(books);
  return {books:nativeCatalogToBookViews(nativeCatalog),collections,savedViews,settings,nativeCatalog,sourceVersion:data.version||data.appVersion||'legacy'};
}
function buildImportPreview(currentBooks,payload,kind='Import'){
  const seen=[];const seenKeys=new Set();
  const add=[];const skip=[];const internal=[];const invalid=[];
  const matchCounts={copy:0,edition:0,work:0};
  const internalCounts={copy:0,edition:0,work:0};
  for(const book of payload.books||[]){
    const key=bookIdentity(book);
    if(book.isbn&&!isValidISBN(book.isbn))invalid.push(book);
    const internalKind=seenKeys.has(key)?'copy':importMatchKind(book,seen);
    if(internalKind){internal.push(book);internalCounts[internalKind]=(internalCounts[internalKind]||0)+1;continue}
    seenKeys.add(key);seen.push(normalizeBook(book));
    const matchKind=importMatchKind(book,currentBooks);
    if(matchKind){skip.push(book);matchCounts[matchKind]=(matchCounts[matchKind]||0)+1;}else add.push(book);
  }
  const replaceBooks=(payload.books||[]).map(normalizeBook);
  const mergeBooks=add.map(normalizeBook);
  const replacePayload={books:replaceBooks,nativeCatalog:payload.nativeCatalog||nativeCatalogFromBookViews(replaceBooks),collections:uniq([...(payload.collections||[]),...replaceBooks.flatMap(collectionNames)]).filter(x=>!isAutoFacet(x)),savedViews:payload.savedViews||[],settings:payload.settings};
  const mergePayload={books:mergeBooks,collections:uniq([...(payload.collections||[]),...mergeBooks.flatMap(collectionNames)]).filter(x=>!isAutoFacet(x))};
  return {
    id:genId(),kind,sourceVersion:payload.sourceVersion||'unknown',incoming:(payload.books||[]).length,add:add.length,skip:skip.length,internal:internal.length,invalid:invalid.length,matchCounts,internalCounts,
    needsReview:(payload.books||[]).filter(b=>needsReview(normalizeBook(b),payload.books||[])).length,
    replacePayload,mergePayload,hasSettings:!!payload.settings,hasSavedViews:Array.isArray(payload.savedViews)&&payload.savedViews.length>0,
    storageAfterReplace:catalogStorageBytes(catalogPayload(replacePayload.books,replacePayload.collections,replacePayload.savedViews,replacePayload.settings||DEFAULT_SETTINGS)),
    storageAfterMerge:catalogStorageBytes(catalogPayload([...mergePayload.books,...currentBooks],uniq([...(payload.collections||[]),...currentBooks.flatMap(collectionNames),...mergePayload.books.flatMap(collectionNames)]),[],DEFAULT_SETTINGS))
  };
}
function isTypingTarget(el){return Boolean(el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable));}
function dataHealth(books){const safe=(Array.isArray(books)?books:[]).filter(b=>b&&typeof b==='object');const dups=duplicateGroups(safe);return {books:safe.length,needsReview:safe.filter(b=>needsReview(b,safe)).length,duplicates:dups.length,duplicateRecords:dups.reduce((n,g)=>n+g.items.length,0),missingCovers:safe.filter(b=>!b.cover).length,missingLocation:safe.filter(hasMissingLocation).length,invalidISBN:safe.filter(b=>b.isbn&&!isValidISBN(b.isbn)).length,lentOut:safe.filter(isLentOut).length,overdue:safe.filter(isOverdue).length,avgQuality:safe.length?Math.round(safe.reduce((n,b)=>n+metadataScore(b,safe),0)/safe.length):100,workGroups:workGroups(safe).length}}
function readingText(book){const bits=[];if(book.startedAt)bits.push(`Started ${book.startedAt}`);if(book.finishedAt)bits.push(`Finished ${book.finishedAt}`);if(Number(book.readCount)>0)bits.push(`${book.readCount} read${Number(book.readCount)===1?'':'s'}`);return bits.join(' · ')}
function coverUrlFromISBN(isbn,size='L'){isbn=toISBN13(isbn);return isbn?`https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`:'';}
function collectionNames(book){book=book||{};const c=Array.isArray(book.collections)?book.collections:String(book.collections||'').split(';');const sh=Array.isArray(book.shelves)?book.shelves:String(book.shelves||'').split(';');return uniq([...c,...sh,book.shelf||''].filter(s=>!isAutoFacet(s)));}
function isAutoFacet(s){return /^(Author|Publisher|Genre):\s*/i.test(String(s||''));}
function normalizeBook(book){
  book=book||{};
  const isbn=normalizeISBN(book.isbn||'');
  const collections=collectionNames(book);
  const importedStatus=book.status || (book.read?'read':'unread');
  return {
    id:book.id||genId(), isbn:isbn&&isValidISBN(isbn)?toISBN13(isbn):isbn,
    title:String(book.title||'').trim()||'Untitled book', authors:String(book.authors||book.author||'').trim(),
    originalPublicationYear:normalizeOriginalPublicationYear(book.originalPublicationYear), series:normalizeSeriesText(book.series), seriesNumber:normalizeSeriesNumber(book.seriesNumber),
    year:String(book.year||'').trim(), publisher:String(book.publisher||'').trim(), translators:normalizePersonList(book.translators), editors:normalizePersonList(book.editors), pages:book.pages||'', cover:book.cover||'', metadataSource:String(book.metadataSource||'').trim(), metadataConfidence:String(book.metadataConfidence||'').trim(), metadataMatchMethod:String(book.metadataMatchMethod||'').trim(), metadataUpdatedAt:String(book.metadataUpdatedAt||'').trim(),
    edition:String(book.edition||'').trim(), format:String(book.format||'').trim(), language:String(book.language||'').trim(), condition:String(book.condition||'').trim(),
    copyCount:Math.max(1,Number(book.copyCount)||1), acquisitionDate:String(book.acquisitionDate||'').trim(), acquisitionSource:String(book.acquisitionSource||'').trim(), copyNotes:book.copyNotes||'',
    lentTo:String(book.lentTo||'').trim(), lentDate:String(book.lentDate||'').trim(), dueDate:String(book.dueDate||'').trim(), returnedDate:String(book.returnedDate||'').trim(),
    startedAt:String(book.startedAt||book.dateStarted||'').trim(), finishedAt:String(book.finishedAt||book.dateFinished||'').trim(), readCount:Math.max(0,Number(book.readCount)||0), privateReview:book.privateReview||'',
    collections, shelves:collections, shelf:collections[0]||'', tags:uniq(Array.isArray(book.tags)?book.tags:String(book.tags||'').split(';')), status:STATUS_LABEL[importedStatus]?importedStatus:'unread',
    location:normalizeLocation(book.location), rating:Math.max(0,Math.min(5,Number(book.rating)||0)), notes:book.notes||'',
    reviewed:Boolean(book.reviewed), needsIdentification:Boolean(book.needsIdentification), addedAt:book.addedAt||new Date().toISOString(), updatedAt:book.updatedAt||'',
    workId:String(book.workId||'').trim(), editionId:String(book.editionId||'').trim(), copyId:String(book.copyId||'').trim(), catalogModel:String(book.catalogModel||'').trim()
  };
}
function inCollection(book,name){return collectionNames(book).includes(name);}
function setBookCollections(book,collections){const c=uniq(collections);return {...(book||{}),collections:c,shelves:c,shelf:c[0]||''};}
function editorShelfOptions(book,registeredCollections){return uniq([...(registeredCollections||[]),...collectionNames(book)]).filter(s=>!isAutoFacet(s));}
function primaryEditorShelfOptions(book,registeredCollections,limit=14){const selected=collectionNames(book);const available=editorShelfOptions(book,registeredCollections).filter(name=>!selected.includes(name));return [...selected,...available.slice(0,Math.max(0,limit-selected.length))];}
function isUnshelved(book){return collectionNames(book).length===0;}
function catalogIssues(books=[],collections=[]){
  const list=Array.isArray(books)?books:[];
  const issues=[];
  const badRecords=list.filter(b=>!b||typeof b!=='object').length;
  if(badRecords)issues.push(badRecords+' invalid blank book record'+(badRecords===1?'':'s'));
  const ids=new Map();
  list.filter(b=>b&&typeof b==='object').forEach(b=>ids.set(b.id,(ids.get(b.id)||0)+1));
  const duplicateIds=[...ids.values()].filter(n=>n>1).length;
  if(duplicateIds)issues.push(duplicateIds+' duplicate ID group'+(duplicateIds===1?'':'s'));
  const invalidStatus=list.filter(b=>b&&typeof b==='object'&&!STATUS_LABEL[b.status||'unread']).length;
  if(invalidStatus)issues.push(invalidStatus+' invalid reading status value'+(invalidStatus===1?'':'s'));
  const invalidISBN=list.filter(b=>b&&typeof b==='object'&&b.isbn&&!isValidISBN(b.isbn)).length;
  if(invalidISBN)issues.push(invalidISBN+' invalid ISBN value'+(invalidISBN===1?'':'s'));
  const emptyBookShelves=list.filter(b=>b&&typeof b==='object'&&collectionNames(b).some(c=>!String(c).trim())).length;
  if(emptyBookShelves)issues.push(emptyBookShelves+' book'+(emptyBookShelves===1?' has':'s have')+' empty collection names');
  const emptyCollections=(collections||[]).filter(c=>!String(c||'').trim()).length;
  if(emptyCollections)issues.push(emptyCollections+' empty collection name'+(emptyCollections===1?'':'s'));
  const autoFacetCollections=(collections||[]).filter(isAutoFacet).length;
  if(autoFacetCollections)issues.push(autoFacetCollections+' author/publisher/genre facet'+(autoFacetCollections===1?' is':'s are')+' still stored as collections');
  return issues;
}
function repairCatalogData(rawBooks=[],rawCollections=[]){
  const seen=new Set();
  const repaired=(Array.isArray(rawBooks)?rawBooks:[]).filter(b=>b&&typeof b==='object').map(b=>{
    let n=normalizeBook(b);
    if(!n.id||seen.has(n.id))n={...n,id:genId()};
    seen.add(n.id);
    return setBookCollections(n,collectionNames(n).filter(c=>c&&!isAutoFacet(c)));
  });
  const repairedCollections=uniq([...(Array.isArray(rawCollections)?rawCollections:[]),...repaired.flatMap(collectionNames)]).filter(c=>c&&!isAutoFacet(c)).sort((a,b)=>a.localeCompare(b));
  return {books:repaired,collections:repairedCollections};
}
function getGenres(book){return uniq([...(book.subjects||[]),...(book.tags||[])]).slice(0,12);}
function hasMissingLocation(book){const l=normalizeLocation(book.location);return !String(l.bookcase||'').trim()||!String(l.shelf||'').trim();}
function normalizedTitle(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function isUnidentifiedTitle(title){return /^Unknown ·|^Untitled book$|^Unidentified book$/i.test(String(title||'').trim());}
function needsIdentification(book){return Boolean(book?.needsIdentification);}
function hasUsefulIdentification(book){return !isUnidentifiedTitle(book?.title)&&Boolean(String(book?.title||'').trim())&&Boolean(String(book?.authors||'').trim());}
function reviewReasons(book,books=[]){
  const reasons=[];const isbn=normalizeISBN(book.isbn||'');
  if(needsIdentification(book))reasons.push('Needs identification');
  if(!book.title||isUnidentifiedTitle(book.title))reasons.push('Unknown title');
  if(!book.authors)reasons.push('Missing author');
  if(isbn&&!isValidISBN(isbn))reasons.push('Invalid ISBN');
  if(!book.cover)reasons.push('Missing cover');
  if(hasMissingLocation(book))reasons.push('No location');
  if(isOverdue(book))reasons.push('Overdue loan');
  if(possibleDuplicateGroups(books).some(group=>group.items.some(item=>item.id===book.id)))reasons.push('Possible duplicate');
  if(!book.reviewed&&reasons.length===0)reasons.push('Unreviewed');
  return reasons;
}
function needsReview(book,books){return needsIdentification(book)||(reviewReasons(book,books).length>0&&!book.reviewed);}
const catalogIdentityCache=new WeakMap();
function classifyCatalogIdentityGroups(books=[]){
  const input=Array.isArray(books)?books:[];
  if(catalogIdentityCache.has(input))return catalogIdentityCache.get(input);
  const safe=input.filter(book=>book&&typeof book==='object');
  const possible=[];
  const multiple=[];
  const groupBy=valueFor=>{const groups=new Map();safe.forEach(book=>{const value=valueFor(book);if(value){const items=groups.get(value)||[];items.push(book);groups.set(value,items);}});return groups;};
  const sorted=items=>items.slice().sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  const fingerprint=items=>items.map(book=>String(book.id||book.copyId||'')).sort().join('|');
  const possibleFingerprints=new Set();
  const multipleFingerprints=new Set();
  const addPossible=(kind,key,label,reason,items)=>{if(items.length<2)return;const fp=fingerprint(items);if(possibleFingerprints.has(fp))return;possibleFingerprints.add(fp);possible.push({kind,key,label,reason,items:sorted(items)});};
  const addMultiple=(kind,key,label,reason,items)=>{if(items.length<2)return;const fp=fingerprint(items);if(possibleFingerprints.has(fp)||multipleFingerprints.has(fp))return;multipleFingerprints.add(fp);multiple.push({kind,key,label,reason,items:sorted(items)});};

  groupBy(book=>String(book.copyId||'').trim()).forEach((items,copyId)=>{
    if(items.length>1)addPossible('copy-collision',`copy:${copyId}`,'Same physical Copy ID','These records use the same Copy ID and may describe one physical object.',items);
  });

  groupBy(book=>String(book.editionId||'').trim()).forEach((items,editionId)=>{
    if(items.length<2)return;
    const copyIds=items.map(book=>String(book.copyId||'').trim());
    const distinctCopyIds=new Set(copyIds.filter(Boolean));
    if(copyIds.every(Boolean)&&distinctCopyIds.size===items.length)addMultiple('edition',`edition:${editionId}`,'Multiple copies','You own several physical copies of this edition.',items);
    else addPossible('copy-identity',`edition:${editionId}`,'Copy identity inconsistency','Records in this edition have missing or repeated Copy IDs.',items);
  });

  groupBy(book=>{const isbn=normalizeISBN(book.isbn||'');return isbn&&isValidISBN(isbn)?toISBN13(isbn):'';}).forEach((items,isbn)=>{
    if(items.length<2)return;
    const editionIds=items.map(book=>String(book.editionId||'').trim());
    const distinctEditions=new Set(editionIds.filter(Boolean));
    const copyIds=items.map(book=>String(book.copyId||'').trim());
    const distinctCopies=new Set(copyIds.filter(Boolean));
    if(distinctEditions.size>1||distinctEditions.size===1&&editionIds.some(id=>!id))addPossible('edition-identity',`isbn:${isbn}`,'Edition identity inconsistency',`ISBN ${isbn} is represented by different or incomplete Edition IDs.`,items);
    else if(distinctEditions.size===0&&copyIds.every(Boolean)&&distinctCopies.size===items.length)addMultiple('legacy-isbn',`isbn:${isbn}`,'Multiple copies','Legacy records with this ISBN have distinct physical Copy IDs.',items);
    else if(distinctEditions.size===0)addPossible('legacy-isbn',`isbn:${isbn}`,'Possible duplicate','Legacy records share an ISBN but do not have reliable Edition and Copy identity.',items);
  });

  groupBy(book=>{const title=normalizedTitle(book.title),author=normalizedTitle(book.authors);return title&&author?`${title}|${author}`:'';}).forEach((items,key)=>{
    if(items.length<2||items.every(book=>String(book.editionId||'').trim()&&String(book.copyId||'').trim()))return;
    const fp=fingerprint(items);
    if(possibleFingerprints.has(fp)||multipleFingerprints.has(fp))return;
    const validIsbns=uniq(items.map(book=>{const isbn=normalizeISBN(book.isbn||'');return isbn&&isValidISBN(isbn)?toISBN13(isbn):'';}).filter(Boolean));
    const publisherYears=uniq(items.map(book=>{const publisher=normalizedTitle(book.publisher);const year=String(book.year||'').trim();return publisher&&year?`${publisher}|${year}`:'';}).filter(Boolean));
    if(validIsbns.length===1||publisherYears.length===1)addPossible('legacy-title-author',`legacy:${key}`,'Possible legacy duplicate','Legacy records share title and author plus matching edition evidence.',items);
  });

  const rank={'copy-collision':0,'copy-identity':1,'edition-identity':2,'legacy-isbn':3,'legacy-title-author':4};
  possible.sort((a,b)=>(rank[a.kind]??9)-(rank[b.kind]??9)||b.items.length-a.items.length||String(a.items[0]?.title||'').localeCompare(String(b.items[0]?.title||'')));
  multiple.sort((a,b)=>b.items.length-a.items.length||String(a.items[0]?.title||'').localeCompare(String(b.items[0]?.title||'')));
  const result={possibleDuplicates:possible,multipleCopies:multiple};
  catalogIdentityCache.set(input,result);
  return result;
}
function possibleDuplicateGroups(books=[]){return classifyCatalogIdentityGroups(books).possibleDuplicates;}
function multipleCopyGroups(books=[]){return classifyCatalogIdentityGroups(books).multipleCopies;}
function duplicateGroups(books=[]){return possibleDuplicateGroups(books);}
function preferredValue(items,field){return (items.find(b=>String(b[field]||'').trim())||{})[field]||'';}
function mergeBookRecords(primary,others){
  const all=[primary,...others];
  const firstLocation=all.find(b=>locationText(b));
  const notes=uniq(all.map(b=>b.notes).filter(Boolean));
  const status=primary.status&&primary.status!=='unread'?primary.status:(all.find(b=>b.status&&b.status!=='unread')||primary).status||'unread';
  return normalizeBook({...primary,
    isbn:primary.isbn||preferredValue(all,'isbn'),
    title:(!primary.title||/^Unknown ·|^Untitled book$/i.test(primary.title))?preferredValue(all,'title'):primary.title,
    authors:primary.authors||preferredValue(all,'authors'),
    year:primary.year||preferredValue(all,'year'),
    publisher:primary.publisher||preferredValue(all,'publisher'),
    pages:primary.pages||preferredValue(all,'pages'),
    cover:primary.cover||preferredValue(all,'cover'),
    collections:uniq(all.flatMap(collectionNames)),
    tags:uniq(all.flatMap(b=>b.tags||[])),
    status,
    location:locationText(primary)?primary.location:(firstLocation?firstLocation.location:primary.location),
    rating:Math.max(...all.map(b=>Number(b.rating)||0)),
    notes:notes.join('\n\n--- merged note ---\n\n'),
    reviewed:false,
    updatedAt:new Date().toISOString()
  });
}
function stripQuotes(s){s=String(s||'').trim();return s.replace(/^['\"]|['\"]$/g,'');}
function queryTokens(q){const out=[];let token='',quote='';for(const ch of String(q||'')){if(quote){if(ch===quote)quote='';else token+=ch;continue;}if((ch==='"'||ch==="'")&&(!token||/[:=<>]$/.test(token))){quote=ch;continue;}if(/\s/.test(ch)){if(token){out.push(token);token='';}}else token+=ch;}if(token)out.push(token);return out;}
function normalizeSearchText(value){return String(value??'').toLocaleLowerCase().replace(/ß/g,'ss').replace(/æ/g,'ae').replace(/œ/g,'oe').replace(/ø/g,'o').replace(/ł/g,'l').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘ʼ`´']/g,'').replace(/[‐‑‒–—―−-]+/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function searchableText(book){return normalizeSearchText([book.title,book.authors,book.series,book.seriesNumber,book.originalPublicationYear,personListInput(book.translators),personListInput(book.editors),book.isbn,book.publisher,book.year,book.edition,book.format,book.language,book.condition,book.acquisitionSource,book.copyNotes,book.lentTo,loanText(book),readingText(book),book.privateReview,statusLabel(book.status),locationText(book),collectionNames(book).join(' '),(book.tags||[]).join(' '),book.notes].join(' '));}
function discoverySearchText(book){return normalizeSearchText([book.title,book.authors,book.series,personListInput(book.translators),personListInput(book.editors),book.publisher,collectionNames(book).join(' '),(book.tags||[]).join(' ')].join(' '));}
function cmpText(value,needle){return normalizeSearchText(value).includes(normalizeSearchText(needle));}
function boundedDamerauLevenshtein(a,b,limit){a=String(a||'');b=String(b||'');if(Math.abs(a.length-b.length)>limit)return limit+1;let previous2=null,previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const current=[i];let rowMin=i;for(let j=1;j<=b.length;j++){let value=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));if(previous2&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])value=Math.min(value,previous2[j-2]+1);current[j]=value;rowMin=Math.min(rowMin,value);}if(rowMin>limit)return limit+1;previous2=previous;previous=current;}return previous[b.length];}
function fuzzyTokenMatch(book,token){const wanted=normalizeSearchText(token);if(wanted.length<5||wanted.includes(' ')||/\d/.test(wanted))return false;const limit=wanted.length>=10?2:1;return discoverySearchText(book).split(' ').some(word=>word.length>=5&&Math.abs(word.length-wanted.length)<=limit&&boundedDamerauLevenshtein(word,wanted,limit)<=limit);}
function isISBNQuery(value){const compact=normalizeISBN(value);return /^(?:\d{9}[\dX]|\d{13})$/.test(compact);}
function positiveFreeTextTokens(query){return queryTokens(query).filter(token=>!String(token).startsWith('-')&&!/^([a-zA-Z][\w-]*)(>=|<=|>|<|=|:)(.+)$/.test(String(token))).map(stripQuotes).filter(Boolean);}
function cmpNum(value,op,needle){const a=Number(value)||0;const b=Number(needle)||0;if(op==='>')return a>b;if(op==='>=')return a>=b;if(op==='<')return a<b;if(op==='<=')return a<=b;return a===b;}
function smartTokenMatch(book,token,allBooks=[]){
  token=String(token||'').trim();if(!token)return true;
  let neg=false;if(token.startsWith('-')){neg=true;token=token.slice(1);}
  const m=token.match(/^([a-zA-Z][\w-]*)(>=|<=|>|<|=|:)(.+)$/);
  let ok=false;
  if(!m){const value=stripQuotes(token);ok=isISBNQuery(value)?isbnVariants(book.isbn).includes(toISBN13(value)):searchableText(book).includes(normalizeSearchText(value));if(!ok&&!neg&&!isISBNQuery(value))ok=fuzzyTokenMatch(book,value);return neg?!ok:ok;}
  const field=m[1].toLowerCase();const op=m[2];const value=stripQuotes(m[3]);const l=normalizeLocation(book.location);
  if(field==='status')ok=cmpText(book.status,value)||cmpText(statusLabel(book.status),value);
  else if(field==='tag'||field==='tags')ok=(book.tags||[]).some(t=>cmpText(t,value));
  else if(field==='shelf'||field==='collection'||field==='collections')ok=collectionNames(book).some(c=>cmpText(c,value))||(value.toLowerCase()==='unshelved'&&isUnshelved(book));
  else if(field==='room')ok=cmpText(l.room,value);
  else if(field==='bookcase')ok=cmpText(l.bookcase,value);
  else if(field==='box')ok=cmpText(l.box,value);
  else if(field==='position')ok=cmpText(l.position,value);
  else if(field==='physical-shelf'||field==='location-shelf')ok=cmpText(l.shelf,value);
  else if(field==='location')ok=value.toLowerCase()==='missing'?hasMissingLocation(book):cmpText(locationText(book),value);
  else if(field==='author'||field==='authors')ok=cmpText(book.authors,value);
  else if(field==='title')ok=cmpText(book.title,value);
  else if(field==='series')ok=cmpText(book.series,value);
  else if(field==='translator'||field==='translators')ok=cmpText(personListInput(book.translators),value);
  else if(field==='editor'||field==='editors')ok=cmpText(personListInput(book.editors),value);
  else if(field==='subject'||field==='subjects')ok=(book.tags||[]).some(t=>cmpText(t,value));
  else if(field==='publisher')ok=cmpText(book.publisher,value);
  else if(field==='isbn')ok=isISBNQuery(value)&&isbnVariants(book.isbn).includes(toISBN13(value));
  else if(field==='year')ok=op===':'||op==='='?cmpText(book.year,value):cmpNum(book.year,op,value);
  else if(field==='rating')ok=cmpNum(book.rating,op,value);
  else if(field==='copies'||field==='copy')ok=cmpNum(book.copyCount,op,value);
  else if(field==='format')ok=cmpText(book.format,value);
  else if(field==='language'||field==='lang')ok=cmpText(book.language,value);
  else if(field==='condition')ok=cmpText(book.condition,value);
  else if(field==='review')ok=value.toLowerCase()==='needs'?needsReview(book,allBooks):value.toLowerCase()==='reviewed'?!!book.reviewed:cmpText(reviewReasons(book,allBooks).join(' '),value);
  else if(field==='lent'||field==='loan')ok=value.toLowerCase()==='out'?isLentOut(book):value.toLowerCase()==='overdue'?isOverdue(book):value.toLowerCase()==='returned'?!!book.returnedDate:value.toLowerCase()==='notlent'?!isLentOut(book)&&!book.returnedDate:cmpText(loanText(book),value);
  else if(field==='cover')ok=value.toLowerCase()==='missing'?!book.cover:value.toLowerCase()==='present'?!!book.cover:cmpText(book.cover,value);
  else if(field==='notes')ok=cmpText(book.notes,value)||cmpText(book.privateReview,value)||cmpText(book.copyNotes,value);
  else if(field==='quality')ok=value.toLowerCase()==='poor'?metadataScore(book,allBooks)<50:value.toLowerCase()==='fair'?metadataScore(book,allBooks)<70:cmpNum(metadataScore(book,allBooks),op,value);
  else if(field==='work')ok=value.toLowerCase()==='group'?workGroups(allBooks).some(g=>g.items.some(x=>x.id===book.id)):cmpText(workKeyForBook(book),value);
  else if(field==='source')ok=cmpText(book.metadataSource,value);
  else ok=searchableText(book).includes(normalizeSearchText(value||token));
  return neg?!ok:ok;
}
function matches(book,q,allBooks=[]){const tokens=queryTokens(q);if(!tokens.length)return true;return tokens.every(t=>smartTokenMatch(book,t,allBooks));}
function searchRelevance(book,query){
  const tokens=positiveFreeTextTokens(query),full=normalizeSearchText(tokens.join(' '));if(!tokens.length)return 0;
  const title=normalizeSearchText(book.title),author=normalizeSearchText(book.authors),series=normalizeSearchText(book.series),subjects=normalizeSearchText((book.tags||[]).join(' ')),publisher=normalizeSearchText(book.publisher),collections=normalizeSearchText(collectionNames(book).join(' '));let score=0;
  // Priority bands are deliberately far apart so a lower-priority collection of token hits cannot overtake a stronger whole-query match.
  if(tokens.some(token=>isISBNQuery(token)&&isbnVariants(book.isbn).includes(toISBN13(token))))score+=12000;
  if(full&&title===full)score+=11000;else if(full&&title.startsWith(full))score+=10000;else if(full&&title.includes(full))score+=9000;
  if(full&&author===full)score+=8500;else if(full&&author.includes(full))score+=8000;
  for(const raw of tokens){const token=normalizeSearchText(raw);if(!token)continue;if(title.split(' ').includes(token))score+=700;else if(title.includes(token))score+=500;if(author.split(' ').includes(token))score+=400;else if(author.includes(token))score+=300;if(series.includes(token))score+=220;if(subjects.includes(token))score+=180;if(publisher.includes(token)||collections.includes(token))score+=120;if(searchableText(book).includes(token))score+=30;else if(fuzzyTokenMatch(book,token))score+=1;}
  return score;
}
function rankBooksForSearch(books,query){if(!positiveFreeTextTokens(query).length)return books;return books.map((book,index)=>({book,index,score:searchRelevance(book,query)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(row=>row.book);}
function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
const CATALOG_CSV_HEADERS=['ISBN','Title','Authors','Series','Series Number','Original Publication Year','Translators','Editors','Year','Publisher','Edition','Format','Language','Condition','Copies','Acquired','Source','Collections','Tags','Status','Room','Bookcase','Shelf','Box','Position','Rating','Started','Finished','Read Count','Lent To','Lent Date','Due Date','Returned Date','Copy Notes','Private Review','Notes','Added','Reviewed'];
function catalogCSVText(books){
  const rows=books.map(b=>{const l=normalizeLocation(b.location);return [b.isbn,b.title,b.authors,b.series,b.seriesNumber,b.originalPublicationYear,personListInput(b.translators),personListInput(b.editors),b.year,b.publisher,b.edition,b.format,b.language,b.condition,b.copyCount,b.acquisitionDate,b.acquisitionSource,collectionNames(b).join('; '),(b.tags||[]).join('; '),b.status,l.room,l.bookcase,l.shelf,l.box,l.position,b.rating,b.startedAt,b.finishedAt,b.readCount,b.lentTo,b.lentDate,b.dueDate,b.returnedDate,b.copyNotes,b.privateReview,b.notes,b.addedAt,b.reviewed?'yes':'no'].map(csvEscape).join(',')});
  return CATALOG_CSV_HEADERS.join(',')+'\n'+rows.join('\n');
}
function doExport(books,label){
  const csv=catalogCSVText(books);
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const a=Object.assign(document.createElement('a'),{href:url,download:`stacks-${label}-${new Date().toISOString().slice(0,10)}.csv`});document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function reportBookRows(books){return (books||[]).map(b=>{const loc=locationText(b)||'—';const cols=collectionNames(b).join(', ')||'—';const tags=(b.tags||[]).join(', ')||'—';return `<tr><td>${escapeHTML(b.title||'Untitled')}</td><td>${escapeHTML(b.authors||'Unknown')}</td><td>${escapeHTML(statusLabel(b.status))}</td><td>${escapeHTML(loc)}</td><td>${escapeHTML(cols)}</td><td>${escapeHTML(tags)}</td><td>${escapeHTML(b.rating?`★ ${b.rating}`:'—')}</td><td>${escapeHTML(b.isbn||'—')}</td></tr>`;}).join('');}
function reportShell(title,subtitle,body){return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#14324a;margin:28px}h1{font-family:Georgia,serif;margin:0 0 6px}p{color:#516b80}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:16px}th,td{border:1px solid #d8e7f5;padding:7px 8px;text-align:left;vertical-align:top}th{background:#e9f4ff;color:#0f2a43}.meta{font-size:12px;color:#516b80;margin-bottom:18px}.section{margin-top:24px;break-inside:avoid}.small{font-size:12px;color:#516b80}@media print{button{display:none}body{margin:14mm}}</style></head><body><button onclick="window.print()" style="float:right;padding:8px 12px;border:1px solid #2f80d1;background:#2f80d1;color:white;border-radius:6px">Print</button><h1>${escapeHTML(title)}</h1><div class="meta">${escapeHTML(subtitle||'Generated by The Stacks')} · ${new Date().toLocaleString()}</div>${body}</body></html>`;}
function openPrintHTML(html){const w=window.open('','_blank');if(!w){alert('Pop-up blocked. Allow pop-ups to print reports.');return;}w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{try{w.focus();w.print();}catch{}},250);}
function printBookReport(title,books,subtitle=''){const safe=(books||[]).filter(Boolean);const body=`<p>${safe.length} book${safe.length===1?'':'s'} included.</p><table><thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Location</th><th>Collections</th><th>Tags</th><th>Rating</th><th>ISBN</th></tr></thead><tbody>${reportBookRows(safe)||'<tr><td colspan="8">No books.</td></tr>'}</tbody></table>`;openPrintHTML(reportShell(title,subtitle,body));}
function printLocationInventory(books,title='Location Inventory'){const groups=locationGroups(books);let body='<p>Inventory grouped by room, bookcase, shelf, and box.</p>';if(!groups.length)body+='<p>No located books found.</p>';for(const g of groups){body+=`<div class="section"><h2>${escapeHTML(g.label)}</h2><p class="small">${g.books.length} book${g.books.length===1?'':'s'}</p><table><thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Location</th><th>Collections</th><th>Tags</th><th>Rating</th><th>ISBN</th></tr></thead><tbody>${reportBookRows(g.books)}</tbody></table></div>`;}openPrintHTML(reportShell(title,`${books.length} total records checked`,body));}
function printDuplicateReport(books){const groups=possibleDuplicateGroups(books);let body=`<p>${groups.length} possible duplicate group${groups.length===1?'':'s'} found.</p>`;if(!groups.length)body+='<p>No possible duplicate records detected.</p>';for(const group of groups){body+=`<div class="section"><h2>${escapeHTML(group.label)}</h2><p class="small">${escapeHTML(group.reason)}</p><table><thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Location</th><th>Collections</th><th>Tags</th><th>Rating</th><th>ISBN</th></tr></thead><tbody>${reportBookRows(group.items)}</tbody></table></div>`;}openPrintHTML(reportShell('Possible Duplicate Report','Records that may describe the same physical copy',body));}
function printLendingReport(books){const lent=books.filter(isLentOut);const returned=books.filter(b=>b.returnedDate);const body=`<div class="section"><h2>Currently lent out</h2><table><thead><tr><th>Title</th><th>Borrower</th><th>Lent date</th><th>Due date</th><th>Status</th></tr></thead><tbody>${lent.map(b=>`<tr><td>${escapeHTML(b.title)}</td><td>${escapeHTML(b.lentTo)}</td><td>${escapeHTML(b.lentDate||'—')}</td><td>${escapeHTML(b.dueDate||'—')}</td><td>${escapeHTML(isOverdue(b)?'Overdue':'On loan')}</td></tr>`).join('')||'<tr><td colspan="5">No books currently lent out.</td></tr>'}</tbody></table></div><div class="section"><h2>Returned books</h2><table><thead><tr><th>Title</th><th>Borrower</th><th>Returned</th></tr></thead><tbody>${returned.map(b=>`<tr><td>${escapeHTML(b.title)}</td><td>${escapeHTML(b.lentTo||'—')}</td><td>${escapeHTML(b.returnedDate)}</td></tr>`).join('')||'<tr><td colspan="3">No loan history.</td></tr>'}</tbody></table></div>`;openPrintHTML(reportShell('Lending Report',`${lent.length} currently lent out`,body));}
function locationKey(book){const l=normalizeLocation(book.location);return [l.room||'Unlocated',l.bookcase||'',l.shelf?`Shelf ${l.shelf}`:'',l.box?`Box ${l.box}`:''].filter(Boolean).join(' · ');}
function locationGroups(books){const map=new Map();for(const b of (books||[]).filter(Boolean)){if(hasMissingLocation(b))continue;const location=normalizeLocation(b.location),id=JSON.stringify(['room','bookcase','shelf','box'].map(field=>String(location[field]||'').trim()));if(!map.has(id))map.set(id,[]);map.get(id).push(b);}return [...map.entries()].map(([id,items])=>({id,label:locationKey(items[0]),location:normalizeLocation(items[0]?.location),books:items.sort((a,b)=>(normalizeLocation(a.location).position||'').localeCompare(normalizeLocation(b.location).position||'')||(a.title||'').localeCompare(b.title||''))})).sort((a,b)=>a.label.localeCompare(b.label));}
function roomCounts(books){const map=new Map();for(const b of (books||[]).filter(Boolean)){const room=normalizeLocation(b.location).room||'';if(!room)continue;if(!map.has(room))map.set(room,[]);map.get(room).push(b);}return [...map.entries()].map(([room,items])=>({room,books:items})).sort((a,b)=>a.room.localeCompare(b.room));}

const REPORT_COLUMNS=[
  ['title','Title',b=>b.title||'Untitled'],['authors','Author',b=>b.authors||'Unknown'],['series','Series',b=>b.series?b.series+(b.seriesNumber?' / '+b.seriesNumber:''):'—'],['originalPublicationYear','Original publication year',b=>b.originalPublicationYear||'—'],['translators','Translator(s)',b=>personListInput(b.translators)||'—'],['editors','Editor(s)',b=>personListInput(b.editors)||'—'],['status','Status',b=>statusLabel(b.status)],['location','Location',b=>locationText(b)||'—'],['collections','Collections',b=>collectionNames(b).join(', ')||'—'],['tags','Tags',b=>(b.tags||[]).join(', ')||'—'],['rating','Rating',b=>b.rating?('★ '+b.rating):'—'],['isbn','ISBN',b=>b.isbn||'—'],['year','Year',b=>b.year||'—'],['publisher','Publisher',b=>b.publisher||'—'],['loan','Loan',b=>isLentOut(b)?((b.lentTo||'Lent')+(b.dueDate?(' / due '+b.dueDate):'')):(b.returnedDate?('Returned '+b.returnedDate):'—')],['quality','Quality',b=>metadataScore(b,[])+'%'],['review','Review',b=>needsReview(b,[])?'Needs review':(b.reviewed?'Reviewed':'—')]
];
function printCustomBookReport({title,subtitle,books,columns}){const cols=(columns&&columns.length?columns:['title','authors','status','location','collections','tags','rating','isbn']).map(id=>REPORT_COLUMNS.find(c=>c[0]===id)).filter(Boolean);const safe=(books||[]).filter(Boolean);const head=cols.map(([,label])=>'<th>'+escapeHTML(label)+'</th>').join('');const rows=safe.map(b=>'<tr>'+cols.map(([,label,fn])=>'<td>'+escapeHTML(fn(b))+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+(cols.length||1)+'">No books.</td></tr>';const body='<p>'+safe.length+' book'+(safe.length===1?'':'s')+' included.</p><table><thead><tr>'+head+'</tr></thead><tbody>'+rows+'</tbody></table>';openPrintHTML(reportShell(title||'Catalog Report',subtitle||'Generated from The Stacks',body));}
function cleanupSummary(books){const safe=(books||[]).filter(Boolean);const dup=duplicateGroups(safe);return {review:safe.filter(b=>needsReview(b,safe)),covers:safe.filter(b=>!b.cover),locations:safe.filter(hasMissingLocation),duplicates:dup,quality:safe.filter(b=>metadataScore(b,safe)<70),lent:safe.filter(isLentOut),overdue:safe.filter(isOverdue)}}
function locationValueFromLabel(label){const parts=String(label||'').split(' · ');return {room:(parts[0]||'').replace(/^Unlocated$/,''),bookcase:parts[1]||'',shelf:(parts[2]||'').replace(/^Shelf /,''),box:(parts[3]||'').replace(/^Box /,''),position:''};}
function sameLocation(a,b){a=normalizeLocation(a);b=normalizeLocation(b);return ['room','bookcase','shelf','box'].every(k=>String(a[k]||'').trim()===String(b[k]||'').trim());}
const LOCATION_LEVELS=[['bookcase','Bookcase'],['shelf','Shelf'],['room','Room'],['box','Box']];
function locationMatchesPath(book,path){const location=normalizeLocation(book?.location);return LOCATION_LEVELS.every(([field])=>!String(path?.[field]||'').trim()||String(location[field]||'').trim()===String(path[field]).trim());}
function buildLocationTree(books=[]){
  const root={id:'locations',field:'root',label:'Locations',path:blankLocation(),copyIds:[],books:[],children:new Map()},seen=new Set();
  for(const book of (books||[]).filter(Boolean)){
    if(hasMissingLocation(book))continue;
    const copyId=String(book.copyId||book.id||'').trim();if(!copyId||seen.has(copyId))continue;seen.add(copyId);
    const location=normalizeLocation(book.location);root.copyIds.push(copyId);root.books.push(book);let parent=root;const path=blankLocation();
    for(const [field,typeLabel] of LOCATION_LEVELS){
      const label=String(location[field]||'').trim();if(!label)continue;path[field]=label;const key=field+':'+label;
      if(!parent.children.has(key))parent.children.set(key,{id:LOCATION_LEVELS.map(([name])=>path[name]?name+'='+path[name]:'').filter(Boolean).join('|'),field,typeLabel,label,path:{...path},copyIds:[],books:[],children:new Map()});
      parent=parent.children.get(key);parent.copyIds.push(copyId);parent.books.push(book);
    }
  }
  const finish=node=>({...node,children:[...node.children.values()].map(finish).sort((a,b)=>LOCATION_LEVELS.findIndex(([field])=>field===a.field)-LOCATION_LEVELS.findIndex(([field])=>field===b.field)||a.label.localeCompare(b.label,undefined,{sensitivity:'base',numeric:true}))});
  return finish(root);
}
function locationSuggestions(books=[],destination=blankLocation()){
  const safe=(books||[]).filter(Boolean),room=String(destination.room||'').trim(),bookcase=String(destination.bookcase||'').trim(),shelf=String(destination.shelf||'').trim();
  const values=field=>uniq(safe.filter(book=>{const l=normalizeLocation(book.location);if(field!=='room'&&room&&l.room!==room)return false;if(['shelf','box'].includes(field)&&bookcase&&l.bookcase!==bookcase)return false;if(field==='box'&&shelf&&l.shelf!==shelf)return false;return true;}).map(book=>normalizeLocation(book.location)[field])).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true}));
  return {room:values('room'),bookcase:values('bookcase'),shelf:values('shelf'),box:values('box')};
}
function updateCopyLocationsInBooks(books=[],copyIds=[],destination=blankLocation(),updatedAt=new Date().toISOString()){
  const ids=new Set(uniq(copyIds)),multiple=ids.size>1,target=normalizeLocation(destination),previous={};let changed=0;
  const next=(books||[]).filter(Boolean).map(book=>{const copyId=String(book.copyId||book.id||'');if(!ids.has(copyId))return book;const old=normalizeLocation(book.location);previous[copyId]={...old};changed++;return normalizeBook({...book,location:{room:target.room,bookcase:target.bookcase,shelf:target.shelf,box:target.box,position:multiple?old.position:target.position},updatedAt});});
  return {books:next,previous,changed};
}
function restoreCopyLocationsInBooks(books=[],previous={},updatedAt=new Date().toISOString()){return (books||[]).filter(Boolean).map(book=>{const copyId=String(book.copyId||book.id||'');return previous[copyId]?normalizeBook({...book,location:normalizeLocation(previous[copyId]),updatedAt}):book;});}
function hasMoveDestination(location){const l=normalizeLocation(location);return Boolean(String(l.bookcase||'').trim()&&String(l.shelf||'').trim());}
function moveExactCopiesInBooks(books=[],copyIds=[],destination=blankLocation(),updatedAt=new Date().toISOString()){
  const ids=new Set((copyIds||[]).map(id=>String(id||'').trim()).filter(Boolean)),found=new Set(),previous={},movedIds=[],alreadyIds=[];
  const target=normalizeLocation(destination);
  const next=(books||[]).filter(Boolean).map(book=>{
    const id=String(book.copyId||book.id||'');if(!ids.has(id))return book;found.add(id);
    const old=normalizeLocation(book.location);
    if(sameLocation(old,target)){alreadyIds.push(id);return book;}
    previous[id]={...old};movedIds.push(id);
    return normalizeBook({...book,location:{...target,position:old.position},updatedAt});
  });
  return {books:next,previous,movedIds,alreadyIds,missingIds:[...ids].filter(id=>!found.has(id)),changed:movedIds.length};
}
function undoExactCopyMoveInBooks(books=[],previous={},destination=blankLocation(),updatedAt=new Date().toISOString()){
  const ids=Object.keys(previous),byId=new Map((books||[]).filter(Boolean).map(book=>[String(book.copyId||book.id||''),book]));
  if(!ids.length||ids.some(id=>!byId.has(id)||!sameLocation(byId.get(id).location,destination)||normalizeLocation(byId.get(id).location).position!==normalizeLocation(previous[id]).position))return {books,restored:0,conflict:true};
  return {books:restoreCopyLocationsInBooks(books,previous,updatedAt),restored:ids.length,conflict:false};
}
function updateEntireLocationInBooks(books=[],from=blankLocation(),to=blankLocation(),updatedAt=new Date().toISOString()){from=normalizeLocation(from);to=normalizeLocation(to);let changed=0;const next=(books||[]).filter(Boolean).map(book=>{if(!sameLocation(book.location,from))return book;const old=normalizeLocation(book.location);changed++;return normalizeBook({...book,location:{room:to.room,bookcase:to.bookcase,shelf:to.shelf,box:to.box,position:old.position},updatedAt});});return {books:next,changed};}
function clearEntireLocationInBooks(books=[],from=blankLocation(),updatedAt=new Date().toISOString()){from=normalizeLocation(from);let changed=0;const next=(books||[]).filter(Boolean).map(book=>{if(!sameLocation(book.location,from))return book;changed++;return normalizeBook({...book,location:blankLocation(),updatedAt});});return {books:next,changed};}

function parseCSV(text){const rows=[];let row=[],cell='',q=false;text=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const ch=text[i],nx=text[i+1];if(q){if(ch==='"'&&nx==='"'){cell+='"';i++;}else if(ch==='"')q=false;else cell+=ch;}else{if(ch==='"')q=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}}row.push(cell);rows.push(row);return rows.filter(r=>r.some(c=>String(c).trim()));}
function csvRowsToBooks(text){const rows=parseCSV(text);if(rows.length<2)return[];const headers=rows[0].map(h=>h.trim().toLowerCase());const idx=n=>headers.indexOf(n.toLowerCase());const get=(r,n)=>{const i=idx(n);return i>=0?String(r[i]||'').trim():''};return rows.slice(1).map(r=>normalizeBook({isbn:get(r,'ISBN'),title:get(r,'Title'),authors:get(r,'Authors'),series:get(r,'Series'),seriesNumber:get(r,'Series Number'),originalPublicationYear:get(r,'Original Publication Year'),translators:normalizePersonList(get(r,'Translators')),editors:normalizePersonList(get(r,'Editors')),year:get(r,'Year'),publisher:get(r,'Publisher'),edition:get(r,'Edition'),format:get(r,'Format'),language:get(r,'Language'),condition:get(r,'Condition'),copyCount:get(r,'Copies'),acquisitionDate:get(r,'Acquired'),acquisitionSource:get(r,'Source'),collections:uniq((get(r,'Collections')||get(r,'Shelves')||get(r,'Shelf')).split(';')),tags:uniq(get(r,'Tags').split(';')),status:get(r,'Status')||'unread',location:{room:get(r,'Room'),bookcase:get(r,'Bookcase'),shelf:get(r,'Shelf'),box:get(r,'Box'),position:get(r,'Position')},rating:get(r,'Rating'),startedAt:get(r,'Started'),finishedAt:get(r,'Finished'),readCount:get(r,'Read Count'),lentTo:get(r,'Lent To'),lentDate:get(r,'Lent Date'),dueDate:get(r,'Due Date'),returnedDate:get(r,'Returned Date'),copyNotes:get(r,'Copy Notes'),privateReview:get(r,'Private Review'),notes:get(r,'Notes'),addedAt:get(r,'Added'),reviewed:/^(yes|true|1)$/i.test(get(r,'Reviewed'))})).filter(b=>b.title||b.isbn);}
const METADATA_REQUEST_TIMEOUT_MS=7000;
const ISBN_METADATA_PROMISE_CACHE=new Map();
const IDENTIFICATION_SEARCH_PROMISE_CACHE=new Map();
const METADATA_PROVIDER_PRIORITY={openlibrary:0,google:1,dnb:2,loc:3};
const LOC_PROXY_URL='https://the-stacks-loc-proxy.kasper-sebastian83.workers.dev/api/loc';
const GOOGLE_BOOKS_PROXY_URL='https://the-stacks-google-books.kasper-sebastian83.workers.dev/api/google-books';
const LANGUAGE_LABELS={ger:'German',de:'German',eng:'English',en:'English',fre:'French',fra:'French',fr:'French',spa:'Spanish',es:'Spanish',ita:'Italian',it:'Italian',dut:'Dutch',nld:'Dutch',nl:'Dutch'};
const TRANSIENT_METADATA_STATUS=new Set([429,502,503,504]);

function metadataFailureState(value){
  if(value?.status===429)return'RATE_LIMITED';if(TRANSIENT_METADATA_STATUS.has(value?.status))return'TEMPORARY_ERROR';if(value&&value.ok===false)return'HTTP_ERROR';if(value?.name==='AbortError')return'TIMEOUT';if(value instanceof SyntaxError)return'PARSE_ERROR';return'TEMPORARY_ERROR';
}
function recordMetadataTrace(options,provider,strategy,state,detail={}){if(Array.isArray(options?.trace))options.trace.push({provider,strategy,state,...detail});}
function metadataRetryDelay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fetchMetadataResponse(url,fetchImpl=fetch,timeoutMs=METADATA_REQUEST_TIMEOUT_MS,options={}){
  const attempts=options.retry===false?1:2;let lastError;
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);let response;
    try{
      response=await fetchImpl(url,{signal:controller.signal});
    }catch(err){lastError=err;if(attempt+1>=attempts)throw err;}
    finally{clearTimeout(timer);}
    if(response&&!TRANSIENT_METADATA_STATUS.has(response.status))return response;
    if(response&&attempt+1>=attempts)return response;
    await metadataRetryDelay(options.retryDelayMs??650);
  }
  throw lastError||new Error('Metadata request failed');
}
function normalizedCandidateIsbns(meta){
  return uniq([...(Array.isArray(meta?.isbns)?meta.isbns:[]),meta?.isbn||''].map(normalizeISBN).filter(isbn=>isbn&&isValidISBN(isbn)).map(toISBN13));
}
function isExactIsbnCandidate(meta,requestedIsbn){
  const requested=toISBN13(normalizeISBN(requestedIsbn));
  return Boolean(requested&&isValidISBN(requested)&&normalizedCandidateIsbns(meta).includes(requested));
}
function metadataQuality(meta){
  if(!String(meta?.title||'').trim())return 0;
  return 3+(meta.authors?2:0)+(meta.publisher?1:0)+(meta.year?1:0)+(meta.language?1:0)+(meta.edition?1:0)+(meta.format?1:0);
}
function metadataQualityLevel(meta){const score=metadataQuality(meta);return score===0?'none':score>=7?'good':'weak';}
function providerPriority(meta){return METADATA_PROVIDER_PRIORITY[meta?.metadataProvider]??9;}
function selectBestExactMetadataCandidates(candidates,requestedIsbn){
  // Equal quality: prefer physical material, then provider priority, then stable response order.
  return candidates.filter(Boolean).map(normalizeMetadataCandidate).filter(candidate=>isExactIsbnCandidate(candidate,requestedIsbn)).map((candidate,index)=>({...candidate,isbn:toISBN13(requestedIsbn),exactIsbn:true,bibliographicQuality:metadataQuality(candidate),_providerOrder:index})).sort((a,b)=>(b.bibliographicQuality||0)-(a.bibliographicQuality||0)||Number(b.isPhysical)-Number(a.isPhysical)||providerPriority(a)-providerPriority(b)||(a._providerOrder||0)-(b._providerOrder||0)).map(({_providerOrder,...candidate})=>candidate);
}
function hasGoodExactMetadata(candidates,isbn){return selectBestExactMetadataCandidates(candidates,isbn).some(candidate=>metadataQualityLevel(candidate)==='good');}
function hasUsableMetadata(meta){return metadataQualityLevel(meta)!=='none';}
function normalizeMetadataCandidate(meta){meta=meta||{};return {...meta,originalPublicationYear:normalizeOriginalPublicationYear(meta.originalPublicationYear),series:normalizeSeriesText(meta.series),seriesNumber:normalizeSeriesNumber(meta.seriesNumber),translators:normalizePersonList(meta.translators),editors:normalizePersonList(meta.editors)};}
function contributorRoleKind(value){const role=String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const code=role.split(/[\/#]/).pop().replace(/[^a-z]/g,'');if(code==='trl'||/(^|\b)(translator|ubersetzer(?:in)?|traducteur|traductor)(\b|$)/.test(role))return'translator';if(code==='edt'||/(^|\b)(editor|herausgeber(?:in)?|editeur|redakteur)(\b|$)/.test(role))return'editor';return'';}

function marcElements(node,localName){return node?Array.from(node.getElementsByTagNameNS('*',localName)||[]):[];}
function marcDatafields(record,tag){return marcElements(record,'datafield').filter(field=>field.getAttribute('tag')===tag);}
function marcControlfield(record,tag){return marcElements(record,'controlfield').find(field=>field.getAttribute('tag')===tag)?.textContent?.trim()||'';}
function marcSubfields(field,code){return marcElements(field,'subfield').filter(item=>item.getAttribute('code')===code).map(item=>String(item.textContent||'').trim()).filter(Boolean);}
function firstMarcSubfield(record,tag,code,filter){const field=marcDatafields(record,tag).find(item=>!filter||filter(item));return field?marcSubfields(field,code)[0]||'':'';}
function cleanMarcText(value){return String(value||"").trim().replace(/\s*[\/:;,]\s*$/,"").trim();}
function marcContributors(record){const translators=[],editors=[];marcDatafields(record,'700').forEach(field=>{const name=cleanMarcText(marcSubfields(field,'a')[0]||'');if(!name)return;const roles=[...marcSubfields(field,'4'),...marcSubfields(field,'e')].map(contributorRoleKind);if(roles.includes('translator'))translators.push(name);if(roles.includes('editor'))editors.push(name);});return{translators:normalizePersonList(translators),editors:normalizePersonList(editors)};}
function marcIsbns(record){return uniq(marcDatafields(record,'020').flatMap(field=>marcSubfields(field,'a')).flatMap(extractMarcIsbn));}
function marcPrimaryAuthor(record){
  const field=marcDatafields(record,'100')[0];if(!field)return'';
  const roles=[...marcSubfields(field,'4'),...marcSubfields(field,'e')].map(value=>value.toLowerCase());
  if(roles.length&&!roles.some(role=>role==='aut'||/author|verfasser|auteur/.test(role)))return'';
  return cleanMarcText(marcSubfields(field,'a')[0]||'');
}
function marcPublication(record){
  const preferred264=marcDatafields(record,'264').find(field=>field.getAttribute('ind2')==='1');
  const field=preferred264||marcDatafields(record,'264')[0]||marcDatafields(record,'260')[0];
  if(!field)return{publisher:'',year:''};
  const publisher=cleanMarcText(marcSubfields(field,'b')[0]||'');
  const rawYear=marcSubfields(field,'c')[0]||'';
  const year=rawYear.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1]||'';
  return{publisher,year};
}
function marcLanguage(record){
  const code=(firstMarcSubfield(record,'041','a')||marcControlfield(record,'008').slice(35,38)).toLowerCase();
  return LANGUAGE_LABELS[code]||code;
}
function marcMaterial(record){
  const carrier=firstMarcSubfield(record,'338','a').toLowerCase();
  const media=firstMarcSubfield(record,'337','a').toLowerCase();
  const field007=marcControlfield(record,'007').toLowerCase();
  const online=carrier.includes('online')||media.includes('computer')||field007.startsWith('cr');
  if(online)return{format:'E-book',isPhysical:false};
  if(carrier.includes('volume')||media.includes('unmediated')||field007.startsWith('ta')||field007.startsWith('tu'))return{format:'Print book',isPhysical:true};
  return{format:'',isPhysical:false};
}
function parseMarcBibliographicRecord(record,{provider,label}={}){
  if(!record)return null;
  const isbns=marcIsbns(record);
  const titleMain=cleanMarcText(firstMarcSubfield(record,'245','a'));
  const subtitle=cleanMarcText(firstMarcSubfield(record,'245','b'));
  const publication=marcPublication(record);
  const material=marcMaterial(record);
  const contributors=marcContributors(record);
  const pages=firstMarcSubfield(record,'300','a').match(/\b(\d{1,5})\b/)?.[1]||'';
  const recordId=provider==='loc'?cleanMarcText(firstMarcSubfield(record,'010','a')||marcControlfield(record,'001')):marcControlfield(record,'001');
  return{title:[titleMain,subtitle].filter(Boolean).join(': '),authors:marcPrimaryAuthor(record),year:publication.year,publisher:publication.publisher,pages,language:marcLanguage(record),edition:cleanMarcText(firstMarcSubfield(record,'250','a')),format:material.format,translators:contributors.translators,editors:contributors.editors,originalPublicationYear:'',series:'',seriesNumber:'',cover:'',tags:[],isbn:isbns[0]||'',isbns,isPhysical:material.isPhysical,externalRecordId:recordId,metadataProvider:provider||'',metadataSource:label||'',metadataConfidence:'High',metadataMatchMethod:'Exact ISBN via SRU'};
}
function parseSruMarcResponse(xmlText,provider){
  try{
    const doc=new DOMParser().parseFromString(String(xmlText||''),'application/xml');
    if(marcElements(doc,'parsererror').length||marcElements(doc,'diagnostic').length)return[];
    const label=provider==='dnb'?'Deutsche Nationalbibliothek':'Library of Congress';
    return marcElements(doc,'record').filter(record=>String(record.namespaceURI||'').includes('MARC21')).map(record=>parseMarcBibliographicRecord(record,{provider,label})).filter(Boolean);
  }catch{return[];}
}
function buildDnbSruUrl(isbn){const url=new URL('https://services.dnb.de/sru/dnb');url.search=new URLSearchParams({version:'1.1',operation:'searchRetrieve',query:`dnb.isbn="${toISBN13(isbn)}"`,maximumRecords:'5',recordSchema:'MARC21-xml'});return url.toString();}
function buildLcSruUrl(isbn){const url=new URL('https://lx2.loc.gov/sru/lcdb');url.search=new URLSearchParams({version:'1.1',operation:'searchRetrieve',query:`bath.isbn="${toISBN13(isbn)}"`,maximumRecords:'5',recordSchema:'marcxml'});return url.toString();}
function buildLcProxyUrl(isbn){const url=new URL(LOC_PROXY_URL);url.search=new URLSearchParams({isbn:toISBN13(isbn)});return url.toString();}
function buildGoogleBooksProxyUrl(isbn){const normalized=normalizeISBN(isbn);if(!normalized||!isValidISBN(normalized))return'';const url=new URL(GOOGLE_BOOKS_PROXY_URL);url.search=new URLSearchParams({isbn:normalized});return url.toString();}
async function lookupSruProviderByIsbn(isbn,{provider,url,fetchImpl=fetch,trace,retryDelayMs,timeoutMs=METADATA_REQUEST_TIMEOUT_MS}={}){
  const options={trace,retryDelayMs};
  try{const response=await fetchMetadataResponse(url,fetchImpl,timeoutMs,options);if(!response.ok){recordMetadataTrace(options,provider,'exact-isbn',metadataFailureState(response),{httpStatus:response.status});return[];}const candidates=parseSruMarcResponse(await response.text(),provider);const exact=selectBestExactMetadataCandidates(candidates,isbn);recordMetadataTrace(options,provider,'exact-isbn',exact.length?'FOUND':(candidates.length?'WRONG_ISBN':'NO_RECORD'));return exact;}catch(err){recordMetadataTrace(options,provider,'exact-isbn',metadataFailureState(err));return[];}
}
async function lookupDnbByIsbn(isbn,options={}){return lookupSruProviderByIsbn(isbn,{provider:'dnb',url:buildDnbSruUrl(isbn),...options});}
async function lookupLibraryOfCongressByIsbn(isbn,options={}){return lookupSruProviderByIsbn(isbn,{provider:'loc',url:buildLcProxyUrl(isbn),...options});}
const BROWSER_NATIONAL_LIBRARY_PROVIDERS=[lookupDnbByIsbn,lookupLibraryOfCongressByIsbn];

function openLibraryContributorNames(book,kind){return normalizePersonList((Array.isArray(book?.contributors)?book.contributors:[]).filter(contributor=>contributor&&typeof contributor==='object'&&contributorRoleKind(contributor.role)===kind).map(contributor=>contributor.name));}
function openLibraryBookToMeta(book,isbn){
  if(!book)return null;
  const identifiers=book.identifiers||{};
  const isbns=uniq([...(identifiers.isbn_13||[]),...(identifiers.isbn_10||[])].map(normalizeISBN).filter(value=>value&&isValidISBN(value)).map(toISBN13));
  return{title:book.title||'',authors:(book.authors||[]).map(author=>author.name).join(', '),year:book.publish_date?(String(book.publish_date).match(/\d{4}/)?.[0]||''):'',publisher:(book.publishers||[]).map(publisher=>publisher.name).join(', '),pages:book.number_of_pages||'',language:'',edition:'',format:'',originalPublicationYear:structuredOriginalPublicationYear(book.first_publish_date||book.first_publish_year),series:'',seriesNumber:'',translators:openLibraryContributorNames(book,'translator'),editors:openLibraryContributorNames(book,'editor'),tags:(book.subjects||[]).slice(0,5).map(subject=>typeof subject==='string'?subject:subject.name).filter(Boolean),cover:book.cover?.large||book.cover?.medium||`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,isbn:isbns[0]||'',isbns,metadataProvider:'openlibrary',metadataSource:'Open Library',metadataConfidence:'High',metadataMatchMethod:'Exact ISBN via Open Library'};
}
async function lookupOpenLibraryISBNCandidates(isbn,options={}){
  const requested=toISBN13(isbn);if(!requested||!isValidISBN(requested))return[];const variants=isbnVariants(isbn);const fetchImpl=options.fetchImpl||fetch;const requestOptions={trace:options.trace,retryDelayMs:options.retryDelayMs};
  for(const variant of variants){
    try{const response=await fetchMetadataResponse(`https://openlibrary.org/api/books?bibkeys=ISBN:${variant}&format=json&jscmd=data`,fetchImpl,options.timeoutMs||METADATA_REQUEST_TIMEOUT_MS,requestOptions);if(!response.ok){recordMetadataTrace(options,'openlibrary','books-api-'+variant,metadataFailureState(response),{httpStatus:response.status});continue;}const data=await response.json();const candidate=openLibraryBookToMeta(data[`ISBN:${variant}`],variant);const exact=selectBestExactMetadataCandidates([candidate],requested);recordMetadataTrace(options,'openlibrary','books-api-'+variant,exact.length?'FOUND':(candidate?'WRONG_ISBN':'NO_RECORD'));if(exact.length)return exact;}catch(err){recordMetadataTrace(options,'openlibrary','books-api-'+variant,metadataFailureState(err));}
  }
  for(const variant of variants){
    try{const params=new URLSearchParams({isbn:variant,limit:'5'});const response=await fetchMetadataResponse('https://openlibrary.org/search.json?'+params.toString(),fetchImpl,options.timeoutMs||METADATA_REQUEST_TIMEOUT_MS,requestOptions);if(!response.ok){recordMetadataTrace(options,'openlibrary','search-api-'+variant,metadataFailureState(response),{httpStatus:response.status});continue;}const data=await response.json();const candidates=(data.docs||[]).map(openLibraryDocToMeta).filter(Boolean).map(candidate=>({...candidate,metadataConfidence:'High',metadataMatchMethod:'Exact ISBN via Open Library Search'}));const exact=selectBestExactMetadataCandidates(candidates,requested);recordMetadataTrace(options,'openlibrary','search-api-'+variant,exact.length?'FOUND':(candidates.length?'WRONG_ISBN':'NO_RECORD'));if(exact.length)return exact;}catch(err){recordMetadataTrace(options,'openlibrary','search-api-'+variant,metadataFailureState(err));}
  }
  return[];
}
async function lookupOpenLibrary(isbn){return (await lookupOpenLibraryISBNCandidates(toISBN13(isbn)))[0]||null;}
function googleVolumeToMeta(volume){
  if(!volume)return null;
  const isbns=uniq((volume.industryIdentifiers||[]).map(item=>normalizeISBN(item.identifier)).filter(isbn=>isbn&&isValidISBN(isbn)).map(toISBN13));
  return normalizeMetadataCandidate({title:volume.title||'',authors:(volume.authors||[]).join(', '),year:volume.publishedDate?(String(volume.publishedDate).match(/\d{4}/)?.[0]||''):'',publisher:volume.publisher||'',pages:volume.pageCount||'',language:LANGUAGE_LABELS[String(volume.language||'').toLowerCase()]||volume.language||'',edition:'',format:volume.printType==='BOOK'?'Print book':'',tags:(volume.categories||[]).slice(0,5),cover:volume.imageLinks?.extraLarge||volume.imageLinks?.large||volume.imageLinks?.thumbnail||'',isbn:isbns[0]||'',isbns,metadataProvider:'google',metadataSource:'Google Books',metadataConfidence:'High',metadataMatchMethod:'Exact ISBN via Google Books'});
}
async function lookupGoogleBooksISBNCandidates(isbn,book,options={}){
  const requested=toISBN13(isbn);if(!requested||!isValidISBN(requested))return[];const fetchImpl=options.fetchImpl||fetch;const requestOptions={trace:options.trace,retryDelayMs:options.retryDelayMs};
  for(const variant of isbnVariants(isbn)){
    try{const response=await fetchMetadataResponse(buildGoogleBooksProxyUrl(variant),fetchImpl,options.timeoutMs||METADATA_REQUEST_TIMEOUT_MS,requestOptions);if(!response.ok){recordMetadataTrace(options,'google','secure-proxy-isbn-'+variant,metadataFailureState(response),{httpStatus:response.status});continue;}const data=await response.json();const candidates=(data.items||[]).map(item=>googleVolumeToMeta(item.volumeInfo)).filter(Boolean);const exact=selectBestExactMetadataCandidates(candidates,requested).map(candidate=>book?enrichCandidateMeta(book,candidate,{metadataSource:'Google Books',metadataMatchMethod:'Exact ISBN via Google Books'}):candidate);recordMetadataTrace(options,'google','secure-proxy-isbn-'+variant,exact.length?'FOUND':(candidates.length?'WRONG_ISBN':'NO_RECORD'));if(exact.length)return exact;}catch(err){recordMetadataTrace(options,'google','secure-proxy-isbn-'+variant,metadataFailureState(err));}
  }
  return[];
}
async function lookupGoogleBooks(isbn){return (await lookupGoogleBooksISBNCandidates(toISBN13(isbn)))[0]||null;}

async function orchestrateISBNMetadata(isbn,providers={}){
  const requested=toISBN13(normalizeISBN(isbn));if(!requested||!isValidISBN(requested))return[];
  const openLibrary=providers.openLibrary||lookupOpenLibraryISBNCandidates;
  const google=providers.google||((value)=>lookupGoogleBooksISBNCandidates(value));
  const nationalLibraries=providers.nationalLibraries||BROWSER_NATIONAL_LIBRARY_PROVIDERS;
  const candidates=[];
  const safeLookup=async lookup=>{try{const result=await lookup(requested);return Array.isArray(result)?result:result?[result]:[];}catch{return[];}};
  candidates.push(...await safeLookup(openLibrary));
  if(hasGoodExactMetadata(candidates,requested))return selectBestExactMetadataCandidates(candidates,requested);
  candidates.push(...await safeLookup(google));
  if(hasGoodExactMetadata(candidates,requested))return selectBestExactMetadataCandidates(candidates,requested);
  const nationalResults=await Promise.all(nationalLibraries.map(safeLookup));
  nationalResults.forEach(result=>candidates.push(...result));
  return selectBestExactMetadataCandidates(candidates,requested);
}
function lookupISBNMetadataBaseCandidates(isbn){
  const requested=toISBN13(normalizeISBN(isbn));if(!requested||!isValidISBN(requested))return Promise.resolve([]);
  if(!ISBN_METADATA_PROMISE_CACHE.has(requested)){
    const request=orchestrateISBNMetadata(requested);ISBN_METADATA_PROMISE_CACHE.set(requested,request);
    request.then(candidates=>{if(!candidates.length&&ISBN_METADATA_PROMISE_CACHE.get(requested)===request)ISBN_METADATA_PROMISE_CACHE.delete(requested);},()=>ISBN_METADATA_PROMISE_CACHE.delete(requested));
  }
  return ISBN_METADATA_PROMISE_CACHE.get(requested);
}
async function lookupISBNMetadataCandidates(isbn,book){return (await lookupISBNMetadataBaseCandidates(isbn)).map(candidate=>enrichCandidateMeta(book||{isbn},candidate,{metadataSource:candidate.metadataSource,metadataMatchMethod:candidate.metadataMatchMethod}));}
async function lookupBook(isbn){return (await lookupISBNMetadataBaseCandidates(isbn))[0]||null;}

async function lookupGoogleBooksText(title,authors){
  try{
    const terms=[];if(String(title||'').trim())terms.push('intitle:'+String(title).trim());
    const firstAuthor=String(authors||'').split(',')[0].trim();if(firstAuthor)terms.push('inauthor:'+firstAuthor);if(!terms.length)return null;
    const response=await fetchMetadataResponse('https://www.googleapis.com/books/v1/volumes?q='+encodeURIComponent(terms.join(' '))+'&maxResults=5');if(!response.ok)return null;
    const data=await response.json();const targetTitle=normalizedTitle(title),targetAuthor=normalizedTitle(firstAuthor);
    const scored=(data.items||[]).map(item=>{const volume=item.volumeInfo||{};const foundTitle=normalizedTitle(volume.title||''),foundAuthor=normalizedTitle((volume.authors||[]).join(' '));let score=0;if(foundTitle&&targetTitle&&foundTitle===targetTitle)score+=4;else if(foundTitle&&targetTitle&&(foundTitle.includes(targetTitle)||targetTitle.includes(foundTitle)))score+=2;if(foundAuthor&&targetAuthor&&foundAuthor.includes(targetAuthor))score+=3;if(volume.industryIdentifiers?.length)score++;if(volume.imageLinks?.thumbnail)score++;return{volume,score};}).sort((a,b)=>b.score-a.score);
    const meta=googleVolumeToMeta(scored[0]?.volume);return meta?{...meta,metadataConfidence:'Medium',metadataMatchMethod:'Title/author search'}:null;
  }catch{return null;}
}
async function lookupBookByText(book){return lookupGoogleBooksText(book?.title,book?.authors);}
function metadataCandidateKey(meta){return [meta.metadataProvider||meta.metadataSource||'',normalizedCandidateIsbns(meta).join(','),normalizedTitle(meta.title||''),normalizedTitle(meta.authors||''),String(meta.year||'')].join('|');}
function scoreMetadataCandidate(book,meta){
  const cur=normalizeBook(book||{}),title=normalizedTitle(cur.title||''),author=normalizedTitle((cur.authors||'').split(',')[0]||''),foundTitle=normalizedTitle(meta.title||''),foundAuthor=normalizedTitle((meta.authors||'').split(',')[0]||meta.authors||'');let score=0;
  if(cur.isbn&&isExactIsbnCandidate(meta,cur.isbn))score+=50;if(title&&foundTitle&&foundTitle===title)score+=24;else if(title&&foundTitle&&(foundTitle.includes(title)||title.includes(foundTitle)))score+=14;if(author&&foundAuthor&&(foundAuthor.includes(author)||author.includes(foundAuthor)))score+=16;if(meta.year&&cur.year&&String(meta.year)===String(cur.year))score+=5;if(meta.cover)score+=3;if(meta.publisher)score+=2;if(meta.pages)score+=2;if((meta.tags||[]).length)score+=2;return Math.min(100,score);
}
function enrichCandidateMeta(book,meta,extra={}){if(!meta)return null;meta=normalizeMetadataCandidate(meta);const score=scoreMetadataCandidate(book,meta),confidence=meta.metadataConfidence||(score>=75?'High':score>=45?'Medium':'Low'),fields=replaceableMetadataFields(meta).length;return{...meta,candidateId:genId(),candidateScore:score,candidateFields:fields,bibliographicQuality:metadataQuality(meta),metadataConfidence:confidence,...extra};}
function dedupeMetadataCandidates(candidates){
  const seen=new Set(),out=[];for(const candidate of candidates.filter(Boolean)){const key=metadataCandidateKey(candidate);if(seen.has(key))continue;seen.add(key);out.push(candidate);}
  return out.sort((a,b)=>a.exactIsbn&&b.exactIsbn?(b.bibliographicQuality||0)-(a.bibliographicQuality||0)||providerPriority(a)-providerPriority(b):(b.candidateScore||0)-(a.candidateScore||0)||(b.candidateFields||0)-(a.candidateFields||0));
}
async function lookupGoogleBooksTextCandidates(title,authors,book){
  const meta=await lookupGoogleBooksText(title,authors);return meta?[enrichCandidateMeta(book,meta,{metadataSource:'Google Books',metadataMatchMethod:'Title/author candidate'})]:[];
}
function openLibraryDocToMeta(doc){
  if(!doc)return null;const isbns=uniq((doc.isbn||[]).map(normalizeISBN).filter(isbn=>isbn&&isValidISBN(isbn)).map(toISBN13));
  return{title:doc.title||'',authors:(doc.author_name||[]).slice(0,3).join(', '),year:'',originalPublicationYear:normalizeOriginalPublicationYear(doc.first_publish_year),series:'',seriesNumber:'',translators:[],editors:[],publisher:(doc.publisher||[])[0]||'',pages:doc.number_of_pages_median||'',language:LANGUAGE_LABELS[String((doc.language||[])[0]||'').toLowerCase()]||(doc.language||[])[0]||'',edition:'',format:'',tags:(doc.subject||[]).slice(0,5),cover:doc.cover_i?`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`:(isbns[0]?coverUrlFromISBN(isbns[0]):''),isbn:isbns[0]||'',isbns,metadataProvider:'openlibrary',metadataSource:'Open Library',metadataConfidence:'Medium',metadataMatchMethod:'Title/author search'};
}
async function lookupOpenLibrarySearchCandidates(title,authors,book){
  try{const text=String(title||'').trim(),author=String(authors||'').split(',')[0].trim();if(!text&&!author)return[];const params=new URLSearchParams();if(text)params.set('title',text);if(author)params.set('author',author);params.set('limit','10');const response=await fetchMetadataResponse('https://openlibrary.org/search.json?'+params.toString());if(!response.ok)return[];const data=await response.json();return(data.docs||[]).map(doc=>enrichCandidateMeta(book,openLibraryDocToMeta(doc),{metadataSource:'Open Library',metadataMatchMethod:'Title/author candidate'}));}catch{return[];}
}
function identificationQueryText(value){return String(value||'').trim().replace(/\s+/g,' ');}
function isIdentificationPlaceholderTitle(value){return isUnidentifiedTitle(value)||/^(Unknown book|Untitled)$/i.test(identificationQueryText(value));}
function hasMeaningfulIdentificationTitle(value){return !isIdentificationPlaceholderTitle(value)&&identificationQueryText(value).replace(/\s/g,'').length>=3;}
function identificationTokens(value){return uniq(normalizedTitle(value).split(' ').filter(token=>token.length>1));}
function identificationTextSimilarity(query,value){
  const wanted=normalizedTitle(query),found=normalizedTitle(value);if(!wanted||!found)return 0;if(wanted===found)return 1;if(wanted.includes(found)||found.includes(wanted))return .78;
  const wantedTokens=identificationTokens(wanted),foundTokens=new Set(identificationTokens(found));if(!wantedTokens.length)return 0;return wantedTokens.filter(token=>foundTokens.has(token)).length/wantedTokens.length;
}
function identificationCandidateScore(candidate,{title,author}={}){
  const titleScore=identificationTextSimilarity(title,candidate.title),authorScore=author?identificationTextSimilarity(author,candidate.authors):0;
  let score=Math.round(titleScore*48+authorScore*28)+Math.min(14,metadataQuality(candidate));
  if(candidate.isPhysical)score+=4;if(candidate.publisher)score+=2;if(candidate.year)score+=2;if(candidate.cover)score+=1;
  return Math.min(100,score);
}
function rankIdentificationCandidates(candidates,query){
  return candidates.filter(candidate=>candidate&&candidate.title&&!isIdentificationPlaceholderTitle(candidate.title)).map((candidate,index)=>({...candidate,identificationScore:identificationCandidateScore(candidate,query),_searchOrder:index})).sort((a,b)=>(b.identificationScore||0)-(a.identificationScore||0)||(b.bibliographicQuality||0)-(a.bibliographicQuality||0)||providerPriority(a)-providerPriority(b)||(a._searchOrder||0)-(b._searchOrder||0)).map(({_searchOrder,...candidate})=>candidate);
}
function identificationCandidateKey(candidate,index=0){
  const isbn=normalizedCandidateIsbns(candidate)[0];if(isbn)return'isbn:'+isbn;
  const title=normalizedTitle(candidate.title),author=normalizedTitle(candidate.authors),publisher=normalizedTitle(candidate.publisher),year=String(candidate.year||''),edition=normalizedTitle(candidate.edition);
  if(title&&author&&(publisher||year)&&(publisher&&year||edition))return['bibliographic',title,author,publisher,year,edition].join('|');
  return['record',candidate.metadataProvider||candidate.metadataSource||'',candidate.externalRecordId||index].join('|');
}
function dedupeIdentificationCandidates(candidates){
  const seen=new Set(),out=[];candidates.forEach((candidate,index)=>{const key=identificationCandidateKey(candidate,index);if(seen.has(key))return;seen.add(key);out.push(candidate);});return out;
}
function cqlQuoted(value){const clean=identificationQueryText(value).split('"').join(' ').split(String.fromCharCode(92)).join(' ');return '"'+clean+'"';}
function buildDnbIdentificationSearchUrl({title,author}={}){
  const clauses=[];if(title)clauses.push('dnb.tit='+cqlQuoted(title));if(author)clauses.push('dnb.atr='+cqlQuoted(author));
  const url=new URL('https://services.dnb.de/sru/dnb');url.search=new URLSearchParams({version:'1.1',operation:'searchRetrieve',query:clauses.join(' and '),maximumRecords:'10',recordSchema:'MARC21-xml'});return url.toString();
}
async function searchGoogleBooksCandidates({title,author}={},book={},options={}){
  const terms=['intitle:'+identificationQueryText(title)];if(author)terms.push('inauthor:'+identificationQueryText(author));
  try{const response=await fetchMetadataResponse('https://www.googleapis.com/books/v1/volumes?q='+encodeURIComponent(terms.join(' '))+'&maxResults=10',options.fetchImpl||fetch);if(!response.ok)return[];const data=await response.json();return(data.items||[]).map(item=>{const meta=googleVolumeToMeta(item.volumeInfo||{});return meta?enrichCandidateMeta(book,{...meta,externalRecordId:item.id||''},{metadataSource:'Google Books',metadataMatchMethod:'Manual title/author search'}):null;}).filter(Boolean);}catch{return[];}
}
async function searchOpenLibraryCandidates({title,author}={},book={},options={}){
  try{const params=new URLSearchParams({title:identificationQueryText(title),limit:'10'});if(author)params.set('author',identificationQueryText(author));const response=await fetchMetadataResponse('https://openlibrary.org/search.json?'+params.toString(),options.fetchImpl||fetch);if(!response.ok)return[];const data=await response.json();return(data.docs||[]).map(doc=>{const meta=openLibraryDocToMeta(doc);return meta?enrichCandidateMeta(book,{...meta,externalRecordId:doc.key||''},{metadataSource:'Open Library',metadataMatchMethod:'Manual title/author search'}):null;}).filter(Boolean);}catch{return[];}
}
async function searchDnbCandidates({title,author}={},book={},options={}){
  try{const response=await fetchMetadataResponse(buildDnbIdentificationSearchUrl({title,author}),options.fetchImpl||fetch);if(!response.ok)return[];return parseSruMarcResponse(await response.text(),'dnb').map(meta=>enrichCandidateMeta(book,meta,{metadataSource:'Deutsche Nationalbibliothek',metadataMatchMethod:'Manual title/author search'}));}catch{return[];}
}
async function runIdentificationCandidateSearch(query,book,providers){
  const settled=await Promise.allSettled(providers.map(provider=>provider(query,book)));const candidates=[];settled.forEach(result=>{if(result.status==='fulfilled'&&Array.isArray(result.value))candidates.push(...result.value);});return dedupeIdentificationCandidates(rankIdentificationCandidates(candidates,query)).slice(0,16);
}
function searchMetadataCandidates({title,author}={},book={},providers){
  const query={title:identificationQueryText(title),author:identificationQueryText(author)};if(!hasMeaningfulIdentificationTitle(query.title))return Promise.resolve([]);
  if(providers)return runIdentificationCandidateSearch(query,book,providers);
  const key=normalizedTitle(query.title)+'|'+normalizedTitle(query.author);if(!IDENTIFICATION_SEARCH_PROMISE_CACHE.has(key)){
    const request=runIdentificationCandidateSearch(query,book,[searchOpenLibraryCandidates,searchGoogleBooksCandidates,searchDnbCandidates]);IDENTIFICATION_SEARCH_PROMISE_CACHE.set(key,request);request.then(candidates=>{if(!candidates.length&&IDENTIFICATION_SEARCH_PROMISE_CACHE.get(key)===request)IDENTIFICATION_SEARCH_PROMISE_CACHE.delete(key);},()=>IDENTIFICATION_SEARCH_PROMISE_CACHE.delete(key));
  }
  return IDENTIFICATION_SEARCH_PROMISE_CACHE.get(key);
}

async function lookupMetadataCandidates(book){
  const current=normalizeBook(book||{});
  if(current.isbn&&isValidISBN(current.isbn))return dedupeMetadataCandidates(await lookupISBNMetadataCandidates(current.isbn,current)).slice(0,8);
  const candidates=[...await lookupGoogleBooksTextCandidates(current.title,current.authors,current),...await lookupOpenLibrarySearchCandidates(current.title,current.authors,current)];
  return dedupeMetadataCandidates(candidates).slice(0,8);
}
const METADATA_FIELD_DEFS=[
  ['isbn','ISBN'],['title','Title'],['authors','Author(s)'],['originalPublicationYear','Original publication year'],['series','Series'],['seriesNumber','Series number'],['year','Publication year'],['publisher','Publisher'],['translators','Translator(s)'],['editors','Editor(s)'],['pages','Pages'],['language','Language'],['edition','Edition'],['format','Format'],['cover','Cover'],['tags','Tags']
];
function metadataHasValue(v){return Array.isArray(v)?v.length>0:String(v??'').trim()!=='';}
function currentMetadataMissing(book,field){
  if(field==='title')return !book.title||/^Unknown ·|^Untitled book$/i.test(book.title);
  if(field==='tags')return !(book.tags||[]).length;
  return !metadataHasValue(book[field]);
}
function metaValue(meta,field){
  if(field==='tags')return Array.isArray(meta.tags)?meta.tags:[];
  if(field==='translators'||field==='editors')return normalizePersonList(meta[field]);
  if(field==='originalPublicationYear')return normalizeOriginalPublicationYear(meta[field]);
  if(field==='series')return normalizeSeriesText(meta[field]);
  if(field==='seriesNumber')return normalizeSeriesNumber(meta[field]);
  if(field==='isbn'&&meta.isbn&&isValidISBN(meta.isbn))return toISBN13(meta.isbn);
  return meta[field]??'';
}
function defaultMetadataFields(book,meta){return METADATA_FIELD_DEFS.map(([f])=>f).filter(f=>metadataHasValue(metaValue(meta,f))&&currentMetadataMissing(book,f));}
function replaceableMetadataFields(meta){return METADATA_FIELD_DEFS.map(([f])=>f).filter(f=>metadataHasValue(metaValue(meta,f)));}
function metadataFieldDisplay(value){return Array.isArray(value)?value.join('; '):String(value??'');}
function applyMetadataToBook(book,meta,fields,mode='selected'){
  const chosen=mode==='replace'?replaceableMetadataFields(meta):mode==='missing'?defaultMetadataFields(book,meta):fields;
  let next={...book};
  for(const field of chosen){
    const v=metaValue(meta,field);
    if(!metadataHasValue(v))continue;
    if(field==='tags')next.tags=uniq([...(next.tags||[]),...v]);
    else next[field]=v;
  }
  next.metadataSource=meta.metadataSource||next.metadataSource||'Unknown source';
  next.metadataConfidence=meta.metadataConfidence||next.metadataConfidence||'';
  next.metadataMatchMethod=meta.metadataMatchMethod||next.metadataMatchMethod||'';
  next.metadataUpdatedAt=new Date().toISOString();
  next.reviewed=false;
  if(next.needsIdentification&&hasUsefulIdentification(next))next.needsIdentification=false;
  next.updatedAt=new Date().toISOString();
  return normalizeBook(next);
}
function identificationTargetIdentity(book,candidate,books=[]){
  const current=normalizeBook(book),updated=applyMetadataToBook(current,candidate,replaceableMetadataFields(candidate).filter(field=>field!=='tags'),'selected');
  const currentIsbn=normalizeISBN(current.isbn),candidateIsbn=normalizedCandidateIsbns(candidate)[0]||'';
  if(currentIsbn&&isValidISBN(currentIsbn)&&candidateIsbn&&toISBN13(currentIsbn)===candidateIsbn)return{workId:current.workId||v3WorkId(current),editionId:current.editionId||v3EditionId(current)};
  const editionKey=migrationEditionKey({...updated,workId:'',editionId:''});
  const matchingEdition=(books||[]).find(other=>other.id!==current.id&&((candidateIsbn&&isValidISBN(other.isbn)&&toISBN13(other.isbn)===candidateIsbn)||(!candidateIsbn&&migrationEditionKey(other)===editionKey)));
  if(matchingEdition)return{workId:matchingEdition.workId||v3WorkId(matchingEdition),editionId:matchingEdition.editionId||v3EditionId(matchingEdition)};
  const workKey=migrationWorkKey(updated);const matchingWork=(books||[]).find(other=>other.id!==current.id&&!isUnidentifiedTitle(other.title)&&migrationWorkKey(other)===workKey);
  const identitySeed={...updated,id:current.id,copyId:current.copyId||current.id,workId:'',editionId:''};const workId=matchingWork?(matchingWork.workId||v3WorkId(matchingWork)):v3WorkId(identitySeed);
  return{workId,editionId:v3EditionId({...identitySeed,workId,editionId:''})};
}
function identificationConflictReasons(book,candidate,books=[]){
  const current=normalizeBook(book),target=identificationTargetIdentity(current,candidate,books),reasons=[];const currentIsbn=normalizeISBN(current.isbn),candidateIsbn=normalizedCandidateIsbns(candidate)[0]||'';
  if(currentIsbn&&isValidISBN(currentIsbn)&&candidateIsbn&&toISBN13(currentIsbn)!==candidateIsbn)reasons.push('replace ISBN '+toISBN13(currentIsbn)+' with '+candidateIsbn);
  const shared=(books||[]).filter(other=>other.id!==current.id&&other.editionId&&other.editionId===current.editionId).length;if(shared&&target.editionId!==current.editionId)reasons.push('move this copy away from an edition shared with '+shared+' other '+(shared===1?'copy':'copies'));
  return reasons;
}
function applySelectedMetadataCandidate(book,candidate,books=[]){
  const current=normalizeBook(book),target=identificationTargetIdentity(current,candidate,books);let updated=applyMetadataToBook(current,candidate,replaceableMetadataFields(candidate).filter(field=>field!=='tags'),'selected');
  updated={...updated,id:current.id,copyId:current.copyId||current.id,workId:target.workId,editionId:target.editionId,collections:collectionNames(current),location:normalizeLocation(current.location),condition:current.condition,acquisitionDate:current.acquisitionDate,acquisitionSource:current.acquisitionSource,copyNotes:current.copyNotes,lentTo:current.lentTo,lentDate:current.lentDate,dueDate:current.dueDate,returnedDate:current.returnedDate,status:current.status,rating:current.rating,startedAt:current.startedAt,finishedAt:current.finishedAt,readCount:current.readCount,privateReview:current.privateReview,notes:current.notes,reviewed:current.reviewed,demo:current.demo,addedAt:current.addedAt};
  return normalizeBook(updated);
}
function qualityProblems(book,books=[]){

  const problems=[];const isbn=normalizeISBN(book.isbn||'');
  if(!book.title||/^Unknown ·|^Untitled book$/i.test(book.title))problems.push('Unknown title');
  if(!book.authors)problems.push('Missing author');
  if(!isbn)problems.push('Missing ISBN'); else if(!isValidISBN(isbn))problems.push('Invalid ISBN');
  if(!book.cover)problems.push('Missing cover');
  if(!book.year)problems.push('Missing year');
  if(!book.publisher)problems.push('Missing publisher');
  if(!book.pages)problems.push('Missing page count');
  if(hasMissingLocation(book))problems.push('Missing location');
  if(!(book.tags||[]).length)problems.push('No tags');
  if(possibleDuplicateGroups(books).some(group=>group.items.some(item=>item.id===book.id)))problems.push('Possible duplicate');
  return uniq(problems);
}
function metadataScore(book,books=[]){
  const checks=[Boolean(book.title&&!/^Unknown ·|^Untitled book$/i.test(book.title)),Boolean(book.authors),Boolean(book.isbn&&isValidISBN(book.isbn)),Boolean(book.cover),Boolean(book.year),Boolean(book.publisher),Boolean(book.pages),!hasMissingLocation(book),Boolean((book.tags||[]).length),Boolean(book.status)];
  let score=Math.round((checks.filter(Boolean).length/checks.length)*100);
  if(qualityProblems(book,books).includes('Possible duplicate'))score=Math.max(0,score-12);
  return score;
}
function qualityLabel(score){return score>=85?'Excellent':score>=70?'Good':score>=50?'Fair':'Poor';}
function workTitleKey(title){return normalizedTitle(String(title||'').replace(/\s*[:;–—-].*$/,''));}
function authorKey(authors){return normalizedTitle(String(authors||'').split(',')[0]||'').split(' ').slice(0,2).join(' ');}
function workKeyForBook(book){const t=workTitleKey(book.title);if(!t)return '';return t+'|'+authorKey(book.authors);}
function workGroups(books){const map={};books.forEach(b=>{const k=workKeyForBook(b);if(k&&b.title&&!/^Untitled book$/i.test(b.title)){(map[k]||(map[k]=[])).push(b);}});return Object.entries(map).filter(([,items])=>items.length>1).map(([key,items])=>{const isbns=uniq(items.map(b=>b.isbn).filter(Boolean));const editions=uniq(items.map(b=>[b.year,b.publisher,b.format,b.language,b.edition].filter(Boolean).join(' · ')).filter(Boolean));return {key,items,label:items[0].title,isbnCount:isbns.length,editionCount:editions.length};}).sort((a,b)=>b.items.length-a.items.length||a.label.localeCompare(b.label));}
function mergeValueOptions(items,field,formatter=x=>x){return uniq(items.map(b=>formatter(b[field],b)).filter(v=>String(v||'').trim()!==''));}



function useDebouncedValue(value,delay=200){const [debounced,setDebounced]=useState(value);useEffect(()=>{const t=setTimeout(()=>setDebounced(value),delay);return()=>clearTimeout(t);},[value,delay]);return debounced}

function StarRating({value=0,onChange}){return <div style={{display:'flex',gap:2}} role="radiogroup" aria-label="Rating">{[1,2,3,4,5].map(n=><button key={n} type="button" role="radio" aria-checked={value===n} aria-label={n+' star'+(n===1?'':'s')} onClick={()=>onChange?.(value===n?0:n)} style={{all:'unset',cursor:'pointer',color:n<=value?'#f59e0b':'#bdd7ea',lineHeight:0}}><Icon name="star" size={17}/></button>)}</div>}
function Toasts({toasts}){return <div className="toast-wrap" aria-live="polite" aria-relevant="additions">{toasts.map(t=><div key={t.id} className="toast"><Icon name={t.type==='error'?'alert':'check'} size={15}/><span>{t.msg}</span>{t.action&&<button className="ghost" onClick={t.action.onClick}>{t.action.label}</button>}</div>)}</div>}

const FOCUSABLE='a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
function useModalFocus(active,onClose,ref){
  const last=useRef(null);
  useEffect(()=>{
    if(!active)return;
    last.current=document.activeElement;
    const root=ref?.current;
    setTimeout(()=>{const first=root?.querySelector(FOCUSABLE);(first||root)?.focus?.();},20);
    const handler=e=>{
      if(e.key==='Escape'){e.preventDefault();onClose?.();return;}
      if(e.key!=='Tab'||!root)return;
      const nodes=[...root.querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null||el===document.activeElement);
      if(!nodes.length)return;
      const first=nodes[0],lastNode=nodes[nodes.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastNode.focus();}
      else if(!e.shiftKey&&document.activeElement===lastNode){e.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',handler);
    return()=>{document.removeEventListener('keydown',handler);setTimeout(()=>last.current?.focus?.(),0);};
  },[active,onClose,ref]);
}


function Sidebar({books,collections,activeView,setActiveView,activeCollection,setActiveCollection,isDragging,onDropBook,search,setSearch,onOpenChangelog,onOpenAddBooks}){
  const nav=[['dashboard','Home','book'],['library','Library','search'],['intake','Organize','scan'],['bookcase','Shelves','tag']];
  const isActive=id=>id==='bookcase'?activeView==='bookcase':activeView===id;
  return <aside className="sidebar" aria-label="The Stacks navigation">
    <div className="brand"><div className="overline">Personal Catalog</div><div className="logo">The Stacks</div><div className="small mono">{String(books.length).padStart(4,'0')} books</div><button className="sidebar-settings" onClick={()=>setActiveView('settings')} aria-label="Open settings" title="Settings"><Icon name="gear" size={16}/></button></div>
    <nav className="simple-nav" aria-label="Main navigation">{nav.map(([id,label,icon])=><button key={id} className={isActive(id)?'active':''} onClick={()=>setActiveView(id)} aria-current={isActive(id)?'page':undefined}><Icon name={icon} size={15}/><span>{label}</span></button>)}</nav>
    <div className="sidebar-primary-action"><button className="btn" onClick={onOpenAddBooks}><Icon name="plus" size={15}/> Add books</button></div>
    <div className="sidebar-search"><div className="searchbox"><Icon name="search" size={14}/><input value={search} onChange={e=>{setSearch(e.target.value);if(activeView!=='library')setActiveView('library')}} placeholder="Title, author, series, subject, ISBN..." aria-label="Search catalog"/>{search&&<button className="xbtn" onClick={()=>setSearch('')} aria-label="Clear search"><Icon name="x" size={12}/></button>}</div></div>
    <div className="sidebar-footer"><button className="quiet-link" onClick={onOpenChangelog}>Version {APP_VERSION}</button></div>
  </aside>;
}



function isBarcodeDetectorAvailable(){return typeof window!=='undefined'&&'BarcodeDetector' in window;}
function isCameraAccessAvailable(){return typeof navigator!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;}
function selectCameraDecoder(nativeAvailable,nativeInitialized){return nativeAvailable&&nativeInitialized?'native':'zxing';}
function createNativeBarcodeDetector(){
  if(!isBarcodeDetectorAvailable())return null;
  try{return new window.BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});}
  catch{try{return new window.BarcodeDetector();}catch{return null;}}
}
function formatLocationSummary(location){const l=normalizeLocation(location);return [l.room,l.bookcase,l.shelf&&`Shelf ${l.shelf}`,l.box&&`Box ${l.box}`].filter(Boolean).join(' / ')||'No default location';}
function hardwareScannerCode(buffer,startedAt,now=Date.now()){const code=normalizeScannedCode(buffer);return startedAt&&now-startedAt<=1200&&isValidISBN(code)?code:'';}
function cameraBarcodeFrame(entries,value,now=Date.now()){
  const code=normalizeScannedCode(value);
  entries.forEach((entry,key)=>{if(key!==code&&now-entry.lastSeen>1200)entry.released=true;});
  if(!code)return{code:'',accepted:false};
  const entry=entries.get(code)||{lastSeen:0,acceptedAt:0,released:true};
  const accepted=entry.released&&(!entry.acceptedAt||now-entry.acceptedAt>1200);
  entry.lastSeen=now;
  if(accepted){entry.released=false;entry.acceptedAt=now;}
  entries.set(code,entry);
  return{code,accepted};
}
function scanStateLabel(state){return {added:'New book',copy:'Physical copy',review:'Needs review',invalid:'Invalid ISBN',error:'Scan failed',sent:'Processed'}[state]||'Processed';}
function scanSourceLabel(source){return {manual:'Single scan',batch:'Batch',camera:'Camera'}[source]||String(source||'Scan');}
function CameraBarcodeScanner({active,onDetected,onStop,minimal=false,onInvalidDetected,onUnavailable,mode='add'}){
  const videoRef=useRef(null);const streamRef=useRef(null);const rafRef=useRef(null);const decoderControlsRef=useRef(null);const decoderReaderRef=useRef(null);const barcodeRef=useRef(new Map());
  const [state,setState]=useState({status:'idle',message:'Camera stopped'});
  useEffect(()=>{
    let cancelled=false;
    const stopDecoder=()=>{if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}if(decoderControlsRef.current){decoderControlsRef.current.stop();decoderControlsRef.current=null;}decoderReaderRef.current=null;};
    const stopStream=()=>{if(streamRef.current){streamRef.current.getTracks().forEach(track=>track.stop());streamRef.current=null;}if(videoRef.current)videoRef.current.srcObject=null;};
    const handleFrame=value=>{
      if(cancelled)return;
      const frame=cameraBarcodeFrame(barcodeRef.current,value);
      if(!frame.accepted)return;
      const valid=isValidISBN(frame.code);
      setState({status:valid?'found':'scanning',message:valid?`Scanned ${toISBN13(frame.code)}. ${mode==='find'||mode==='move'?'Checking…':'Adding…'}`:'That does not look like a book barcode.'});
      if(!valid)onInvalidDetected?.(frame.code);
      Promise.resolve(onDetected?.(frame.code)).catch(()=>{const message=mode==='find'||mode==='move'?'The book could not be checked. Enter the ISBN below.':'The book could not be added. Use the Scan Desk instead.';setState({status:'error',message});onUnavailable?.(message);}).finally(()=>{if(!cancelled)setState({status:'scanning',message:'Point the camera at the ISBN barcode.'});});
    };
    async function start(){
      if(!active)return;
      barcodeRef.current.clear();
      if(!isCameraAccessAvailable()){const message='Camera access is not available on this device. Use a barcode scanner instead.';setState({status:'error',message});onUnavailable?.(message);return;}
      try{
        setState({status:'starting',message:'Requesting camera permission…'});
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play().catch(()=>{});}
        const detector=createNativeBarcodeDetector();
        const decoderKind=selectCameraDecoder(isBarcodeDetectorAvailable(),!!detector);
        setState({status:'scanning',message:'Point the camera at the ISBN barcode.'});
        if(decoderKind==='native'){
          const loop=async()=>{
            if(cancelled||!active)return;
            const video=videoRef.current;
            if(video&&video.readyState>=2){try{const codes=await detector.detect(video);handleFrame(codes?.[0]?.rawValue||'');}catch{/* Keep scanning after a single native detector frame fails. */}}
            if(!cancelled)rafRef.current=requestAnimationFrame(loop);
          };
          rafRef.current=requestAnimationFrame(loop);
        }else{
          try{
            const reader=new BrowserMultiFormatOneDReader(undefined,{delayBetweenScanAttempts:100,delayBetweenScanSuccess:100});
            decoderReaderRef.current=reader;
            const controls=await reader.decodeFromVideoElement(videoRef.current,(result)=>handleFrame(result?.getText?.()||''));
            if(cancelled)controls.stop();else decoderControlsRef.current=controls;
          }catch{const decoderError=new Error('Camera barcode decoder initialization failed');decoderError.cameraDecoderFailure=true;throw decoderError;}
        }
      }catch(err){
        stopDecoder();stopStream();
        const message=err?.name==='NotAllowedError'?'Camera permission was denied. Allow camera access and try again.':err?.name==='NotFoundError'||err?.name==='NotReadableError'?'The camera is unavailable or already in use.':err?.cameraDecoderFailure?'The camera barcode reader could not start. Try again or use a barcode scanner.':'The camera could not start. Try again or use a barcode scanner.';
        setState({status:'error',message});onUnavailable?.(message);
      }
    }
    start();
    return()=>{cancelled=true;stopDecoder();stopStream();barcodeRef.current.clear();};
  },[active]);
  const label=state.status==='scanning'?'Scanning':state.status==='found'?(mode==='find'||mode==='move'?'Checking book':'Adding book'):state.status==='error'?'Camera needs help':'Starting camera';
  return <div className={'camera-box '+(minimal?'camera-minimal':'')}><div className="camera-preview-wrap"><video ref={videoRef} playsInline muted className="camera-preview"/><div className="scan-frame" aria-hidden="true">{minimal&&<><div className="easy-target-book"><Icon name="book" size={42}/></div><div className="easy-target-bars"/></>}</div>{!minimal&&<div className="camera-badge">{label}</div>}</div>{!minimal&&<div className="camera-status"><span className={state.status==='error'?'badge bad':'badge'}>{state.message}</span><button className="ghost" onClick={onStop}>Stop camera</button></div>}</div>;
}


function MoveBooksView({books,initialDestination,onLookup,onMoveCopies,onUndoMove,onBack}){
  const [destination,setDestination]=useState(()=>normalizeLocation(initialDestination));const [sessionActive,setSessionActive]=useState(false);
  const [cameraOn,setCameraOn]=useState(false);const [cameraIssue,setCameraIssue]=useState('');
  const [value,setValue]=useState('');const [result,setResult]=useState(null);const [recent,setRecent]=useState([]);
  const [stats,setStats]=useState({checked:0,moved:0,already:0,notOwned:0,needsSelection:0,undone:0});
  const [undoStack,setUndoStack]=useState([]);const inputRef=useRef(null),sequenceRef=useRef(0),selectionPendingRef=useRef(false);
  useEffect(()=>{if(sessionActive&&result?.state!=='choose-copy')inputRef.current?.focus();},[sessionActive,result?.state]);
  const destinationText=locationText({location:destination})||'No destination selected';
  const resultTitle=match=>match?.edition?.title||match?.work?.title||match?.edition?.isbn||'Needs identification';
  function finishMove(match,isbn,entryId){
    const copy=match.copy,title=resultTitle(match),author=match.edition?.authors||match.work?.authors||match.work?.author||'';
    const from=normalizeLocation(copy.location);
    const moved=onMoveCopies([copy.id],destination,{silent:true});
    if(moved?.error){const entry={id:entryId,state:'error',title,isbn,from,to:destination,message:moved.error};setResult(entry);setRecent(items=>[entry,...items.filter(item=>item.id!==entryId)].slice(0,8));return;}
    const state=moved.changed?'moved':'already';
    const entry={id:entryId,state,title,author,isbn,from,to:{...destination},copyId:copy.id};
    setResult(entry);setRecent(items=>[entry,...items.filter(item=>item.id!==entryId)].slice(0,8));
    setStats(previous=>({...previous,[state]:previous[state]+1}));
    if(moved.changed)setUndoStack(items=>[{copyId:copy.id,previous:moved.previous,destination:{...destination},title},...items].slice(0,10));
    inputRef.current?.focus();
  }
  function checkISBN(raw){
    if(!sessionActive||selectionPendingRef.current)return;
    const lookup=onLookup(raw),id=++sequenceRef.current;
    if(lookup.state==='invalid'){setResult({id,state:'invalid',title:'Invalid ISBN'});return;}
    setStats(previous=>({...previous,checked:previous.checked+1}));
    if(lookup.state==='not-owned'){
      const entry={id,state:'not-owned',title:lookup.isbn,isbn:lookup.isbn};setResult(entry);setRecent(items=>[entry,...items].slice(0,8));
      setStats(previous=>({...previous,notOwned:previous.notOwned+1}));inputRef.current?.focus();return;
    }
    if(lookup.copies.length>1){
      selectionPendingRef.current=true;
      const entry={id,state:'choose-copy',title:resultTitle(lookup.copies[0]),isbn:lookup.isbn,matches:lookup.copies};
      setResult(entry);setRecent(items=>[entry,...items].slice(0,8));
      setStats(previous=>({...previous,needsSelection:previous.needsSelection+1}));return;
    }
    finishMove(lookup.copies[0],lookup.isbn,id);
  }
  function submit(event){event.preventDefault();const raw=value.trim();if(!raw)return;setValue('');checkISBN(raw);}
  function chooseCopy(copyId){
    if(result?.state!=='choose-copy')return;
    const lookup=onLookup(result.isbn),match=lookup.copies?.find(item=>item.copy.id===copyId);
    selectionPendingRef.current=false;
    if(!match){const entry={id:result.id,state:'error',title:result.title,isbn:result.isbn,message:'That physical Copy is no longer available. Scan again.'};setResult(entry);setRecent(items=>items.map(item=>item.id===entry.id?entry:item));return;}
    finishMove(match,result.isbn,result.id);
  }
  function undoLast(){
    const last=undoStack[0];if(!last)return;
    if(!onUndoMove(last.previous,last.destination,{silent:true})){setResult({state:'error',title:last.title,message:'Undo could not safely restore this Copy because its location changed again.'});return;}
    setUndoStack(items=>items.slice(1));setStats(previous=>({...previous,undone:previous.undone+1}));
    const entry={id:++sequenceRef.current,state:'undone',title:last.title,copyId:last.copyId};setResult(entry);setRecent(items=>[entry,...items].slice(0,8));inputRef.current?.focus();
  }
  const start=()=>{if(!hasMoveDestination(destination))return;setSessionActive(true);setResult(null);selectionPendingRef.current=false;};
  const changeDestination=()=>{setCameraOn(false);setSessionActive(false);setResult(null);selectionPendingRef.current=false;};
  const labels={moved:'✓ MOVED',already:'ALREADY HERE','not-owned':'NOT IN YOUR LIBRARY','choose-copy':'CHOOSE COPY',invalid:'INVALID ISBN',error:'MOVE FAILED',undone:'MOVE UNDONE'};
  return <div className="workspace move-books-view">
    <div className="move-books-head"><div><div className="overline">Physical library</div><h1 className="title">Scan to Location</h1><p className="subtitle">Choose where books belong, then scan owned physical Copies one after another. This never adds a Copy.</p></div><button className="ghost" onClick={onBack}>Back to Library</button></div>
    {!sessionActive?<section className="panel panel-pad move-setup"><div className="overline">1 · Choose destination</div><h2>Move books to</h2><MoveDestinationPicker books={books} value={destination} onChange={setDestination} idPrefix="scan-move"/><button className="btn move-start" onClick={start} disabled={!hasMoveDestination(destination)}>Start moving books</button><p className="small">Bookcase and Shelf are required. Room and Box are optional.</p></section>:<>
      <section className="move-destination-banner" aria-label="Current scan destination"><div><div className="overline">Move books to</div><strong>{destinationText}</strong></div><button className="ghost" onClick={changeDestination}>Change destination</button></section>
      <div className="move-scan-tools"><form onSubmit={submit}><label className="label" htmlFor="move-isbn">ISBN · manual or USB/Bluetooth scanner</label><div className="find-isbn-row"><input ref={inputRef} id="move-isbn" className="field mono" inputMode="numeric" autoComplete="off" value={value} onChange={event=>setValue(event.target.value)} disabled={result?.state==='choose-copy'} placeholder="Scan or enter the next ISBN…"/><button className="btn" type="submit" disabled={result?.state==='choose-copy'}>Check book</button></div></form><button className="ghost" onClick={()=>{setCameraIssue('');setCameraOn(on=>!on)}}>{cameraOn?'Stop camera':'Start camera scan'}</button></div>
      {cameraOn&&<CameraBarcodeScanner active={cameraOn} mode="move" onDetected={checkISBN} onStop={()=>setCameraOn(false)} onUnavailable={setCameraIssue}/>}
      {cameraIssue&&<p className="small" role="alert">{cameraIssue} Manual or hardware ISBN entry remains available.</p>}
      <div className="move-session-stats" aria-label="Move session summary"><span><b>{stats.checked}</b> checked</span><span><b>{stats.moved}</b> moved</span><span><b>{stats.already}</b> already here</span><span><b>{stats.notOwned}</b> not in library</span><span><b>{stats.needsSelection}</b> needed copy selection</span>{stats.undone>0&&<span><b>{stats.undone}</b> undone</span>}</div>
      {result&&<section className={'move-result '+result.state} aria-live="polite"><div className="move-result-state">{labels[result.state]}</div><h2>{result.title}</h2>{result.author&&<p>{result.author}</p>}{result.isbn&&<small>ISBN {result.isbn}</small>}
        {result.state==='choose-copy'?<><p>Which physical Copy is in your hand? Its current location is the key distinction.</p><div className="move-choice-list">{result.matches.map((match,index)=><button key={match.copy.id} onClick={()=>chooseCopy(match.copy.id)}><span className="overline">Copy {index+1} of {result.matches.length}{sameLocation(match.copy.location,destination)?' · Already at destination':''}</span><PhysicalLocation location={match.copy.location}/><small>{resultTitle(match)} · {match.copy.id}</small></button>)}</div><button className="ghost" onClick={()=>{selectionPendingRef.current=false;setResult(null);inputRef.current?.focus();}}>Skip this scan</button></>:
        result.state==='moved'?<div className="move-from-to"><div><span className="label">From</span><PhysicalLocation location={result.from}/></div><div><span className="label">To</span><PhysicalLocation location={result.to}/></div></div>:
        result.state==='already'?<PhysicalLocation location={result.to}/>:
        result.state==='not-owned'?<p>No Copy was moved or added.</p>:
        result.state==='invalid'?<p>Check the number and scan again. Nothing was changed.</p>:
        result.state==='undone'?<p>The previous exact Copy location was restored.</p>:<p>{result.message}</p>}
      </section>}
      <section className="move-session-activity"><div className="move-session-activity-head"><h2>Recent activity</h2><button className="ghost" onClick={undoLast} disabled={!undoStack.length}>Undo last move</button></div>{recent.length?<ul>{recent.map(item=><li key={item.id}><b>{item.title}</b><span>{labels[item.state]}{item.state==='moved'?' · '+(locationText({location:item.from})||'No assigned location')+' → '+locationText({location:item.to}):''}</span></li>)}</ul>:<p className="small">Ready for the first book. The scanner stays available after each result.</p>}</section>
    </>}
  </div>;
}
function FindPutAway({catalog,onLookup,onResolveMetadata,onAddToLibrary,onEditCopy}){
  const [value,setValue]=useState('');
  const [cameraOn,setCameraOn]=useState(false);
  const [result,setResult]=useState(null);
  const [recent,setRecent]=useState([]);
  const [stats,setStats]=useState({checked:0,found:0,notOwned:0,needsLocation:0});
  const [adding,setAdding]=useState(false);
  const [addError,setAddError]=useState('');
  const inputRef=useRef(null);
  const scanNumber=useRef(0);
  useEffect(()=>{inputRef.current?.focus();},[]);
  const current=useMemo(()=>result?.state==='owned'?{...lookupOwnedISBN(catalog,result.isbn),requestId:result.requestId}:result,[catalog,result]);
  function checkISBN(raw,source='manual'){
    const lookup=onLookup(raw);
    setAddError('');
    const requestId=++scanNumber.current;
    const next={...lookup,requestId,metadataPending:lookup.state==='not-owned'};
    setResult(next);
    if(lookup.state==='invalid')return;
    const first=lookup.copies[0];
    const missing=lookup.state==='owned'&&lookup.copies.some(item=>hasUnassignedCoreLocation(item.copy.location));
    const entry={id:requestId,isbn:lookup.isbn,title:first?.edition?.title||first?.work?.title||lookup.isbn,location:first?.copy?.location||null,state:lookup.state,missing,source};
    setRecent(items=>[entry,...items].slice(0,5));
    setStats(previous=>({checked:previous.checked+1,found:previous.found+(lookup.state==='owned'?1:0),notOwned:previous.notOwned+(lookup.state==='not-owned'?1:0),needsLocation:previous.needsLocation+(missing?1:0)}));
    if(lookup.state==='not-owned')Promise.resolve(onResolveMetadata(lookup.isbn)).then(metadata=>{setResult(previous=>previous?.requestId===requestId?{...previous,metadata,metadataPending:false}:previous);if(metadata)setRecent(items=>items.map(item=>item.id===requestId?{...item,title:metadata.title||item.title}:item));}).catch(()=>setResult(previous=>previous?.requestId===requestId?{...previous,metadataPending:false}:previous));
  }
  function submit(event){event?.preventDefault();const raw=value.trim();if(!raw)return;setValue('');checkISBN(raw,'manual');inputRef.current?.focus();}
  async function addToLibrary(){if(!current?.isbn||adding)return;setAdding(true);setAddError('');try{const owned=await onAddToLibrary(current.isbn);if(owned?.state==='owned')setResult({...owned,requestId:++scanNumber.current});else setAddError('The book could not be added. Please try again.');}catch{setAddError('The book could not be added. Please try again.');}finally{setAdding(false);}}
  const first=current?.copies?.[0];
  const edition=first?.edition||current?.editions?.[0];
  const work=first?.work;
  const metadata=current?.metadata;
  const title=edition?.title||work?.title||metadata?.title||'Book details unavailable';
  const authors=edition?.authors||work?.authors||work?.author||metadata?.authors||'';
  const cover=edition?.cover||metadata?.cover||'';
  return <div className="workspace find-put-away"><div className="overline">Physical library</div><h1 className="title">Find / Put Away</h1><p className="subtitle">Scan a book to check whether you own it and find its physical location. This check never adds a copy.</p><div className="find-scan-tools"><form onSubmit={submit}><label className="label" htmlFor="find-isbn">ISBN · type, paste, or use a hardware scanner</label><div className="find-isbn-row"><input id="find-isbn" ref={inputRef} className="field mono" inputMode="numeric" autoComplete="off" value={value} onChange={event=>setValue(event.target.value)} placeholder="Scan or enter an ISBN…"/><button className="btn" type="submit">Find book</button></div></form><button className="ghost" onClick={()=>setCameraOn(on=>!on)}>{cameraOn?'Stop camera':'Start camera scan'}</button></div>{cameraOn&&<CameraBarcodeScanner active={cameraOn} mode="find" onDetected={code=>checkISBN(code,'camera')} onStop={()=>setCameraOn(false)}/>}<div className="find-stats" aria-label="Books checked this session"><span><b>{stats.checked}</b> books checked</span><span><b>{stats.found}</b> found</span><span><b>{stats.notOwned}</b> not in library</span><span><b>{stats.needsLocation}</b> need a location</span></div>{current&&<section className={'find-result '+current.state} aria-live="polite">{current.state==='invalid'?<><h2>Invalid ISBN</h2><p>Check the number and scan again. Your catalog was not changed.</p></>:<><div className="find-result-state">{current.state==='owned'?'✓ IN YOUR LIBRARY':'NOT IN YOUR LIBRARY'}</div><div className="find-book-identity"><div className="find-cover">{cover?<img src={cover} alt=""/>:<Icon name="book" size={28}/>}</div><div><h2>{title}</h2><p>{authors||'Author not available'}</p><small>ISBN {current.isbn}{edition?.publisher?' · '+edition.publisher:''}{edition?.year?' · '+edition.year:''}</small></div></div>{current.state==='owned'?<><p className="find-copy-count">{current.copies.length} physical {current.copies.length===1?'copy':'copies'} owned</p><div className="find-copy-list">{current.copies.map(({copy,edition:copyEdition},index)=><div className="find-copy" key={copy.id}><div><b>Copy {index+1}{current.editions.length>1?' · '+(copyEdition.edition||copyEdition.format||copyEdition.isbn):''}</b><PhysicalLocation location={copy.location}/></div>{hasUnassignedCoreLocation(copy.location)&&<button className="btn" onClick={()=>onEditCopy(copy.id)}>Set location</button>}</div>)}</div></>:<div className="find-add-action"><p>{current.metadataPending?'Looking up book details…':metadata?'Book details found. Add only if you want to catalog this copy.':'No book details found. You can still add it for later identification.'}</p><button className="btn" onClick={addToLibrary} disabled={adding}>{adding?'Adding…':'Add to library'}</button>{addError&&<span className="small" role="alert">{addError}</span>}</div>}</>}</section>}<section className="find-recent"><h2>Recent checks</h2>{recent.length?<ol>{recent.map(item=><li key={item.id}><b>{item.title}</b><span>{item.state==='owned'?(item.missing?'Location missing':'Owned'):'Not owned'} · {item.state==='owned'&&!item.missing?(physicalLocationParts(item.location).primary||physicalLocationParts(item.location).secondary):item.isbn}</span></li>)}</ol>:<p className="small">Scan or enter an ISBN to begin. You can keep scanning after each result.</p>}</section></div>;
}

function AddBooksChooser({onClose,onEasy,onBatch,onManual,onFind}){
  return <div className="modal-back" onClick={onClose} role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label="Add books" style={{maxWidth:540,marginTop:'8vh'}} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="overline">Add books</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Choose how to add</h2></div><button className="ghost" onClick={onClose}><Icon name="x" size={14}/></button></div><div className="modal-body"><div className="add-books-choice"><button className="primary" onClick={onEasy}><b>Easy Scan</b><small>Point the camera at books and keep going.</small></button><button onClick={onBatch}><b>Batch Scan</b><small>Use a barcode scanner or paste many ISBNs.</small></button><button onClick={onFind}><b>Find / Put Away</b><small>Check ownership and location without adding a copy.</small></button><button onClick={onManual}><b>Add manually</b><small>Enter book details yourself.</small></button></div></div></div></div>;
}

function playEasySuccessTone(){
  try{
    if(typeof window==='undefined')return;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    const context=playEasySuccessTone.context||(playEasySuccessTone.context=new AudioContextClass());
    const play=()=>{const now=context.currentTime;const gain=context.createGain();const oscillator=context.createOscillator();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.055,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.2);oscillator.type='sine';oscillator.frequency.setValueAtTime(660,now);oscillator.frequency.exponentialRampToValueAtTime(880,now+.16);oscillator.connect(gain).connect(context.destination);oscillator.start(now);oscillator.stop(now+.22);};
    if(context.state==='suspended')context.resume().then(play).catch(()=>{});else play();
  }catch{/* Sound is optional. */}
}

function ParentHoldButton({onOpen}){
  const timerRef=useRef(null);const [holding,setHolding]=useState(false);
  const stop=()=>{if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;}setHolding(false);};
  useEffect(()=>stop,[]);
  const start=()=>{if(timerRef.current)return;setHolding(true);timerRef.current=setTimeout(()=>{timerRef.current=null;setHolding(false);onOpen();},2000);};
  return <button className="easy-parent-lock" style={{'--hold-progress':holding?'100%':'0%'}} onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start();}}} onKeyUp={stop} aria-label="Hold for two seconds to open parent controls" title="Parent controls"><Icon name="lock" size={17}/><span className="sr-only">Hold for two seconds to open parent controls</span></button>;
}

function EasyParentPanel({session,history,addedCount,cameraIssue,parentNotice,onUndo,onFinish,onChangeDestination,onChangeMethod,onUseScanDesk,onClose}){
  const modalRef=useRef(null);const [choosingMethod,setChoosingMethod]=useState(false);useModalFocus(true,onClose,modalRef);
  const last=history[0];const location=formatLocationSummary(session.location);const scanMethod=session.method||'camera';
  return <div className="easy-parent-back" role="presentation"><div ref={modalRef} className="easy-parent-panel" role="dialog" aria-modal="true" aria-label="Parent controls" tabIndex="-1"><div className="modal-head"><div><div className="overline">Easy Scan</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Parent controls</h2></div><button className="ghost" onClick={onClose} aria-label="Close parent controls"><Icon name="x" size={15}/></button></div><div className="easy-parent-body">{scanMethod==='camera'&&cameraIssue&&<div className="easy-parent-camera-help"><b>Camera unavailable</b><p>{cameraIssue} A barcode scanner can still be used here.</p><button className="btn" onClick={onUseScanDesk}>Use Scan Desk</button></div>}{parentNotice&&<div className="easy-parent-notice" role="status">{parentNotice}</div>}<div className="easy-parent-summary"><span><Icon name="book" size={18}/> {addedCount} added</span><span>{session.collection||'Unshelved'}<small>{location}</small></span></div><div><div className="label">Last scans</div><div className="easy-parent-history">{history.length?history.map(item=><div key={item.id}><span>{item.book.title||'Book added'}</span><small>{scanStateLabel(item.state)}</small></div>):<div className="small">No books added in this session yet.</div>}</div></div>{choosingMethod?<div><div className="label">How would you like to scan?</div><div className="easy-method-choice compact"><button className={scanMethod==='camera'?'selected':''} onClick={()=>{onChangeMethod('camera');setChoosingMethod(false);}}><b>Camera</b><small>Use the device camera.</small></button><button className={scanMethod==='scanner'?'selected':''} onClick={()=>{onChangeMethod('scanner');setChoosingMethod(false);}}><b>Barcode scanner</b><small>Use a USB or Bluetooth scanner.</small></button></div></div>:null}<div className="easy-parent-actions"><button className="ghost" onClick={onChangeDestination}>Change destination</button><button className="ghost" onClick={()=>setChoosingMethod(true)}>Change scanning method</button><button className="btn" disabled={!last} onClick={onUndo}>Undo last</button><button className="btn danger" onClick={onFinish}>Finish scanning</button></div></div></div></div>;
}

function EasyScan({collections,settings,onScan,onUndoLast,onDone,onUseScanDesk}){
  const [setup,setSetup]=useState(()=>({collection:settings.defaultCollection||'',location:normalizeLocation(settings.defaultLocation),status:settings.defaultStatus||'unread',method:'camera'}));
  const [session,setSession]=useState(null);const [history,setHistory]=useState([]);const [addedCount,setAddedCount]=useState(0);const [success,setSuccess]=useState(null);const [parentOpen,setParentOpen]=useState(false);const [parentNotice,setParentNotice]=useState('');const [cameraIssue,setCameraIssue]=useState('');const successRef=useRef(null);const historyRef=useRef([]);const addedIdsRef=useRef([]);const countRef=useRef(0);const scannerBufferRef=useRef('');const scannerStartedAtRef=useRef(0);const scannerTimerRef=useRef(null);const scannerLastAcceptedRef=useRef({code:'',at:0});
  useEffect(()=>()=>{if(successRef.current)clearTimeout(successRef.current);if(scannerTimerRef.current)clearTimeout(scannerTimerRef.current);},[]);
  const updateLocation=(key,value)=>setSetup(current=>({...current,location:{...current.location,[key]:value}}));
  const clearSessionFeedback=()=>{historyRef.current=[];addedIdsRef.current=[];countRef.current=0;setHistory([]);setAddedCount(0);setSuccess(null);setParentNotice('');setCameraIssue('');};
  const locationReady=hasMoveDestination(setup.location);
  const begin=()=>{if(!locationReady){setParentNotice('Choose a Bookcase and Shelf before scanning.');return;}setSession({collection:setup.collection,location:normalizeLocation(setup.location),status:setup.status,method:setup.method});clearSessionFeedback();setParentOpen(false);};
  const finish=()=>onDone?.(addedIdsRef.current.slice());
  const detected=async code=>{if(!session||parentOpen||!hasMoveDestination(session.location)){setParentNotice('Choose a Bookcase and Shelf before scanning.');return;}let result;try{result=await onScan(code,session);}catch{return;}if(!['added','copy','review'].includes(result?.state))return;const entry={id:genId(),book:result.book,state:result.state};const nextHistory=[entry,...historyRef.current].slice(0,3);const nextCount=countRef.current+1;historyRef.current=nextHistory;addedIdsRef.current=uniq([result.book.id,...addedIdsRef.current]);countRef.current=nextCount;setHistory(nextHistory);setAddedCount(nextCount);setSuccess({...entry,count:nextCount});playEasySuccessTone();if(successRef.current)clearTimeout(successRef.current);successRef.current=setTimeout(()=>setSuccess(null),1800);};
  useEffect(()=>{if(!session||session.method!=='scanner'||parentOpen)return;const clearBuffer=()=>{scannerBufferRef.current='';scannerStartedAtRef.current=0;if(scannerTimerRef.current){clearTimeout(scannerTimerRef.current);scannerTimerRef.current=null;}};const onKeyDown=event=>{if(isTypingTarget(event.target)||event.metaKey||event.ctrlKey||event.altKey)return;if(event.key==='Enter'){const now=Date.now();const code=hardwareScannerCode(scannerBufferRef.current,scannerStartedAtRef.current,now);clearBuffer();if(!code)return;const last=scannerLastAcceptedRef.current;if(last.code===code&&now-last.at<500)return;scannerLastAcceptedRef.current={code,at:now};detected(code);return;}if(/^[0-9Xx]$/.test(event.key)){const now=Date.now();if(!scannerStartedAtRef.current||now-scannerStartedAtRef.current>1200){scannerBufferRef.current='';scannerStartedAtRef.current=now;}scannerBufferRef.current+=event.key;if(scannerTimerRef.current)clearTimeout(scannerTimerRef.current);scannerTimerRef.current=setTimeout(clearBuffer,1250);return;}if(event.key==='Escape')clearBuffer();};window.addEventListener('keydown',onKeyDown);return()=>{window.removeEventListener('keydown',onKeyDown);clearBuffer();};},[session,parentOpen]);
  const undo=()=>{const last=historyRef.current[0];if(!last)return;const removed=onUndoLast(last.book.id);if(!removed){setParentNotice('That book was already removed.');return;}if(successRef.current)clearTimeout(successRef.current);const nextHistory=historyRef.current.slice(1);historyRef.current=nextHistory;addedIdsRef.current=addedIdsRef.current.filter(id=>id!==last.book.id);countRef.current=Math.max(0,countRef.current-1);setHistory(nextHistory);setAddedCount(countRef.current);setSuccess(null);setParentNotice('Last book removed.');};
  const changeDestination=()=>{if(successRef.current)clearTimeout(successRef.current);setParentOpen(false);setSession(null);clearSessionFeedback();};
  const changeMethod=method=>{setCameraIssue('');setSession(current=>current?{...current,method}:current);};
  if(!session){const location=formatLocationSummary(setup.location);return <div className="easy-scan"><div className="easy-setup"><div className="easy-setup-card"><h1>Add books</h1><p>Choose where this group of books belongs, then start scanning.</p><div className="easy-setup-fields"><label><div className="label">Bookcase *</div><input className="field" value={setup.location.bookcase} onChange={e=>updateLocation('bookcase',e.target.value)}/></label><label><div className="label">Shelf *</div><input className="field" value={setup.location.shelf} onChange={e=>updateLocation('shelf',e.target.value)}/></label><label><div className="label">Room (optional)</div><input className="field" value={setup.location.room} onChange={e=>updateLocation('room',e.target.value)}/></label><label><div className="label">Collection</div><select className="select" value={setup.collection} onChange={e=>setSetup(current=>({...current,collection:e.target.value}))}><option value="">Unshelved</option>{collections.map(collection=><option key={collection} value={collection}>{collection}</option>)}</select></label><label><div className="label">Reading status</div><select className="select" value={setup.status} onChange={e=>setSetup(current=>({...current,status:e.target.value}))}>{STATUS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><p className="small">Choose a Bookcase and Shelf before scanning.</p>{parentNotice&&<p className="small" role="alert">{parentNotice}</p>}<div className="easy-setup-summary"><b>Books will be added to:</b><br/>Collection: {setup.collection||'Unshelved'}<br/>Location: {location}<br/>Status: {statusLabel(setup.status)}</div><div className="label">How would you like to scan?</div><div className="easy-method-choice"><button className={setup.method==='camera'?'selected':''} onClick={()=>setSetup(current=>({...current,method:'camera'}))}><b>Camera</b><small>Use the device camera.</small></button><button className={setup.method==='scanner'?'selected':''} onClick={()=>setSetup(current=>({...current,method:'scanner'}))}><b>Barcode scanner</b><small>Use a USB or Bluetooth scanner.</small></button></div><button className="btn easy-setup-start" onClick={begin} disabled={!locationReady}>Start scanning</button></div><button className="ghost" onClick={()=>onDone?.([])}>Back</button></div></div>}
  const title=success?.book?.title&&!/^Unknown/i.test(success.book.title)?success.book.title:'Book added';const celebrate=success?.count>0&&success.count%5===0;const scanMethod=session.method||'camera';
  return <div className="easy-scan"><div className="easy-session"><div className="easy-child-count" aria-label={addedCount+' books added'}><Icon name="book" size={20}/><span>{addedCount}</span></div><ParentHoldButton onOpen={()=>setParentOpen(true)}/><div className="easy-camera">{scanMethod==='camera'?<CameraBarcodeScanner active={!parentOpen} minimal={true} onDetected={detected} onInvalidDetected={()=>{}} onStop={()=>{}} onUnavailable={message=>{if(session.method==='camera')setCameraIssue(message);}}/>:<div className="easy-scanner-ready" role="status"><Icon name="scan" size={92}/><h1>Scanner ready</h1></div>}{success&&<div className="easy-success" role="status"><div className={'easy-success-card '+(celebrate?'easy-success-celebrate':'')}><div className="easy-success-check"><Icon name="check" size={32}/></div>{success.book.cover&&<img className="easy-success-cover" src={success.book.cover} alt=""/>}<div className="easy-success-title">{title}</div>{success.book.authors&&<div className="easy-success-author">{success.book.authors}</div>}<div className="easy-success-count"><Icon name="book" size={18}/><span>{success.count}</span></div><div className="easy-sparkles" aria-hidden="true"><Icon name="star" size={16}/><Icon name="star" size={12}/><Icon name="star" size={14}/></div></div></div>}</div>{parentOpen&&<EasyParentPanel session={session} history={history} addedCount={addedCount} cameraIssue={cameraIssue} parentNotice={parentNotice} onUndo={undo} onFinish={finish} onChangeDestination={changeDestination} onChangeMethod={changeMethod} onUseScanDesk={onUseScanDesk} onClose={()=>{setParentOpen(false);setParentNotice('');}}/>}</div></div>;
}

function ScanDesk({books,collections,onScan,onAddManual,onEdit,onDeleteIds,onSortSession,settings,setSettings,focusBatch=false,onBatchFocused}){
  const [val,setVal]=useState('');
  const [destination,setDestination]=useState('');
  const [cameraOn,setCameraOn]=useState(false);
  const [batchText,setBatchText]=useState('');
  const [batchRunning,setBatchRunning]=useState(false);
  const [locationNotice,setLocationNotice]=useState('');
  const [session,setSession]=useState({sent:0,added:0,copy:0,review:0,invalid:0});
  const [lastResult,setLastResult]=useState(null);
  const [recentScans,setRecentScans]=useState([]);
  const inputRef=useRef(null);const batchRef=useRef(null);const review=books.filter(b=>needsReview(b,books));const sessionCopyIds=uniq(recentScans.filter(scan=>scan.bookId&&['added','copy','review'].includes(scan.state)&&books.some(book=>book.id===scan.bookId)).map(scan=>scan.bookId));
  useEffect(()=>{if(focusBatch){setTimeout(()=>{batchRef.current?.focus();onBatchFocused?.();},60)}},[focusBatch,onBatchFocused]);
  const defaultLoc=normalizeLocation(settings?.defaultLocation);
  const locationReady=hasMoveDestination(defaultLoc);
  useEffect(()=>{setTimeout(()=>inputRef.current?.focus(),60)},[]);
  function batchCodes(){return String(batchText||'').split(/[\s,;]+/).map(normalizeScannedCode).filter(Boolean);}
  const allBatchCodes=batchCodes();
  const validBatchCodes=allBatchCodes.filter(isValidISBN);
  const invalidBatchCount=allBatchCodes.length-validBatchCodes.length;
  async function runScan(raw,source='manual'){
    const v=String(raw||'').trim();if(!v)return null;
    if(!hasMoveDestination(defaultLoc)){setLocationNotice('Choose a Bookcase and Shelf before scanning.');return {state:'error',detail:'Choose a Bookcase and Shelf before scanning. Catalog unchanged'};}
    setLocationNotice('');
    setSession(s=>({...s,sent:s.sent+1}));
    let result;
    try{result=await Promise.resolve(onScan(v,{collection:destination}));}
    catch(err){console.error('Scan failed',err);result={state:'error',detail:err?.message||'Unexpected scan error; catalog unchanged'};}
    const state=result?.state||'sent';
    const entry={id:genId(),code:normalizeScannedCode(v)||v,state,title:result?.book?.title||'',source,time:new Date().toLocaleTimeString(),bookId:result?.book?.id||'',detail:result?.detail||''};
    setLastResult(entry);
    setRecentScans(p=>[entry,...p]);
    if(['added','copy','review','invalid'].includes(state))setSession(s=>({...s,[state]:Number(s[state]||0)+1}));
    if(source==='manual')setTimeout(()=>inputRef.current?.focus(),30);
    return result;
  }
  const submit=()=>{const v=val.trim();if(!hasMoveDestination(defaultLoc)){setLocationNotice('Choose a Bookcase and Shelf before scanning.');return;}if(v){runScan(v,'manual');setVal('');}};
  async function runBatch(){
    if(!hasMoveDestination(defaultLoc)){setLocationNotice('Choose a Bookcase and Shelf before scanning.');return;}
    const codes=allBatchCodes;
    if(!codes.length){alert('Paste one ISBN per line, or separate ISBNs with spaces, commas, or semicolons.');return;}
    setBatchRunning(true);
    try{
      for(const code of codes){await runScan(code,'batch');}
      setBatchText('');
      setTimeout(()=>inputRef.current?.focus(),30);
    }finally{setBatchRunning(false);}
  }
  const updateLocation=(key,value)=>{setSettings?.(s=>normalizeSettings({...s,defaultLocation:{...normalizeLocation(s?.defaultLocation),[key]:value}}));if(key==='bookcase'||key==='shelf')setLocationNotice('');};
  return <div className="workspace grid2"><section className="panel panel-pad"><div className="overline">Scan Desk</div><h1 className="title">Batch book intake</h1><p className="subtitle">Scan one ISBN, run the camera continuously, or paste a whole list of ISBNs. New scans use the selected collection and default location below.</p>{locationNotice&&<p className="small bad" role="alert">{locationNotice}</p>}
    <div className="scan-session-card"><div><b>Current intake target</b><div className="small">Collection: <span className="mono">{destination||'Unshelved'}</span> · Location: <span className="mono">{formatLocationSummary(defaultLoc)}</span></div><div className="small">Mode: <span className="mono">{batchRunning?'Processing batch':cameraOn?'Continuous camera scan':'Single scan / hardware scanner'}</span>{lastResult?` · Last: ${scanStateLabel(lastResult.state)} ${lastResult.title||lastResult.code} at ${lastResult.time}`:''}</div></div><div className="row-actions">{sessionCopyIds.length>0&&<button className="btn" onClick={()=>onSortSession?.(sessionCopyIds)}>Sort session</button>}<button className="ghost" onClick={()=>{setSession({sent:0,added:0,copy:0,review:0,invalid:0});setLastResult(null);setRecentScans([]);setDestination('');}}>Reset session</button></div></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginTop:18}}><input ref={inputRef} className="field mono" style={{fontSize:20,padding:14}} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit()}}} placeholder="Scan, type, or paste one ISBN…"/><button className="btn" onClick={submit} disabled={!locationReady}>Add</button></div>
    <div className="quick-actions" style={{marginTop:10}}><button className="btn" onClick={()=>{if(!locationReady){setLocationNotice('Choose a Bookcase and Shelf before scanning.');return;}setCameraOn(true);}} disabled={cameraOn||!locationReady}>{cameraOn?'Camera active':'Start continuous camera scan'}</button><button className="ghost" onClick={onAddManual}><Icon name="plus" size={14}/>Manual entry</button><span className="small" style={{alignSelf:'center'}}>{isCameraAccessAvailable()?'Camera barcode scanning available':'Camera access is not supported in this browser'}</span></div>
    {cameraOn&&<CameraBarcodeScanner active={cameraOn} onDetected={code=>runScan(code,'camera')} onStop={()=>setCameraOn(false)}/>}
    <div className="batch-scan-panel"><div><div className="label">Batch ISBN intake</div><textarea ref={batchRef} className="field mono" value={batchText} onChange={e=>setBatchText(e.target.value)} placeholder={'Paste ISBNs here — one per line, or separated by spaces / commas / semicolons.\n9780140449136\n9780261103573\n9780307277671'} /></div><div className="batch-scan-meta"><span className="batch-scan-count">{validBatchCodes.length} valid ISBN{validBatchCodes.length===1?'':'s'} ready{invalidBatchCount>0?` · ${invalidBatchCount} invalid token${invalidBatchCount===1?'':'s'} will be reported`:''}</span><div className="row-actions"><button className="ghost" onClick={()=>setBatchText('')} disabled={!batchText||batchRunning}>Clear</button><button className="btn" onClick={runBatch} disabled={!allBatchCodes.length||batchRunning}>{batchRunning?'Processing batch…':'Process batch'}</button></div></div><div className="small">Repeated ISBNs are processed as additional physical copies. Set the destination collection and default location first, then scan or paste all ISBNs from that physical shelf.</div></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><label><div className="label">Destination collection</div><select className="select" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Unshelved</option>{collections.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label><div className="label">Default workflow</div><div className="select" style={{background:'#f6fbff'}}>Status: {statusLabel(settings?.defaultStatus||'unread')} · Review if incomplete</div></label></div>
    <div className="panel soft-panel" style={{marginTop:12,padding:12}}><div className="label">Default location for new scans</div><div className="location-grid"><input className="field" placeholder="Bookcase *" aria-label="Bookcase required" value={defaultLoc.bookcase} onChange={e=>updateLocation('bookcase',e.target.value)}/><input className="field" placeholder="Shelf *" aria-label="Shelf required" value={defaultLoc.shelf} onChange={e=>updateLocation('shelf',e.target.value)}/><input className="field" placeholder="Room (optional)" value={defaultLoc.room} onChange={e=>updateLocation('room',e.target.value)}/><input className="field" placeholder="Box (optional)" value={defaultLoc.box} onChange={e=>updateLocation('box',e.target.value)}/><input className="field" placeholder="Position (optional)" value={defaultLoc.position} onChange={e=>updateLocation('position',e.target.value)}/></div><div className="small" style={{marginTop:6}}>Bookcase and Shelf are required. Room, Box, and Position are optional.</div>{!locationReady&&<div className="small" role="status" style={{marginTop:6}}>Choose a Bookcase and Shelf before scanning.</div>}{locationNotice&&<div className="small" role="alert" style={{marginTop:6}}>{locationNotice}</div>}</div>
    <div className="grid3 scan-stats" style={{marginTop:16}}>{[['Sent',session.sent],['New books',session.added],['Copies added',session.copy],['Needs review',session.review],['Invalid',session.invalid],['Catalog total',books.length]].map(([l,v])=><div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
  </section><section style={{display:'grid',gap:14}}><div className="panel panel-pad"><h2 style={{margin:'0 0 10px',fontFamily:'Fraunces,serif'}}>Recent scans</h2>{recentScans.length?<div className="recent-scan-list">{recentScans.slice(0,10).map(scan=>{const exists=scan.bookId&&books.some(b=>b.id===scan.bookId);const undoable=exists&&['added','copy','review'].includes(scan.state);return <div key={scan.id} className={'recent-scan-row '+(scan.bookId&&!exists?'removed':'')}><div><b>{scan.title||scan.code}</b><div className="small"><span className={['invalid','error'].includes(scan.state)?'chip bad':scan.state==='review'?'chip warn':['added','copy'].includes(scan.state)?'chip good':'chip gray'}>{scanStateLabel(scan.state)}</span> <span className="mono">{scan.code}</span> · {scanSourceLabel(scan.source)} · {scan.time}{scan.detail?` · ${scan.detail}`:''}{scan.bookId&&!exists?' · removed':''}</div></div>{undoable?<button className="ghost danger" onClick={()=>onDeleteIds?.([scan.bookId])}>Undo add</button>:scan.bookId?<button className="ghost" onClick={()=>{const b=books.find(x=>x.id===scan.bookId);if(b)onEdit(b)}} disabled={!exists}>{exists?'Open':'Removed'}</button>:<span className="small">No record created</span>}</div>})}</div>:<div className="small">No books scanned yet. Scan or enter an ISBN to begin.</div>}</div><div className="panel panel-pad"><h2 style={{margin:'0 0 10px',fontFamily:'Fraunces,serif'}}>Needs review</h2>{review.length?review.slice(0,8).map(b=><button key={b.id} className="tr" style={{gridTemplateColumns:'1fr',textAlign:'left'}} onClick={()=>onEdit(b)}><b>{b.title}</b><span className="small">{reviewReasons(b,books).slice(0,3).join(' · ')}</span></button>):<div className="small">No review items right now.</div>}</div><div className="panel panel-pad"><h2 style={{margin:'0 0 10px',fontFamily:'Fraunces,serif'}}>Batch scanning notes</h2><p className="small" style={{lineHeight:1.55}}>A hardware barcode scanner can feed ISBNs into the single-ISBN field, the camera can run continuously, and the batch box can process pasted ISBN lists. Repeated ISBNs add legitimate physical copies under the same edition.</p><div style={{display:'flex',flexWrap:'wrap',gap:6}}><span className="chip">Continuous camera scan</span><span className="chip">Batch paste</span><span className="chip">Hardware scanner friendly</span><span className="chip">Location-aware intake</span><span className="chip">Review later</span></div></div></section></div>
}


function filterBooks(books,filters){return books.filter(b=>{
  if(!matches(b,filters.query,books))return false;
  if(filters.status&&b.status!==filters.status)return false;
  if(filters.collection&&filters.collection==='__unshelved__'&&!isUnshelved(b))return false;
  if(filters.collection&&filters.collection!=='__unshelved__'&&!inCollection(b,filters.collection))return false;
  if(filters.tag&&!(b.tags||[]).includes(filters.tag))return false;
  if(filters.room&&normalizeLocation(b.location).room!==filters.room)return false;
  if(filters.bookcase&&normalizeLocation(b.location).bookcase!==filters.bookcase)return false;
  if(filters.physicalShelf&&normalizeLocation(b.location).shelf!==filters.physicalShelf)return false;
  if(filters.box&&normalizeLocation(b.location).box!==filters.box)return false;
  if(filters.review==='needs'&&!needsReview(b,books))return false;
  if(filters.review==='reviewed'&&!b.reviewed)return false;
  if(filters.lent==='out'&&!isLentOut(b))return false;
  if(filters.lent==='overdue'&&!isOverdue(b))return false;
  if(filters.lent==='returned'&&!b.returnedDate)return false;
  if(filters.lent==='notlent'&&(isLentOut(b)||b.returnedDate))return false;
  if(filters.missing==='cover'&&b.cover)return false;
  if(filters.missing==='author'&&b.authors)return false;
  if(filters.missing==='location'&&!hasMissingLocation(b))return false;
  if(filters.missing==='duplicates'&&!duplicateGroups(books).some(g=>g.items.some(x=>x.id===b.id)))return false;
  if(filters.minRating==='0'&&Number(b.rating)>0)return false;
  if(filters.minRating&&filters.minRating!=='0'&&Number(b.rating)<Number(filters.minRating))return false;
  return true;
});}
function getLibraryVisibleBooks(books,filters){const safe=(books||[]).filter(Boolean);const activeFilters=filters||defaultFilters;return rankBooksForSearch(filterBooks(safe,activeFilters),activeFilters.query);}
function compareNaturalLocationValue(a,b){const left=String(a||'').trim(),right=String(b||'').trim();if(!left&&!right)return 0;if(!left)return 1;if(!right)return-1;return left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'});}
function physicalLocationSortEntry(book,index){const location=normalizeLocation(book?.location);return{book,index,location:[location.room,location.bookcase,location.shelf,location.box,location.position],title:String(book?.title||''),copyId:String(book?.copyId||book?.id||'')};}
function comparePhysicalLocationEntries(a,b){const aLocated=a.location.some(value=>String(value||'').trim()),bLocated=b.location.some(value=>String(value||'').trim());if(aLocated!==bLocated)return aLocated?-1:1;for(let index=0;index<a.location.length;index++){const compared=compareNaturalLocationValue(a.location[index],b.location[index]);if(compared)return compared;}return compareNaturalLocationValue(a.title,b.title)||compareNaturalLocationValue(a.copyId,b.copyId)||a.index-b.index;}
function sortBooksByPhysicalLocation(books=[]){return (books||[]).map(physicalLocationSortEntry).sort(comparePhysicalLocationEntries).map(entry=>entry.book);}
function sortLibraryBooks(books,sortMode='default'){return sortMode==='physical-location'?sortBooksByPhysicalLocation(books):books;}
const defaultFilters={query:'',status:'',collection:'',tag:'',room:'',bookcase:'',physicalShelf:'',box:'',review:'',missing:'',lent:'',minRating:''};
const BUILTIN_VIEWS=[
  {name:'Needs Review',filters:{...defaultFilters,review:'needs'}},
  {name:'Possible duplicates',filters:{...defaultFilters,missing:'duplicates'}},
  {name:'Missing Covers',filters:{...defaultFilters,missing:'cover'}},
  {name:'Missing Location',filters:{...defaultFilters,missing:'location'}},
  {name:'Unread',filters:{...defaultFilters,status:'unread'}},
  {name:'Read but unrated',filters:{...defaultFilters,status:'read',minRating:'0'}},
  {name:'Lent out',filters:{...defaultFilters,lent:'out'}},
  {name:'Overdue loans',filters:{...defaultFilters,lent:'overdue'}},
  {name:'Quality: poor metadata',filters:{...defaultFilters,query:'quality:poor'}},
  {name:'Work groups',filters:{...defaultFilters,query:'work:group'}}
];
function libraryBrowseWorkKey(book){const nativeId=String(book?.workId||'').trim(),derived=migrationWorkKey(book);return nativeId||(derived?'derived:'+derived:'copy:'+String(book?.copyId||book?.id||''));}
function libraryBrowseWorkGroups(books=[]){
  const groups=new Map();
  for(const book of (books||[]).filter(Boolean)){
    const key=libraryBrowseWorkKey(book);if(!groups.has(key))groups.set(key,{key,representative:book,books:[]});groups.get(key).books.push(book);
  }
  return [...groups.values()];
}
function libraryAuthorNames(value){
  const raw=String(value||'').trim().replace(/\s+/g,' ');if(!raw)return[];
  const explicit=raw.split(/[;\n]+/).map(name=>name.trim()).filter(Boolean);if(explicit.length>1)return uniq(explicit);
  const joined=raw.split(/\s+(?:&|and)\s+/i).map(name=>name.trim()).filter(Boolean);if(joined.length>1)return uniq(joined);
  const comma=raw.split(',').map(name=>name.trim()).filter(Boolean);if(comma.length>1&&comma.every(name=>name.split(/\s+/).length>1))return uniq(comma);
  return[raw];
}
function libraryBrowseValueKey(value,caseSensitive=false){const clean=String(value||'').trim().replace(/\s+/g,' ');return caseSensitive?clean:clean.toLocaleLowerCase();}
function buildLibraryBrowseIndex(books,valueForCopy,caseSensitive=false){
  const entries=new Map();
  for(const work of libraryBrowseWorkGroups(books)){
    const workValues=new Map();for(const copy of work.books){for(const value of uniq(valueForCopy(copy,work)||[])){const label=String(value||'').trim().replace(/\s+/g,' ');if(!label)continue;const key=libraryBrowseValueKey(label,caseSensitive);if(!workValues.has(key))workValues.set(key,{key,label,books:[]});workValues.get(key).books.push(copy);}}
    for(const value of workValues.values()){if(!entries.has(value.key))entries.set(value.key,{key:value.key,label:value.label,workKeys:[],books:[],workCount:0,copyCount:0,representative:null});const entry=entries.get(value.key);entry.workKeys.push(work.key);entry.books.push(...value.books);entry.workCount++;entry.copyCount+=value.books.length;if(!entry.representative||(!entry.representative.cover&&value.books.some(copy=>copy.cover)))entry.representative=value.books.find(copy=>copy.cover)||value.books[0];}
  }
  return [...entries.values()].sort((a,b)=>a.label.localeCompare(b.label,undefined,{sensitivity:'base',numeric:true}));
}
function buildAuthorBrowseIndex(books){return buildLibraryBrowseIndex(books,book=>libraryAuthorNames(book.authors));}
function buildSeriesBrowseIndex(books){return buildLibraryBrowseIndex(books,book=>[book.series].filter(Boolean));}
function buildSubjectBrowseIndex(books){return buildLibraryBrowseIndex(books,book=>book.tags||[],true);}
function booksForBrowseValue(index,value,caseSensitive=false){return(index||[]).find(entry=>entry.key===libraryBrowseValueKey(value,caseSensitive))?.books||[];}
function booksForAuthor(books,author){return booksForBrowseValue(buildAuthorBrowseIndex(books),author);}
function booksForSeries(books,series){return booksForBrowseValue(buildSeriesBrowseIndex(books),series);}
function booksForSubject(books,subject){return booksForBrowseValue(buildSubjectBrowseIndex(books),subject,true);}
function filterLibraryBrowseIndex(index,query){const wanted=normalizeSearchText(query);return(index||[]).filter(entry=>!wanted||normalizeSearchText(entry.label).includes(wanted)||fuzzyTokenMatch({title:entry.label},wanted));}
function filterLibraryBrowseBooks(books,query,allBooks=books){const wanted=String(query||'').trim();return(books||[]).filter(book=>!wanted||matches(book,wanted,allBooks));}
function libraryBrowseInitial(label){const first=String(label||'').trim().charAt(0);if(/[0-9]/.test(first))return'0–9';const base=normalizeSearchText(first).charAt(0);if(/[a-z]/.test(base))return base.toUpperCase();return'#';}
function groupLibraryBrowseIndex(index=[]){const groups=new Map();for(const entry of index){const initial=libraryBrowseInitial(entry.label);if(!groups.has(initial))groups.set(initial,[]);groups.get(initial).push(entry);}return [...groups].map(([initial,entries])=>({initial,entries}));}
function libraryBrowseMissingCount(books=[],mode){return(books||[]).filter(book=>mode==='authors'?!libraryAuthorNames(book.authors).length:mode==='series'?!String(book.series||'').trim():mode==='subjects'?!((book.tags||[]).map(tag=>String(tag||'').trim()).filter(Boolean).length):false).length;}
function libraryBrowseCopyId(book){return String(book?.copyId||book?.id||'');}
function intersectLibraryBrowseCopies(groupBooks=[],visibleBooks=[]){const ids=new Set((groupBooks||[]).map(libraryBrowseCopyId));return(visibleBooks||[]).filter(book=>ids.has(libraryBrowseCopyId(book)));}
function visualBrowseSubset(visibleBooks=[],context){if(!context)return visibleBooks||[];const ids=new Set(context.copyIds||[]);return(visibleBooks||[]).filter(book=>ids.has(libraryBrowseCopyId(book)));}
function libraryBrowseSelectionState(current,mode,key){return{...(current||{}),[mode]:key};}
function createVisualBrowseContext(sourceMode,entry){return{sourceMode,sourceKey:entry.key,label:entry.label,copyIds:entry.books.map(libraryBrowseCopyId)};}
function visualBrowseContextAfterTab(mode,context){return mode==='browse'?null:context;}
function compareSeriesPosition(a,b){
  const av=String(typeof a==='string'?a:a?.seriesNumber||'').trim(),bv=String(typeof b==='string'?b:b?.seriesNumber||'').trim();if(!av&&!bv)return 0;if(!av)return 1;if(!bv)return-1;
  const an=/^\d+(?:\.\d+)?$/.test(av),bn=/^\d+(?:\.\d+)?$/.test(bv);if(an&&bn)return Number(av)-Number(bv)||av.localeCompare(bv,undefined,{numeric:true});if(an!==bn)return an?-1:1;return av.localeCompare(bv,undefined,{sensitivity:'base',numeric:true});
}
function libraryBrowseCount(entry){const works=entry?.workCount||0,copies=entry?.copyCount||0;return works+' '+(works===1?'work':'works')+' · '+copies+' physical '+(copies===1?'copy':'copies');}
function buildBookcaseNavigationIndex(catalog){
  const bookcases=new Map(),missing=[],partial=[],seen=new Set();let located=0,shelfCount=0;
  for(const copy of catalog?.copies||[]){
    const id=String(copy?.id||'').trim();if(!id||seen.has(id))continue;seen.add(id);
    const location=normalizeLocation(copy.location);
    if(hasUnassignedCoreLocation(location)){
      const anyLocation=['room','bookcase','shelf','box','position'].some(field=>String(location[field]||'').trim());
      (anyLocation?partial:missing).push(copy);continue;
    }
    const room=String(location.room||'').trim(),bookcase=String(location.bookcase||'').trim(),shelf=String(location.shelf||'').trim();
    if(!bookcase||!shelf){partial.push(copy);continue;}
    located++;
    const identity=JSON.stringify([bookcase,room]);
    if(!bookcases.has(identity))bookcases.set(identity,{id:identity,label:bookcase,room,copies:[],shelves:new Map()});
    const bookcaseNode=bookcases.get(identity);bookcaseNode.copies.push(copy);
    if(!bookcaseNode.shelves.has(shelf)){bookcaseNode.shelves.set(shelf,{label:shelf,copies:[]});shelfCount++;}
    bookcaseNode.shelves.get(shelf).copies.push(copy);
  }
  const sorted=values=>[...values].sort((a,b)=>compareNaturalLocationValue(a.label,b.label));
  const entries=sorted([...bookcases.values()].map(bookcase=>({...bookcase,shelves:sorted(bookcase.shelves.values())}))).sort((a,b)=>compareNaturalLocationValue(a.label,b.label)||compareNaturalLocationValue(a.room,b.room));
  return {bookcases:entries,missing,partial,counts:{copies:seen.size,located,missing:missing.length,partial:partial.length,rooms:new Set(entries.map(item=>item.room).filter(Boolean)).size,bookcases:entries.length,shelves:shelfCount}};
}
function compareBookcaseCopyPosition(a,b){const ap=String(a?.location?.position||'').trim(),bp=String(b?.location?.position||'').trim();const an=/^\d+(?:\.\d+)?$/.test(ap),bn=/^\d+(?:\.\d+)?$/.test(bp);if(an&&bn&&Number(ap)!==Number(bp))return Number(ap)-Number(bp);if(an!==bn)return an?-1:1;return String(a?.title||'').localeCompare(String(b?.title||''),undefined,{sensitivity:'base',numeric:true})||String(a?.id||'').localeCompare(String(b?.id||''),undefined,{numeric:true});}
function sortBookcaseShelfCopies(copies=[]){return [...copies].sort(compareBookcaseCopyPosition);}
function bookcaseUnassignedShelfCopies(partial=[],room='',bookcase=''){return (partial||[]).filter(copy=>{const location=normalizeLocation(copy.location);return location.room===room&&location.bookcase===bookcase&&!location.shelf;});}
function stableBookcaseHash(value=''){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}
function visualBookPresentation(copy={},book={}){const palettes=[['#d5c8b5','#263342'],['#c5d0ca','#24343a'],['#d2c3bd','#392d32'],['#c5cbd7','#263249'],['#d8d0b4','#343322'],['#c2c9b2','#2e3628']];const editionKey=copy.editionId||book.editionId||copy.isbn||book.isbn||copy.workId||book.workId||copy.id||book.id||book.title||'';const color=palettes[stableBookcaseHash(editionKey)%palettes.length],shape=stableBookcaseHash(copy.id||book.copyId||book.id||book.title||'');return {background:color[0],foreground:color[1],width:42+shape%13,height:146+(shape>>>5)%29};}
function LibraryBrowseTabs({mode,onChange}){const modes=[['books','Books'],['bookcases','Bookcases'],['browse','Browse'],['authors','Authors'],['series','Series'],['subjects','Subjects']];return <div className="library-browse-tabs" role="tablist" aria-label="Browse library by">{modes.map(([id,label])=><button key={id} role="tab" aria-selected={mode===id} onClick={()=>onChange(id)}>{label}</button>)}</div>;}
function BrowseCopyList({books,allGroupBooks,onEdit,mode,onClearFilters}){
  return <div className="library-browse-copies" role="list" aria-label="Library browse results">{books.length?books.map(book=>{const copyContext=editionCopyContext(book,allGroupBooks);const location=locationText(book);const context=[copyContext?.label,statusLabel(book.status),location].filter(Boolean).join(' · ');return <div className="library-browse-copy-item" role="listitem" key={libraryBrowseCopyId(book)}><button className="library-browse-copy" onClick={()=>onEdit(book)} aria-label={'Open '+(book.title||'Untitled book')+(context?', '+context:'')}><span className="library-browse-copy-cover">{book.cover?<img loading="lazy" src={book.cover} alt=""/>:<span className="library-browse-cover-placeholder"><Icon name="book" size={24}/></span>}<ReadBadge book={book}/>{mode==='series'&&book.seriesNumber?<span className="library-series-position">#{book.seriesNumber}</span>:null}</span><span className="library-browse-copy-main"><b>{book.title||'Untitled book'}</b>{book.authors?<span>{book.authors}</span>:null}<span className="library-browse-copy-meta">{context}</span></span></button></div>}):<div className="clean-empty"><h2>No physical copies in this group match the current Library filters.</h2><p>Change or clear the active search and filters to see this group again.</p>{onClearFilters?<button className="ghost" onClick={onClearFilters}>Clear filters</button>:null}</div>}</div>;
}
function visualBrowseWindow(books,activeIndex,radius=3){const safe=books||[];if(!safe.length)return[];const index=Math.max(0,Math.min(Number(activeIndex)||0,safe.length-1)),start=Math.max(0,index-radius);return safe.slice(start,Math.min(safe.length,index+radius+1)).map((book,localIndex)=>({book,offset:start+localIndex-index}));}
function visualBrowseActiveId(books,activeId,fallbackIndex=0){const safe=books||[];if(!safe.length)return'';if(safe.some(book=>book.id===activeId))return activeId;return safe[Math.max(0,Math.min(Number(fallbackIndex)||0,safe.length-1))].id;}
function visualBrowseMove(books,activeId,step){const safe=books||[];if(!safe.length)return'';const current=Math.max(0,safe.findIndex(book=>book.id===activeId));const next=Math.max(0,Math.min(current+(Number(step)||0),safe.length-1));return safe[next].id;}
function visualBrowseSwipeStep(deltaX,deltaY,threshold=48){const x=Number(deltaX)||0,y=Number(deltaY)||0;if(Math.abs(x)<threshold||Math.abs(x)<=Math.abs(y)*1.15)return 0;return x<0?1:-1;}
function editionCopyContext(book,allBooks=[]){if(!book?.editionId)return null;const copies=(allBooks||[]).filter(item=>item?.editionId===book.editionId);if(copies.length<2)return null;const id=String(book.copyId||book.id||''),index=copies.findIndex(item=>String(item.copyId||item.id||'')===id);return index<0?null:{position:index+1,total:copies.length,label:`Copy ${index+1} of ${copies.length}`};}
function visualBrowsePositionClass(offset){return offset<0?'browse-pos-neg'+Math.abs(offset):'browse-pos-'+offset;}
function openVisualBrowseBook(book,onEdit){if(book)onEdit?.(book);}
function VisualBrowseView({books,allBooks,filters,setFilters,onEdit,browseTabs,onBackBooks,activeCopyId,setActiveCopyId,queryPending=false,browseContext,onReturnContext}){
  const fallbackIndexRef=useRef(0),pointerRef=useRef(null),swipeRef=useRef(false);const [dragX,setDragX]=useState(0);const activeIndex=books.length?Math.max(0,books.findIndex(book=>book.id===activeCopyId)):0;const activeBook=books[activeIndex]||null;const windowBooks=visualBrowseWindow(books,activeIndex);const copyContext=editionCopyContext(activeBook,allBooks);const collections=activeBook?collectionNames(activeBook):[];const collectionSummary=collections.length?[collections.slice(0,2).join(' · '),collections.length>2?`+${collections.length-2} more`:''].filter(Boolean).join(' · '):'';const hasFilters=Object.values(filters||{}).some(Boolean);
  useEffect(()=>{const next=visualBrowseActiveId(books,activeCopyId,fallbackIndexRef.current);if(next!==activeCopyId)setActiveCopyId(next);},[books,activeCopyId,setActiveCopyId]);
  useEffect(()=>{if(activeBook)fallbackIndexRef.current=activeIndex;},[activeBook,activeIndex]);
  const move=step=>{const next=visualBrowseMove(books,activeCopyId,step);if(next)setActiveCopyId(next);};
  useEffect(()=>{const handler=event=>{if(event.defaultPrevented||document.querySelector('.modal-back')||isTypingTarget(event.target))return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}else if(event.key==='ArrowRight'){event.preventDefault();move(1);}else if(event.key==='Enter'&&activeBook){event.preventDefault();openVisualBrowseBook(activeBook,onEdit);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[books,activeCopyId,activeBook,onEdit]);
  const pointerDown=event=>{if(event.pointerType==='mouse'&&event.button!==0)return;pointerRef.current={id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:false};swipeRef.current=false;};
  const pointerMove=event=>{const start=pointerRef.current;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(!start.horizontal&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.15){start.horizontal=true;event.currentTarget.setPointerCapture?.(event.pointerId);}if(start.horizontal){event.preventDefault();setDragX(Math.max(-46,Math.min(46,dx*.32)));}};
  const pointerEnd=event=>{const start=pointerRef.current;if(!start||start.id!==event.pointerId)return;const step=visualBrowseSwipeStep(event.clientX-start.x,event.clientY-start.y);pointerRef.current=null;setDragX(0);if(step){swipeRef.current=true;move(step);setTimeout(()=>{swipeRef.current=false;},0);}};const pointerCancel=()=>{pointerRef.current=null;setDragX(0);};
  const coverClick=(event,book,offset)=>{if(swipeRef.current){event.preventDefault();event.stopPropagation();return;}if(offset===0)openVisualBrowseBook(book,onEdit);else setActiveCopyId(book.id);};
  const sourceLabel=browseContext?(browseContext.sourceMode==='series'?'series':browseContext.sourceMode.slice(0,-1)):'';const returnAction=browseContext?<button className="ghost" onClick={onReturnContext} aria-label={'Back to '+browseContext.label}>← Back to {browseContext.label}</button>:<button className="ghost" onClick={onBackBooks}>Refine in Books</button>;
  if(!books.length)return <div className="workspace library-shell visual-browse-shell"><div className="visual-browse-head"><div><div className="overline">{browseContext?'Browsing '+sourceLabel:'Library'}</div><h1 className="title">{browseContext?.label||'Browse'}</h1></div>{returnAction}</div>{browseTabs}<div className="visual-browse-empty"><h2>{browseContext?'No physical copies in this group match the current Library filters.':'No books to browse.'}</h2><p>Try changing your search or Library filters.</p><div className="row-actions" style={{justifyContent:'center'}}>{browseContext?<button className="ghost" onClick={onReturnContext}>← Back to {browseContext.label}</button>:<button className="ghost" onClick={onBackBooks}>Back to Books</button>}<button className="ghost" onClick={()=>setFilters(defaultFilters)}>Clear filters</button></div></div></div>;
  const publication=[activeBook.year,activeBook.publisher].filter(Boolean).join(' · ');const context=[statusLabel(activeBook.status),collectionSummary].filter(Boolean).join(' · ');const location=locationText(activeBook);
  return <div className="workspace library-shell visual-browse-shell"><div className="visual-browse-head"><div><div className="overline">{browseContext?'Browsing '+sourceLabel:'Library'}</div><h1 className="title">{browseContext?.label||'Browse'}</h1></div><div className="visual-browse-head-actions"><span className="small">{hasFilters?'Filtered library · ':''}{books.length} physical {books.length===1?'copy':'copies'}{queryPending?' · filtering...':''}</span>{returnAction}</div></div>{browseTabs}<div className="visual-browse-stage" role="region" aria-label="Visual library browse" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerCancel}><div className="visual-browse-track" style={{'--browse-drag':dragX+'px'}}>{windowBooks.map(({book,offset})=><button key={book.id} className={'visual-browse-item '+visualBrowsePositionClass(offset)} onClick={event=>coverClick(event,book,offset)} aria-label={(offset===0?'Open ':'Focus ')+(book.title||'Untitled book')} aria-current={offset===0?'true':undefined} tabIndex={Math.abs(offset)<=1?0:-1}><span className="visual-browse-cover">{book.cover?<img loading={Math.abs(offset)<=1?'eager':'lazy'} src={book.cover} alt={book.title?`Cover of ${book.title}`:'Book cover'}/>:<span className="visual-browse-placeholder"><Icon name="book" size={38}/><b>{book.title||'Untitled book'}</b></span>}<ReadBadge book={book}/></span></button>)}</div><div className="visual-browse-controls" aria-label="Browse controls"><button className="ghost" onClick={()=>move(-1)} disabled={activeIndex===0} aria-label="Previous book">←</button><button className="ghost" onClick={()=>move(1)} disabled={activeIndex===books.length-1} aria-label="Next book">→</button></div></div><div className="visual-browse-info"><div className="visual-browse-copy-context">{activeIndex+1} of {books.length}{copyContext?' · '+copyContext.label:''}</div><h2>{activeBook.title||'Untitled book'}</h2>{activeBook.authors?<div className="visual-browse-author">{activeBook.authors}</div>:null}{publication&&<div className="visual-browse-meta">{publication}</div>}{context&&<div className="visual-browse-context">{context}</div>}{location&&<div className="visual-browse-context">{location}</div>}<button className="btn" onClick={()=>openVisualBrowseBook(activeBook,onEdit)} aria-label={'Open '+(activeBook.title||'book')}>Open book</button></div><div className="sr-only" aria-live="polite">{`Book ${activeIndex+1} of ${books.length}: ${activeBook.title||'Untitled book'}`}</div></div>;
}
function VisualBookcase({bookcase,room,unassigned,books,onEdit,onMoveRequest,onOpenScan}){
  const booksByCopyId=useMemo(()=>new Map(books.map(book=>[String(book.copyId||book.id),book])),[books]);
  const presentationByCopyId=useMemo(()=>new Map(bookcase.shelves.flatMap(shelf=>shelf.copies.map(copy=>[copy.id,visualBookPresentation(copy,booksByCopyId.get(copy.id)||{})]))),[bookcase,booksByCopyId]);
  const [selectedCopyId,setSelectedCopyId]=useState('');
  const copiesById=useMemo(()=>new Map(bookcase.copies.map(copy=>[copy.id,copy])),[bookcase]);
  const selectedCopy=selectedCopyId?copiesById.get(selectedCopyId):null;
  useEffect(()=>{if(selectedCopyId&&!copiesById.has(selectedCopyId))setSelectedCopyId('');},[copiesById,selectedCopyId]);
  const selectedBook=selectedCopy?booksByCopyId.get(selectedCopy.id):null;
  const locateSelected=()=>{if(!selectedCopy)return;document.getElementById('visual-shelf-'+encodeURIComponent(normalizeLocation(selectedCopy.location).shelf))?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});};
  return <section className="visual-bookcase" aria-label={'Visual bookcase '+bookcase.label}>
    <div className="visual-bookcase-heading"><div><div className="overline">{room} · {bookcase.label}</div><h2>{bookcase.label}</h2><p className="small">{bookcase.copies.length} physical {bookcase.copies.length===1?'Copy':'Copies'} across {bookcase.shelves.length} {bookcase.shelves.length===1?'Shelf':'Shelves'}</p></div><button className="ghost" onClick={()=>onOpenScan({room,bookcase:bookcase.label,shelf:'',box:'',position:''})}>Scan to this Bookcase</button></div>
    <div className="visual-bookcase-layout"><div className="visual-bookcase-frame">{bookcase.shelves.map(shelf=><section className="visual-shelf" id={'visual-shelf-'+encodeURIComponent(shelf.label)} key={shelf.label} aria-label={shelf.label}><div className="visual-shelf-head"><h3>{physicalLocationParts({shelf:shelf.label}).primary}</h3><span className="small">{shelf.copies.length} {shelf.copies.length===1?'Copy':'Copies'}</span><button className="mini-action" onClick={()=>onOpenScan({room,bookcase:bookcase.label,shelf:shelf.label,box:'',position:''})}>Scan to this Shelf</button></div><div className="visual-shelf-books">{sortBookcaseShelfCopies(shelf.copies).map(copy=>{const book=booksByCopyId.get(copy.id),presentation=presentationByCopyId.get(copy.id),isSelected=selectedCopyId===copy.id,editionContext=book?editionCopyContext(book,books):null,label=[book?.title||'Untitled book',book?.authors,locationText({location:copy.location}),editionContext?.label].filter(Boolean).join(', ');return <article className="visual-copy" key={copy.id} style={{'--spine-width':presentation.width+'px','--spine-height':presentation.height+'px','--spine-color':presentation.background,'--spine-ink':presentation.foreground}}><button className={'visual-copy-book '+(isSelected?'selected':'')} onClick={()=>setSelectedCopyId(current=>current===copy.id?'':copy.id)} aria-label={'Select '+label} aria-pressed={isSelected} title={label} disabled={!book}><span className="visual-copy-spine-cover">{book?.cover?<img loading="lazy" src={book.cover} alt=""/>:null}</span><span className="visual-copy-title">{book?.title||'Untitled book'}</span>{book?.authors&&<span className="visual-copy-author">{book.authors}</span>}{copy.location?.position&&<span className="visual-copy-position">#{copy.location.position}</span>}</button></article>})}</div><div className="visual-shelf-board" aria-hidden="true"/></section>)}</div>
      <aside className="visual-copy-panel" aria-label="Selected physical Copy" aria-live="polite">{selectedCopy&&selectedBook?<><div className="visual-copy-panel-cover">{selectedBook.cover?<img src={selectedBook.cover} alt=""/>:<span aria-hidden="true">{selectedBook.title||'Book'}</span>}</div><div className="visual-copy-panel-copy"><div className="overline">Selected physical Copy</div><h3>{selectedBook.title||'Untitled book'}</h3><p>{selectedBook.authors||'Unknown author'}</p><small>{[selectedBook.edition||selectedBook.publisher,selectedBook.isbn].filter(Boolean).join(' · ')||'Edition details not recorded'}</small><PhysicalLocation location={selectedCopy.location} compact/><div className="visual-copy-panel-actions"><button className="btn" onClick={()=>onEdit(selectedBook)}>Open details</button><button className="ghost" onClick={()=>onMoveRequest([selectedCopy.id])}>Move Copy</button><button className="ghost" onClick={locateSelected}>Locate on Shelf</button></div></div></>:<div className="visual-copy-panel-empty"><div className="overline">Selected physical Copy</div><p>Select a spine to see its edition, full location, and actions.</p></div>}</aside>
    </div>
    {unassigned.length>0&&<section className="visual-unassigned"><div><h3>Books not assigned to a Shelf</h3><span className="small">{unassigned.length} physical {unassigned.length===1?'Copy':'Copies'}</span></div><div className="visual-unassigned-copies">{unassigned.map(copy=>{const book=booksByCopyId.get(copy.id);return <div className="visual-unassigned-copy" key={copy.id}><button className="ghost" onClick={()=>book&&onEdit(book)} aria-label={'Open '+(book?.title||'Untitled book')+', not assigned to a Shelf'}>{book?.title||'Untitled book'}</button><button className="mini-action" onClick={()=>onMoveRequest([copy.id])}>Move</button></div>})}</div></section>}
  </section>;
}
function BookcasesLibraryView({catalog,books,onEdit,browseTabs,onMoveRequest,onOpenScan}){
  const index=useMemo(()=>buildBookcaseNavigationIndex(catalog),[catalog]);
  const [path,setPath]=useState({room:'',bookcase:'',bookcaseId:'',shelf:'',special:''});
  const [visualBookcase,setVisualBookcase]=useState(false);
  const [selecting,setSelecting]=useState(false),[selectedIds,setSelectedIds]=useState([]);
  const booksByCopyId=useMemo(()=>new Map(books.map(book=>[String(book.copyId||book.id),book])),[books]);
  const editionCopies=useMemo(()=>{const groups=new Map();for(const copy of catalog?.copies||[]){const items=groups.get(copy.editionId)||[];items.push(copy.id);groups.set(copy.editionId,items);}return groups;},[catalog]);
  const bookcase=index.bookcases.find(item=>item.id===path.bookcaseId);
  const shelf=bookcase?.shelves.find(item=>item.label===path.shelf);
  const invalidPath=Boolean(path.bookcaseId&&!bookcase||path.shelf&&!shelf||path.special==='missing'&&!index.missing.length||path.special==='partial'&&!index.partial.length);
  useEffect(()=>{if(invalidPath)setPath({room:'',bookcase:'',bookcaseId:'',shelf:'',special:''});},[invalidPath]);
  const active=invalidPath?{room:'',bookcase:'',bookcaseId:'',shelf:'',special:''}:path;
  const inventory=active.special==='missing'?index.missing:active.special==='partial'?index.partial:active.shelf?shelf?.copies||[]:null;
  const countLabel=n=>n+' physical '+(n===1?'copy':'copies');
  const cards=active.bookcaseId?(bookcase?.shelves||[]):index.bookcases;
  const cardKind=active.bookcaseId?'Shelf':'Bookcase';
  const heading=active.special==='missing'?'Needs a location':active.special==='partial'?'Incomplete location':active.shelf?physicalLocationParts({shelf:active.shelf}).primary:bookcase?.label||'Bookcases';
  const sortedInventory=useMemo(()=>[...(inventory||[])].sort((a,b)=>{const first=booksByCopyId.get(a.id),second=booksByCopyId.get(b.id);return String(first?.title||'').localeCompare(String(second?.title||''),undefined,{sensitivity:'base',numeric:true})||String(a.id).localeCompare(String(b.id));}),[inventory,booksByCopyId]);
  useEffect(()=>setSelectedIds(current=>current.filter(id=>sortedInventory.some(copy=>copy.id===id))),[inventory]);
  const openCard=item=>setPath(current=>current.bookcaseId?{...current,shelf:item.label}:{room:item.room,bookcase:item.label,bookcaseId:item.id,shelf:'',special:''});
  const toggleSelected=id=>setSelectedIds(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  const requestMove=ids=>{onMoveRequest(ids);setSelectedIds([]);setSelecting(false);};
  return <div className="workspace library-shell bookcases-library">
    <div className="library-topbar"><div><div className="overline">Library · Physical locations</div><h1 className="title">{heading}</h1></div><div className="bookcase-top-actions"><span className="small">{countLabel(index.counts.copies)} in the library</span><button className="ghost" onClick={()=>onOpenScan(blankLocation())}>Scan to Location</button></div></div>
    {browseTabs}
    <nav className="bookcase-breadcrumbs" aria-label="Physical location breadcrumbs">
      <button onClick={()=>setPath({room:'',bookcase:'',bookcaseId:'',shelf:'',special:''})} aria-current={!active.bookcaseId&&!active.special?'page':undefined}>All Bookcases</button>
      {active.bookcaseId&&<><span aria-hidden="true">›</span><button onClick={()=>setPath({room:active.room,bookcase:active.bookcase,bookcaseId:active.bookcaseId,shelf:'',special:''})} aria-current={!active.shelf?'page':undefined}>{active.bookcase}{active.room?' · '+active.room:''}</button></>}
      {active.shelf&&<><span aria-hidden="true">›</span><span aria-current="page">{heading}</span></>}
      {active.special&&<><span aria-hidden="true">›</span><span aria-current="page">{heading}</span></>}
    </nav>
    {!active.bookcaseId&&!active.special&&<div className="bookcase-stats" aria-label="Physical library overview">
      <div><strong>{index.counts.copies}</strong><span>Physical copies</span></div>
      <div><strong>{index.counts.located}</strong><span>Fully located</span></div>
      <div><strong>{index.counts.rooms}</strong><span>Rooms</span></div>
      <div><strong>{index.counts.bookcases}</strong><span>Bookcases</span></div>
      <div><strong>{index.counts.shelves}</strong><span>Shelves</span></div>
    </div>}
    {inventory?<section className="bookcase-inventory" aria-label={heading+' inventory'}>
      <div className="bookcase-section-head"><div><div className="overline">{active.special?'Physical copies needing attention':'Shelf inventory'}</div><h2>{heading}</h2><p>{countLabel(sortedInventory.length)}{active.shelf?' assigned to this exact shelf.':' in this group.'}</p></div><div className="row-actions">{active.shelf&&<button className="ghost" onClick={()=>onOpenScan({room:active.room,bookcase:bookcase?.label,shelf:active.shelf,box:'',position:''})}>Scan books here</button>}<button className="ghost" onClick={()=>{setSelecting(value=>!value);setSelectedIds([])}}>{selecting?'Cancel selection':'Select copies'}</button></div></div>
      {selecting&&<div className="bookcase-selection-bar"><span>{selectedIds.length} physical {selectedIds.length===1?'Copy':'Copies'} selected</span><button className="btn" disabled={!selectedIds.length} onClick={()=>requestMove(selectedIds)}>Move {selectedIds.length} selected</button></div>}
      <div className="bookcase-copy-list" role="list">{sortedInventory.map(copy=>{const book=booksByCopyId.get(copy.id),peerIds=editionCopies.get(copy.editionId)||[],number=peerIds.indexOf(copy.id)+1;return <div className={'bookcase-copy-row '+(selecting?'selecting':'')} role="listitem" key={copy.id}>
        {selecting&&<input type="checkbox" aria-label={'Select physical Copy of '+(book?.title||copy.id)} checked={selectedIds.includes(copy.id)} onChange={()=>toggleSelected(copy.id)}/>}
        <div className="bookcase-copy-cover">{book?.cover?<img loading="lazy" src={book.cover} alt=""/>:<Icon name="book" size={22}/>}</div>
        <div className="bookcase-copy-body"><button className="bookcase-copy-title" onClick={()=>book&&onEdit(book)} disabled={!book}>{book?.title||'Untitled book'}</button><span>{book?.authors||'Unknown author'}</span><small>{[book?.edition||book?.publisher||'',book?.isbn||''].filter(Boolean).join(' · ')||'Edition details not recorded'}</small><small>{peerIds.length>1?`Copy ${number} of ${peerIds.length} · `:''}{statusLabel(copy.status)}</small><PhysicalLocation location={copy.location} compact/></div>
        {!selecting&&<button className="ghost bookcase-copy-open" onClick={()=>requestMove([copy.id])}>Move</button>}
      </div>})}</div>
    </section>:<>
      {!active.bookcaseId&&<p className="small bookcase-intro">Browse Bookcase → Shelf → Copy. Room is optional context; Collections are separate. This view shows the complete inventory regardless of Library search filters.</p>}
      {active.bookcaseId&&!active.shelf&&<div className="bookcase-view-toggle" role="group" aria-label="Bookcase view"><button className={!visualBookcase?'active':''} aria-pressed={!visualBookcase} onClick={()=>setVisualBookcase(false)}>List / Inventory</button><button className={visualBookcase?'active':''} aria-pressed={visualBookcase} onClick={()=>setVisualBookcase(true)}>Visual Bookcase</button></div>}
      {active.bookcaseId&&!active.shelf&&visualBookcase?<VisualBookcase bookcase={bookcase} room={active.room} unassigned={[...index.missing,...index.partial].filter(copy=>{const location=normalizeLocation(copy.location);return location.room===active.room&&location.bookcase===bookcase?.label&&!location.shelf;})} books={books} onEdit={onEdit} onMoveRequest={onMoveRequest} onOpenScan={onOpenScan}/>:cards.length?<div className="bookcase-card-grid" aria-label={cardKind+'s'}>{cards.map(item=><button className="bookcase-nav-card" key={active.bookcaseId?item.label:item.id} onClick={()=>openCard(item)}><span className="overline">{cardKind}</span><strong>{active.bookcaseId?physicalLocationParts({shelf:item.label}).primary:item.label}</strong>{!active.bookcaseId&&item.room&&<span className="small">Room: {item.room}</span>}<span>{countLabel(item.copies.length)} · {active.bookcaseId?'View shelf':item.shelves.length+' '+(item.shelves.length===1?'shelf':'shelves')}</span><span className="bookcase-card-arrow" aria-hidden="true">›</span></button>)}</div>:<div className="clean-empty"><h2>No physical locations yet.</h2><p>Open a book in Library and assign its Bookcase and Shelf to start browsing here.</p></div>}
      {!active.bookcaseId&&<div className="bookcase-fallbacks">
        {index.missing.length>0&&<button className="bookcase-fallback-card" onClick={()=>setPath({room:'',bookcase:'',shelf:'',special:'missing'})}><strong>Needs a location</strong><span>{countLabel(index.missing.length)} with no recorded physical location details. Open a copy to assign Bookcase and Shelf.</span><b>{index.missing.length} ›</b></button>}
        {index.partial.length>0&&<button className="bookcase-fallback-card" onClick={()=>setPath({room:'',bookcase:'',shelf:'',special:'partial'})}><strong>Incomplete location</strong><span>{countLabel(index.partial.length)} with some location details but missing Bookcase or Shelf.</span><b>{index.partial.length} ›</b></button>}
      </div>}
    </>}
  </div>;
}
function LibraryView(props){
  const {books,filters,setFilters,onEdit}=props;const [browseMode,setBrowseMode]=useState('books');const [browseSelections,setBrowseSelections]=useState({authors:'',series:'',subjects:''});const [visualBrowseContext,setVisualBrowseContext]=useState(null);const [visualActiveCopyId,setVisualActiveCopyId]=useState('');const debouncedQuery=useDebouncedValue(filters.query,180);const effectiveFilters=useMemo(()=>({...filters,query:debouncedQuery}),[filters,debouncedQuery]);const libraryVisibleBooks=useMemo(()=>getLibraryVisibleBooks(books,effectiveFilters),[books,effectiveFilters]);
  const authorIndex=useMemo(()=>buildAuthorBrowseIndex(books),[books]);const seriesIndex=useMemo(()=>buildSeriesBrowseIndex(books),[books]);const subjectIndex=useMemo(()=>buildSubjectBrowseIndex(books),[books]);
  const index=browseMode==='authors'?authorIndex:browseMode==='series'?seriesIndex:subjectIndex;const selectedKey=browseSelections[browseMode]||'';const selectedEntry=index.find(entry=>entry.key===selectedKey);const query=String(debouncedQuery||'').trim().toLocaleLowerCase();const visibleIndex=useMemo(()=>filterLibraryBrowseIndex(index,query),[index,query]);const indexGroups=useMemo(()=>groupLibraryBrowseIndex(visibleIndex),[visibleIndex]);
  const matchingGroupBooks=useMemo(()=>selectedEntry?intersectLibraryBrowseCopies(selectedEntry.books,libraryVisibleBooks):[],[selectedEntry,libraryVisibleBooks]);const detailBooks=useMemo(()=>[...matchingGroupBooks].sort((a,b)=>browseMode==='series'?compareSeriesPosition(a,b)||(a.title||'').localeCompare(b.title||'',undefined,{sensitivity:'base',numeric:true}):(a.title||'').localeCompare(b.title||'',undefined,{sensitivity:'base',numeric:true})),[matchingGroupBooks,browseMode]);const visualBooks=useMemo(()=>visualBrowseSubset(libraryVisibleBooks,visualBrowseContext),[libraryVisibleBooks,visualBrowseContext]);
  const setSelectedBrowse=value=>setBrowseSelections(current=>libraryBrowseSelectionState(current,browseMode,value));const changeMode=mode=>{setVisualBrowseContext(current=>visualBrowseContextAfterTab(mode,current));setBrowseMode(mode);};const launchVisualBrowse=entry=>{setVisualBrowseContext(createVisualBrowseContext(browseMode,entry));setVisualActiveCopyId(matchingGroupBooks[0]?.id||'');setBrowseMode('browse');};const returnFromVisualBrowse=()=>{if(!visualBrowseContext)return;setBrowseSelections(current=>libraryBrowseSelectionState(current,visualBrowseContext.sourceMode,visualBrowseContext.sourceKey));setBrowseMode(visualBrowseContext.sourceMode);};const tabs=<LibraryBrowseTabs mode={browseMode} onChange={changeMode}/>;
  if(browseMode==='books')return <BooksLibraryView {...props} visible={libraryVisibleBooks} effectiveFilters={effectiveFilters} debouncedQuery={debouncedQuery} browseTabs={tabs}/>;
  if(browseMode==='bookcases')return <BookcasesLibraryView catalog={props.catalog} books={books} onEdit={onEdit} browseTabs={tabs} onMoveRequest={props.onMoveRequest} onOpenScan={props.onOpenScan}/>;
  if(browseMode==='browse')return <VisualBrowseView books={visualBooks} allBooks={books} filters={filters} setFilters={setFilters} onEdit={onEdit} browseTabs={tabs} onBackBooks={()=>changeMode('books')} activeCopyId={visualActiveCopyId} setActiveCopyId={setVisualActiveCopyId} queryPending={filters.query!==debouncedQuery} browseContext={visualBrowseContext} onReturnContext={returnFromVisualBrowse}/>;
  const labels={authors:'Authors',series:'Series',subjects:'Subjects'},empty={authors:{heading:'No authors to browse yet.',detail:'Authors will appear here as books are added to your library.'},series:{heading:'No series in your library yet.',detail:'Add series information in Book Details to see books here.'},subjects:{heading:'No subjects to browse yet.',detail:'Subjects come from the tags on your books.'}};const missingCount=libraryBrowseMissingCount(books,browseMode);const missingText=missingCount?missingCount+' physical '+(missingCount===1?'copy has':'copies have')+(browseMode==='authors'?' no author information.':browseMode==='series'?' no series information.':' no subjects.'):'';
  return <div className="workspace library-shell"><div className="library-topbar"><div><div className="overline">Library</div><h1 className="title">{labels[browseMode]}</h1></div><div className="small mono">{index.length} {browseMode}</div></div>{tabs}<section className="quiet-library-tools"><div className="library-search-row"><input className="field" aria-label={'Search '+labels[browseMode].toLowerCase()} placeholder={'Search '+labels[browseMode].toLowerCase()+'...'} value={filters.query} onChange={event=>setFilters({...filters,query:event.target.value})}/></div><div className="small" style={{marginTop:10}}>{selectedEntry?'Showing '+detailBooks.length+' matching physical '+(detailBooks.length===1?'copy':'copies'):visibleIndex.length+' '+(visibleIndex.length===1?'group':'groups')}{filters.query!==debouncedQuery?' · filtering...':''}</div></section>{selectedEntry?<><header className="library-browse-detail-head"><div><button className="ghost" onClick={()=>setSelectedBrowse('')}>← All {labels[browseMode].toLowerCase()}</button><h2>{selectedEntry.label}</h2><div className="small">{libraryBrowseCount(selectedEntry)}</div>{detailBooks.length!==selectedEntry.copyCount?<div className="library-browse-matching">Showing {detailBooks.length} matching physical {detailBooks.length===1?'copy':'copies'}</div>:null}</div><button className="btn library-browse-visually" onClick={()=>launchVisualBrowse(selectedEntry)} aria-label={'Browse '+selectedEntry.label+' visually'}>Browse visually</button></header><BrowseCopyList books={detailBooks} allGroupBooks={selectedEntry.books} onEdit={onEdit} mode={browseMode} onClearFilters={()=>setFilters(defaultFilters)}/></>:visibleIndex.length?<><div className="library-browse-sections">{indexGroups.map(group=><section key={group.initial} className="library-browse-section" aria-labelledby={'browse-'+browseMode+'-'+group.initial.replace(/\W/g,'')}><h2 id={'browse-'+browseMode+'-'+group.initial.replace(/\W/g,'')}>{group.initial}</h2><div className="library-browse-index">{group.entries.map(entry=><button key={entry.key} className="library-browse-row" onClick={()=>setSelectedBrowse(entry.key)} aria-label={entry.label+', '+libraryBrowseCount(entry)}><span className="library-browse-row-cover">{entry.representative?.cover?<img loading="lazy" src={entry.representative.cover} alt=""/>:<span className="library-browse-cover-placeholder"><Icon name="book" size={20}/></span>}</span><span className="library-browse-row-copy"><b>{entry.label}</b><span>{libraryBrowseCount(entry)}</span></span><span className="library-browse-chevron" aria-hidden="true">→</span></button>)}</div></section>)}</div>{missingText?<p className="library-browse-missing">{missingText}</p>:null}</>:<div className="clean-empty">{query?<><h2>No matching {labels[browseMode].toLowerCase()}.</h2><p>Try changing or clearing your search.</p></>:<><h2>{empty[browseMode].heading}</h2><p>{empty[browseMode].detail}</p>{missingText?<p>{missingText}</p>:null}</>}</div>}</div>;
}
function BooksLibraryView({books,collections,filters,setFilters,savedViews,setSavedViews,onEdit,onQuickEdit,onExport,onBulkUpdate,onBulkDelete,onBulkRetryMetadata,browseTabs,visible,effectiveFilters,debouncedQuery}){
  const tags=useMemo(()=>uniq(books.flatMap(b=>b.tags||[])).sort(),[books]);const rooms=useMemo(()=>uniq(books.map(b=>normalizeLocation(b.location).room)).sort(),[books]);const bookcases=useMemo(()=>uniq(books.filter(b=>!filters.room||normalizeLocation(b.location).room===filters.room).map(b=>normalizeLocation(b.location).bookcase)).sort(),[books,filters.room]);const physicalShelves=useMemo(()=>uniq(books.filter(b=>(!filters.room||normalizeLocation(b.location).room===filters.room)&&(!filters.bookcase||normalizeLocation(b.location).bookcase===filters.bookcase)).map(b=>normalizeLocation(b.location).shelf)).sort(),[books,filters.room,filters.bookcase]);const boxes=useMemo(()=>uniq(books.filter(b=>(!filters.room||normalizeLocation(b.location).room===filters.room)&&(!filters.bookcase||normalizeLocation(b.location).bookcase===filters.bookcase)&&(!filters.physicalShelf||normalizeLocation(b.location).shelf===filters.physicalShelf)).map(b=>normalizeLocation(b.location).box)).sort(),[books,filters.room,filters.bookcase,filters.physicalShelf]);const [sortMode,setSortMode]=useState('default');const sortedVisible=useMemo(()=>sortLibraryBooks(visible,sortMode),[visible,sortMode]);const [visibleLimit,setVisibleLimit]=useState(200);const [filtersOpen,setFiltersOpen]=useState(false);const [viewsOpen,setViewsOpen]=useState(false);useEffect(()=>setVisibleLimit(200),[effectiveFilters,books.length,sortMode]);const rowsToShow=sortedVisible.slice(0,visibleLimit);const [selected,setSelected]=useState([]);const [bulkStatus,setBulkStatus]=useState('');const [bulkCollection,setBulkCollection]=useState('');const [bulkTag,setBulkTag]=useState('');const [bulkRoom,setBulkRoom]=useState('');const [bulkBookcase,setBulkBookcase]=useState('');const [bulkShelf,setBulkShelf]=useState('');const selectedBooks=visible.filter(b=>selected.includes(b.id));
  function setF(k,v){setFilters({...filters,[k]:v})}function clearFilters(){setFilters(defaultFilters);setSelected([])}function saveView(){const name=prompt('Name this saved view:');if(!name)return;setSavedViews(v=>[...v.filter(x=>x.name!==name),{id:genId(),name,filters:{...filters}}]);setViewsOpen(true)}function delView(id){setSavedViews(v=>v.filter(x=>x.id!==id));}function applyBulk(){if(!selected.length)return;const changes={};if(bulkStatus)changes.status=bulkStatus;if(bulkCollection)changes.addCollection=bulkCollection;if(bulkTag.trim())changes.addTag=bulkTag.trim();if(bulkRoom||bulkBookcase||bulkShelf)changes.location={room:bulkRoom,bookcase:bulkBookcase,shelf:bulkShelf};if(!Object.keys(changes).length)return;onBulkUpdate(selected,changes);setBulkStatus('');setBulkCollection('');setBulkTag('');setBulkRoom('');setBulkBookcase('');setBulkShelf('');}function toggleAll(){const ids=visible.map(b=>b.id);setSelected(selected.length===ids.length?[]:ids)}const activeFilterCount=Object.entries(filters).filter(([k,v])=>Boolean(v)&&k!=='query').length;
  return <div className="workspace library-shell"><div className="library-topbar"><div><div className="overline">Library</div><h1 className="title">Books</h1></div><div className="small mono">{books.length} books</div></div>{browseTabs}<section className="quiet-library-tools"><div className="library-search-row"><input className="field" aria-label="Search library books" placeholder="Search title, author, series, subject, ISBN..." value={filters.query} onChange={e=>setF('query',e.target.value)}/><button className="ghost" onClick={()=>setFiltersOpen(v=>!v)}><Icon name="filter" size={13}/> Filters{activeFilterCount?' · '+activeFilterCount:''}</button><label className="library-sort-control"><span>Sort</span><select className="select" aria-label="Sort Library books" value={sortMode} onChange={e=>setSortMode(e.target.value)}><option value="default">Default order</option><option value="physical-location">Physical location</option></select></label></div><div className="small" style={{marginTop:10}}>{visible.length} result{visible.length===1?'':'s'}{filters.query!==debouncedQuery?' · filtering...':''}</div>{filtersOpen&&<div className="filter-panel" style={{marginTop:12}}><div className="filter-grid-minimal"><select className="select" value={filters.status} onChange={e=>setF('status',e.target.value)}><option value="">Any status</option>{STATUS.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select><select className="select" value={filters.collection} onChange={e=>setF('collection',e.target.value)}><option value="">Any collection</option><option value="__unshelved__">Unshelved</option>{collections.map(c=><option key={c} value={c}>{c}</option>)}</select><select className="select" value={filters.tag} onChange={e=>setF('tag',e.target.value)}><option value="">Any tag</option>{tags.map(t=><option key={t} value={t}>{t}</option>)}</select><select className="select" value={filters.room} onChange={e=>setFilters({...filters,room:e.target.value,bookcase:"",physicalShelf:"",box:""})}><option value="">Any room</option>{rooms.map(r=><option key={r} value={r}>{r}</option>)}</select><select className="select" value={filters.bookcase||""} onChange={e=>setFilters({...filters,bookcase:e.target.value,physicalShelf:"",box:""})}><option value="">Any bookcase</option>{bookcases.map(value=><option key={value} value={value}>{value}</option>)}</select><select className="select" value={filters.physicalShelf||""} onChange={e=>setFilters({...filters,physicalShelf:e.target.value,box:""})}><option value="">Any physical shelf</option>{physicalShelves.map(value=><option key={value} value={value}>{value}</option>)}</select><select className="select" value={filters.box||""} onChange={e=>setF("box",e.target.value)}><option value="">Any box</option>{boxes.map(value=><option key={value} value={value}>{value}</option>)}</select><select className="select" value={filters.review} onChange={e=>setF('review',e.target.value)}><option value="">Any review state</option><option value="needs">Needs review</option><option value="reviewed">Reviewed</option></select><select className="select" value={filters.missing} onChange={e=>setF('missing',e.target.value)}><option value="">Any completeness</option><option value="cover">Missing cover</option><option value="author">Missing author</option><option value="location">Missing location</option><option value="duplicates">Possible duplicates</option></select><select className="select" value={filters.lent} onChange={e=>setF('lent',e.target.value)}><option value="">Any loan state</option><option value="out">Currently lent out</option><option value="overdue">Overdue</option><option value="returned">Returned before</option><option value="notlent">Never lent / not lent</option></select><select className="select" value={filters.minRating} onChange={e=>setF('minRating',e.target.value)}><option value="">Any rating</option><option value="0">Unrated</option><option value="1">★ 1+</option><option value="2">★ 2+</option><option value="3">★ 3+</option><option value="4">★ 4+</option><option value="5">★ 5</option></select></div><div className="row-actions"><button className="ghost" onClick={clearFilters}>Clear filters</button><button className="ghost" onClick={()=>setViewsOpen(v=>!v)}>Views</button></div>{viewsOpen&&<div className="library-view-chips"><button className="ghost" onClick={saveView}>Save current view</button>{BUILTIN_VIEWS.map(v=><button key={v.name} className="chip" onClick={()=>setFilters({...defaultFilters,...v.filters})}>{v.name}</button>)}{savedViews.map(v=><span key={v.id} className="chip"><button style={{all:'unset',cursor:'pointer'}} onClick={()=>setFilters({...defaultFilters,...v.filters})}>{v.name}</button><button style={{all:'unset',cursor:'pointer'}} onClick={()=>delView(v.id)}>×</button></span>)}</div>}</div>}</section>{selected.length>0&&<div className="filter-panel" style={{marginTop:12}}><b>{selected.length} selected</b><div className="filter-grid-minimal"><select className="select" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}><option value="">Status: no change</option>{STATUS.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select><select className="select" value={bulkCollection} onChange={e=>setBulkCollection(e.target.value)}><option value="">Collection: no change</option>{collections.map(c=><option key={c} value={c}>{c}</option>)}</select><input className="field" value={bulkTag} onChange={e=>setBulkTag(e.target.value)} placeholder="Add tag"/><input className="field" value={bulkRoom} onChange={e=>setBulkRoom(e.target.value)} placeholder="Room"/><input className="field" value={bulkBookcase} onChange={e=>setBulkBookcase(e.target.value)} placeholder="Bookcase"/><input className="field" value={bulkShelf} onChange={e=>setBulkShelf(e.target.value)} placeholder="Shelf"/></div><div className="row-actions"><button className="btn" onClick={applyBulk}>Apply</button><button className="ghost" onClick={()=>onBulkUpdate(selected,{reviewed:true})}>Mark reviewed</button><button className="ghost" onClick={()=>onBulkRetryMetadata(selected)}>Retry metadata</button><button className="ghost" onClick={()=>onExport(selectedBooks,'selected')}>Export</button><button className="ghost danger" onClick={()=>onBulkDelete(selected)}>Delete</button><button className="ghost" onClick={()=>setSelected([])}>Clear</button></div></div>}<BookTable books={rowsToShow} selected={selected} setSelected={setSelected} onEdit={onEdit} onQuickEdit={onQuickEdit} onToggleAll={toggleAll} emptyState={!books.length?<div className="clean-empty"><h2>Your library is empty</h2><p>Add or scan a book to start building your library.</p></div>:<div className="clean-empty"><h2>No matching books</h2><p>Try another title, author, series, subject, or clear a filter.</p><button className="ghost" onClick={clearFilters}>Clear filters</button></div>}/>{sortedVisible.length>rowsToShow.length&&<div className="load-more-row"><button className="ghost" onClick={()=>setVisibleLimit(n=>n+200)}>Load more</button></div>}</div>;
}

function BookTable({books,selected,setSelected,onEdit,onQuickEdit,onToggleAll,emptyState}){
  const allChecked=books.length>0&&books.every(b=>selected.includes(b.id));const toggle=id=>setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  return <div className="clean-list" role="list" aria-label="Library books"><div className="library-select-line"><input type="checkbox" checked={allChecked} onChange={onToggleAll} aria-label="Select all visible books"/><span className="small">Select</span></div>{books.length?books.map(b=><div key={b.id} className="clean-row" role="listitem"><input type="checkbox" aria-label={'Select '+b.title} checked={selected.includes(b.id)} onChange={()=>toggle(b.id)} onClick={e=>e.stopPropagation()}/><div className="cover-mini">{b.cover?<img loading="lazy" src={b.cover} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:3}}/>:<Icon name="book" size={18}/>}<ReadBadge book={b}/></div><button className="clean-row-main" onClick={()=>onEdit(b)}><b className="truncate">{b.title}</b><span className="truncate">{b.authors||'Unknown author'}</span><PhysicalLocation location={b.location} compact/></button><div className="clean-row-meta"><span className="chip gray">{statusLabel(b.status)}</span></div><details className="row-menu"><summary aria-label={'More actions for '+b.title}>•••</summary><div className="row-menu-pop"><button onClick={()=>onEdit(b)}>Open details</button><button onClick={()=>onQuickEdit?.(b)}>Quick edit</button></div></details></div>):emptyState||<div className="clean-empty">No books found.</div>}</div>;
}


function NeedsReviewView({books,onEdit,onMarkReviewed,onRetryMetadata,onPreviewMetadata,onGoDuplicates}){const items=books.filter(b=>needsReview(b,books));const dupCount=duplicateGroups(books).reduce((n,g)=>n+g.items.length,0);return <div className="workspace"><div className="overline">Needs Review</div><h1 className="title">Cleanup inbox</h1><p className="subtitle">Records appear here when metadata, cover, location, ISBN, or duplicate checks need attention. Retry metadata from ISBNs without leaving the inbox.</p><div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}><button className="ghost" onClick={onGoDuplicates}>Open duplicate review {dupCount?`(${dupCount})`:''}</button><button className="ghost" onClick={()=>items.length&&onMarkReviewed(items.map(b=>b.id))}>Mark all visible reviewed</button><button className="ghost" onClick={()=>items.length&&onRetryMetadata(items.map(b=>b.id))}>Retry metadata for visible</button></div><div className="panel" style={{marginTop:14,overflow:'hidden'}}>{items.length?items.map(b=><div key={b.id} className="tr" style={{gridTemplateColumns:'minmax(180px,2fr) minmax(180px,1.4fr) repeat(3,max-content)',display:'grid'}}><button style={{all:'unset',cursor:'pointer',textAlign:'left'}} onClick={()=>onEdit(b)}><b>{b.title}</b><div className="small">{b.authors||'Unknown author'} · {b.isbn||'No ISBN'}</div></button><div style={{display:'flex',flexWrap:'wrap',gap:5}}>{reviewReasons(b,books).map(r=><span key={r} className="chip warn">{r}</span>)}</div><button className="ghost" onClick={()=>onPreviewMetadata(b.id)}>Preview metadata</button><button className="ghost" onClick={()=>onRetryMetadata([b.id])}>Fill missing</button><button className="ghost" onClick={()=>onMarkReviewed([b.id])}>Mark reviewed</button></div>):<div className="empty">All clear. No books currently need review.</div>}</div></div>}

function FieldMergeModal({group,onClose,onApply}){
  const items=group.items||[];
  const primary=items[0];
  const [draft,setDraft]=useState(()=>mergeBookRecords(primary,items.slice(1)));
  const pick=(field,value)=>setDraft(p=>normalizeBook({...p,[field]:value}));
  const pickLocation=b=>setDraft(p=>normalizeBook({...p,location:normalizeLocation(b.location)}));
  const pickCollections=b=>setDraft(p=>setBookCollections(p,uniq([...collectionNames(p),...collectionNames(b)])));
  const pickTags=b=>setDraft(p=>normalizeBook({...p,tags:uniq([...(p.tags||[]),...(b.tags||[])])}));
  const fields=[['title','Title'],['authors','Author(s)'],['isbn','ISBN'],['year','Year'],['publisher','Publisher'],['pages','Pages'],['edition','Edition'],['format','Format'],['language','Language'],['condition','Condition'],['cover','Cover URL'],['notes','Notes'],['privateReview','Private review'],['copyNotes','Copy notes']];
  const removeIds=items.filter(b=>b.id!==draft.id).map(b=>b.id);
  return <div className="modal-back" onClick={onClose}>
    <div className="modal" style={{maxWidth:980}} onClick={e=>e.stopPropagation()}>
      <div className="modal-head">
        <div><div className="overline">Field-by-field merge</div><h2 style={{fontFamily:'Fraunces,serif',margin:'2px 0 0'}}>Choose the best values</h2></div>
        <button className="ghost" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>
      <div className="modal-body">
        <p className="subtitle" style={{marginTop:0}}>Pick the best values before merging. Collections and tags can be accumulated from multiple records.</p>
        <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:14}}>
          <div>
            <div className="label">Preview</div>
            <div className="cover" style={{width:120,height:180,marginBottom:10}}>{draft.cover?<img loading="lazy" src={draft.cover}/>:<Icon name="book" size={32}/>}</div>
            <b>{draft.title}</b>
            <div className="small">{draft.authors||'Unknown author'}</div>
            <div className="small">Quality: {metadataScore(draft,items)}% · {qualityLabel(metadataScore(draft,items))}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
              {collectionNames(draft).map(c=><span key={c} className="chip gray">{c}</span>)}
              {(draft.tags||[]).map(t=><span key={t} className="chip">{t}</span>)}
            </div>
          </div>
          <div style={{display:'grid',gap:10}}>
            {fields.map(([field,label])=>{
              const options=mergeValueOptions(items,field);
              return <div key={field} style={{borderBottom:'1px solid var(--line)',paddingBottom:8}}>
                <div className="label">{label}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {options.length?options.map(v=><button key={String(v)} className={String(draft[field]||'')===String(v)?'chip good':'chip'} onClick={()=>pick(field,v)}>{String(v).slice(0,110)}</button>):<span className="small">No value</span>}
                </div>
              </div>
            })}
            <div style={{borderBottom:'1px solid var(--line)',paddingBottom:8}}>
              <div className="label">Location</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{items.map(b=><button key={b.id} className="chip" onClick={()=>pickLocation(b)}>{locationText(b)||'No location'} · {(b.title||'').slice(0,24)}</button>)}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div><div className="label">Accumulate collections</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{items.map(b=><button key={b.id} className="chip" onClick={()=>pickCollections(b)}>{collectionNames(b).join(', ')||'Unshelved'}</button>)}</div></div>
              <div><div className="label">Accumulate tags</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{items.map(b=><button key={b.id} className="chip" onClick={()=>pickTags(b)}>{(b.tags||[]).join(', ')||'No tags'}</button>)}</div></div>
            </div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:16}}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={()=>onApply(normalizeBook({...draft,reviewed:false,updatedAt:new Date().toISOString()}),removeIds)}>Merge using selected values</button>
        </div>
      </div>
    </div>
  </div>;
}

function DuplicateReviewView({books,onEdit,onMergeGroup,onMergeCustom,onDeleteIds}){
  const possible=useMemo(()=>possibleDuplicateGroups(books),[books]);
  const multiple=useMemo(()=>multipleCopyGroups(books),[books]);
  const [compare,setCompare]=useState(null);
  const copyDetail=book=>[locationText(book)||'No location',collectionNames(book).join(', ')||'Unshelved',book.condition||'Condition not recorded',statusLabel(book.status),isLentOut(book)?('Lent to '+(book.lentTo||'someone')):'Not lent',[book.acquisitionDate,book.acquisitionSource].filter(Boolean).join(' · ')||'Acquisition not recorded'];
  return <div className="workspace identity-review">
    <div className="overline">Catalog checks</div>
    <h1 className="title">Copies and possible duplicates</h1>
    <p className="subtitle">Review genuine identity inconsistencies separately from editions where you simply own more than one physical copy.</p>
    <section className="identity-section">
      <div className="identity-section-head"><div><h2>Possible duplicates</h2><p>Records that may accidentally describe the same physical copy.</p></div><span className="chip warn">{possible.length} group{possible.length===1?'':'s'}</span></div>
      {possible.length?<div className="identity-group-list">{possible.map(group=><div key={group.key} className="panel panel-pad">
        <div className="identity-group-head"><div><b>{group.label}</b><div className="small">{group.reason}</div><div className="small">{group.items.length} records · {group.items[0].title||'Untitled book'}</div></div><div className="row-actions"><button className="ghost" onClick={()=>setCompare(group)}>Compare fields</button><button className="btn" onClick={()=>onMergeGroup(group.items[0].id,group.items.slice(1).map(book=>book.id))}>Merge into newest</button></div></div>
        <div className="identity-record-list">{group.items.map((book,index)=><div key={book.id} className="identity-record-row"><button className="identity-book-button" onClick={()=>onEdit(book)}><b>{index===0?'Primary: ':''}{book.title||'Untitled book'}</b><span>{book.authors||'Unknown author'} · {book.isbn||'No ISBN'} · {locationText(book)||'No location'}</span></button><span className={metadataScore(book,books)>=70?'chip good':metadataScore(book,books)>=50?'chip warn':'chip bad'}>{metadataScore(book,books)}%</span><button className="ghost" onClick={()=>onMergeGroup(book.id,group.items.filter(item=>item.id!==book.id).map(item=>item.id))}>Use as primary</button>{index>0?<button className="ghost danger" onClick={()=>onDeleteIds([book.id])}>Remove</button>:<span/>}</div>)}</div>
      </div>)}</div>:<div className="clean-empty"><h2>No possible duplicates found.</h2><p>Your catalog has no duplicate records that need review.</p></div>}
    </section>
    <section className="identity-section multiple-copy-section">
      <div className="identity-section-head"><div><h2>Multiple copies</h2><p>Editions where you own more than one physical copy.</p></div><span className="chip good">{multiple.length} group{multiple.length===1?'':'s'}</span></div>
      {multiple.length?<div className="identity-group-list">{multiple.map(group=>{const first=group.items[0];return <div key={group.key} className="panel panel-pad multiple-copy-group"><div className="multiple-copy-head"><div className="cover-mini">{first.cover?<img loading="lazy" src={first.cover} alt=""/>:<Icon name="book" size={18}/>}</div><div><b>{first.title||'Untitled book'}</b><div className="small">{first.authors||'Unknown author'} · {first.isbn||first.edition||'Edition details not recorded'}</div><div className="small">{group.items.length} physical Copies · {group.reason}</div></div></div><div className="identity-record-list">{group.items.map(book=><div key={book.id} className="multiple-copy-row"><button className="identity-book-button" onClick={()=>onEdit(book)}><b>Copy {book.copyId||book.id}</b><span>{copyDetail(book).join(' · ')}</span></button><button className="ghost" onClick={()=>onEdit(book)}>Open copy</button></div>)}</div></div>})}</div>:<div className="clean-empty"><h2>No editions with multiple physical copies.</h2></div>}
    </section>
    {compare&&<FieldMergeModal group={compare} onClose={()=>setCompare(null)} onApply={(merged,removeIds)=>{onMergeCustom(merged,removeIds);setCompare(null)}}/>}
  </div>;
}
function QualityView({books,onEdit,onRetryMetadata,onPreviewMetadata,onFillCovers,onMarkReviewed,onOpenDuplicates}){
  const rows=useMemo(()=>books.map(b=>({book:b,score:metadataScore(b,books),problems:qualityProblems(b,books)})).sort((a,b)=>a.score-b.score||a.book.title.localeCompare(b.book.title)),[books]);
  const poor=rows.filter(r=>r.score<50);
  const fair=rows.filter(r=>r.score>=50&&r.score<70);
  const missingCover=rows.filter(r=>!r.book.cover);
  const canEnrich=rows.filter(r=>(r.book.isbn&&isValidISBN(r.book.isbn))||r.book.title||r.book.authors);
  const works=workGroups(books).filter(g=>g.isbnCount>1||g.editionCount>1).slice(0,12);
  const avg=books.length?Math.round(rows.reduce((n,r)=>n+r.score,0)/books.length):100;
  return <div className="workspace">
    <div className="overline">Phase 6 · Quality</div>
    <h1 className="title">Metadata intelligence</h1>
    <p className="subtitle">Prioritize cleanup, enrich records, fill cover placeholders, and spot possible work or edition groups.</p>
    <div className="grid3" style={{marginTop:14}}>{[['Average quality',avg+'%'],['Poor records',poor.length],['Fair records',fair.length],['Missing covers',missingCover.length],['Enrichable records',canEnrich.length],['Work groups',works.length]].map(([l,v])=><div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
    <div className="panel panel-pad" style={{marginTop:14}}>
      <h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Smart cleanup actions</h2>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="ghost" onClick={()=>onRetryMetadata(rows.filter(r=>r.score<70).slice(0,40).map(r=>r.book.id))}>Enrich low-quality records</button><button className="ghost" onClick={()=>onRetryMetadata(canEnrich.slice(0,40).map(r=>r.book.id))}>Retry metadata for first 40 enrichable</button><button className="ghost" onClick={()=>onFillCovers(missingCover.map(r=>r.book.id))}>Fill ISBN cover URLs</button><button className="ghost" onClick={()=>onMarkReviewed(rows.filter(r=>r.score>=85&&!r.problems.length).map(r=>r.book.id))}>Mark high-quality records reviewed</button><button className="ghost" onClick={onOpenDuplicates}>Open duplicate review</button></div>
      <p className="small">Metadata retry uses ISBN first and then title + author search when ISBN is missing.</p>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(320px,1.25fr) minmax(280px,.75fr)',gap:14,marginTop:14}}>
      <section className="panel" style={{overflow:'hidden'}}>
        <div className="th" style={{gridTemplateColumns:'90px 2fr 1.2fr 1.8fr auto'}}><div>Quality</div><div>Title</div><div>Author</div><div>Problems</div><div>Action</div></div>
        {rows.slice(0,60).map(({book,score,problems})=><div key={book.id} className="tr" style={{gridTemplateColumns:'90px 2fr 1.2fr 1.8fr auto',display:'grid'}}><div><span className={score>=70?'chip good':score>=50?'chip warn':'chip bad'}>{score}%</span></div><button style={{all:'unset',cursor:'pointer',textAlign:'left'}} onClick={()=>onEdit(book)}><b>{book.title}</b><div className="small">{book.isbn||'No ISBN'} · {qualityLabel(score)}</div></button><div className="truncate">{book.authors||'Unknown'}</div><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{problems.slice(0,4).map(p=><span key={p} className="chip warn">{p}</span>)}</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="ghost" onClick={()=>onPreviewMetadata(book.id)}>Preview</button><button className="ghost" onClick={()=>onRetryMetadata([book.id])}>Fill missing</button></div></div>)}
      </section>
      <section className="panel panel-pad"><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Possible work / edition groups</h2><p className="small">These are not necessarily duplicates. They may be different editions or copies of the same work.</p>{works.length?works.map(g=><div key={g.key} style={{borderTop:'1px solid var(--line)',padding:'9px 0'}}><b>{g.label}</b><div className="small">{g.items.length} records · {g.isbnCount||'no'} ISBNs · {g.editionCount||'no'} edition markers</div><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:5}}>{g.items.slice(0,5).map(b=><button key={b.id} className="chip" onClick={()=>onEdit(b)}>{b.year||'no year'} · {b.format||'format?'}</button>)}</div></div>):<div className="small">No likely work groups found yet.</div>}</section>
    </div>
  </div>;
}

function BookcaseView({books,collections,activeCollection,search,onEdit,onDropBook,dragging,setDragging,onAddCollection,setActiveCollection,onRemoveFromCollection,onRenameCollection,onDeleteCollection,onOpenSettings}){
  const [newShelf,setNewShelf]=useState('');const [showCreate,setShowCreate]=useState(false);const [mode,setMode]=useState('move');const [sortByShelf,setSortByShelf]=useState({});const [dropTarget,setDropTarget]=useState('');const [justDropped,setJustDropped]=useState('');const dropTimerRef=useRef(null);const q=String(search||'').toLowerCase();const safeBooks=(books||[]).filter(b=>b&&typeof b==='object');const displayBooks=safeBooks.filter(b=>matches(b,q,safeBooks));const needsIdentificationBooks=displayBooks.filter(needsIdentification);const unshelvedBooks=displayBooks.filter(book=>isUnshelved(book)&&!needsIdentification(book));const isSystemView=activeCollection==='__unshelved__'||activeCollection==='__needs_identification__';const isRealShelf=Boolean(activeCollection)&&!isSystemView;const selected=activeCollection==='__unshelved__'?'Unshelved':activeCollection==='__needs_identification__'?'Needs identification':activeCollection;const quickSorting=activeCollection==='__unshelved__';const sortMode=isRealShelf?(sortByShelf[activeCollection]||'custom'):'custom';
  useEffect(()=>()=>{if(dropTimerRef.current)clearTimeout(dropTimerRef.current);},[]);
  const createShelf=()=>{const v=newShelf.trim();if(!v)return;onAddCollection?.(v);setActiveCollection?.(v);setNewShelf('');setShowCreate(false);};
  const renameActive=()=>{if(!isRealShelf)return;const next=window.prompt('Rename collection',activeCollection);if(next&&next.trim()&&next.trim()!==activeCollection){onRenameCollection?.(activeCollection,next.trim());setActiveCollection?.(next.trim());}};
  const deleteActive=()=>{if(!isRealShelf)return;onDeleteCollection?.(activeCollection);};
  const sortShelfBooks=items=>{if(sortMode==='custom')return items;const rows=items.slice();const byTitle=(a,b)=>normalizedTitle(a.title).localeCompare(normalizedTitle(b.title));const byAuthor=(a,b)=>normalizedTitle(a.authors).localeCompare(normalizedTitle(b.authors))||byTitle(a,b);if(sortMode==='title-az')return rows.sort(byTitle);if(sortMode==='title-za')return rows.sort((a,b)=>byTitle(b,a));if(sortMode==='author-az')return rows.sort(byAuthor);if(sortMode==='author-za')return rows.sort((a,b)=>byAuthor(b,a));if(sortMode==='recent')return rows.sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));if(sortMode==='oldest')return rows.sort((a,b)=>(a.addedAt||'').localeCompare(b.addedAt||''));return rows;};
  const dropOnShelf=(event,name)=>{if(!quickSorting||!dragging)return;event.preventDefault();const id=event.dataTransfer.getData('bookId')||dragging;if(!id)return;const result=onDropBook?.(id,name,'add',{brief:true});setDropTarget('');if(result&&!result.error){setJustDropped(name);if(dropTimerRef.current)clearTimeout(dropTimerRef.current);dropTimerRef.current=setTimeout(()=>setJustDropped(''),900);}};
  const selectedBooks=activeCollection==='__unshelved__'?unshelvedBooks:activeCollection==='__needs_identification__'?needsIdentificationBooks:activeCollection?displayBooks.filter(b=>inCollection(b,activeCollection)):[];const renderedSelectedBooks=sortShelfBooks(selectedBooks);const visibleShelves=activeCollection?[]:collections;
  return <div className={'workspace balanced-shelves '+(quickSorting?'quick-sort-unshelved':'')}><div className="overline">Shelves</div><div className="balanced-shelf-head"><div><h1 className="title">{selected||'Bookcase'}</h1><div className="small">{activeCollection?selectedBooks.length+' book'+(selectedBooks.length===1?'':'s'):collections.length+' collection'+(collections.length===1?'':'s')}</div></div><div className="balanced-shelf-head-actions">{isRealShelf&&<label className="shelf-sort-control"><span>Sort</span><select className="select" value={sortMode} onChange={event=>setSortByShelf(current=>({...current,[activeCollection]:event.target.value}))}><option value="custom">Custom</option><option value="title-az">Title A–Z</option><option value="title-za">Title Z–A</option><option value="author-az">Author A–Z</option><option value="author-za">Author Z–A</option><option value="recent">Recently added</option><option value="oldest">Oldest added</option></select></label>}<details className="balanced-shelf-more"><summary aria-label="Collection organization">•••</summary><div className="balanced-shelf-menu"><div className="mode-toggle"><button className={mode==='move'?'active':''} onClick={()=>setMode('move')}>Move</button><button className={mode==='add'?'active':''} onClick={()=>setMode('add')}>Add to collection</button></div>{isRealShelf&&<><button className="ghost" onClick={renameActive}>Rename collection</button><button className="ghost danger" onClick={deleteActive}>Delete collection</button></>}<button className="ghost" onClick={()=>onOpenSettings?.()}>Settings</button></div></details></div></div><div className={'balanced-shelf-selector '+(quickSorting?'quick-shelf-bar ':'')+(quickSorting&&dragging?'is-dragging':'')} role="tablist" aria-label="Choose collection"><button className={!activeCollection?'active':''} onClick={()=>setActiveCollection?.('')} role="tab" aria-selected={!activeCollection}>All</button>{unshelvedBooks.length>0&&<button className={activeCollection==='__unshelved__'?'active':''} onClick={()=>setActiveCollection?.('__unshelved__')} role="tab" aria-selected={activeCollection==='__unshelved__'}>Unshelved <b>{unshelvedBooks.length}</b></button>}{needsIdentificationBooks.length>0&&<button className={activeCollection==='__needs_identification__'?'active':''} onClick={()=>setActiveCollection?.('__needs_identification__')} role="tab" aria-selected={activeCollection==='__needs_identification__'}>Needs identification <b>{needsIdentificationBooks.length}</b></button>}{collections.map(c=><button key={c} className={(activeCollection===c?'active ':'')+(quickSorting&&dragging?'valid-drop ':'')+(dropTarget===c?'drop-over ':'')+(justDropped===c?'drop-done':'')} onClick={()=>setActiveCollection?.(c)} onDragOver={event=>{if(quickSorting&&dragging){event.preventDefault();event.dataTransfer.dropEffect='copy';setDropTarget(c);}}} onDragLeave={()=>{if(dropTarget===c)setDropTarget('')}} onDrop={event=>dropOnShelf(event,c)} role="tab" aria-selected={activeCollection===c}>{dropTarget===c?'Drop into collection '+c:c} <b>{displayBooks.filter(book=>inCollection(book,c)).length}</b></button>)}<button className="balanced-shelf-add" onClick={()=>setShowCreate(v=>!v)} aria-label="Create collection" title="Create collection"><Icon name="plus" size={15}/></button></div>{showCreate&&<div className="balanced-new-shelf"><input className="field" value={newShelf} onChange={e=>setNewShelf(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();createShelf()}}} placeholder="Collection name" autoFocus/><button className="btn" onClick={createShelf}>Create collection</button></div>}{activeCollection==='__needs_identification__'?<ShelfSection system name="Needs identification" books={selectedBooks} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} onRemoveFromCollection={onRemoveFromCollection}/>:activeCollection==='__unshelved__'?<ShelfSection name="Unshelved" books={unshelvedBooks} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} unshelved onRemoveFromCollection={onRemoveFromCollection}/>:<><div className="balanced-shelf-sections">{activeCollection?<div className="shelf-sort-panes"><div className="shelf-source-pane">{unshelvedBooks.length>0&&<ShelfSection name="Unshelved" books={unshelvedBooks} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} unshelved onRemoveFromCollection={onRemoveFromCollection}/>}</div><div className="shelf-destination-pane"><ShelfSection name={selected} books={renderedSelectedBooks} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} onRemoveFromCollection={onRemoveFromCollection}/></div></div>:<><>{unshelvedBooks.length>0&&<UnshelvedTray books={unshelvedBooks} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} setActiveCollection={setActiveCollection}/>}</>{visibleShelves.length?visibleShelves.map(name=><ShelfSection key={name} name={name} books={displayBooks.filter(book=>inCollection(book,name))} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} onRemoveFromCollection={onRemoveFromCollection}/>):<div className="empty"><h2>No collections yet.</h2><p>Create a collection to group books in a way that is useful to you.</p></div>}</>}</div></>}</div>;
}

function UnshelvedTray({books,collections,onEdit,onDropBook,setDragging,mode,setActiveCollection}){
  const [open,setOpen]=useState(false);
  return <aside className={'unshelved-tray balanced-unshelved-tray '+(open?'open':'')} aria-label="Unshelved books tray"><button className="balanced-unshelved-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><span>{books.length+' unshelved book'+(books.length===1?'':'s')}</span><span aria-hidden="true">{open?'▴':'▾'}</span></button>{open&&<div className="balanced-unshelved-content"><div className="unshelved-tray-head"><div><div className="overline">Intake pile</div><h2 style={{fontFamily:'Fraunces,serif',margin:'2px 0 0'}}>Unshelved</h2></div><button className="ghost" onClick={()=>setActiveCollection?.('__unshelved__')}>Open full view</button></div><div className="unshelved-tray-list">{books.map(b=><BookcaseBookCard key={b.id} book={b} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} unshelved compact />)}</div></div>}</aside>;
}
function BookcaseBookCard({book,collections,onEdit,onDropBook,setDragging,unshelved,name,mode='move',onRemoveFromCollection,compact=false}){
  const c=collectionNames(book);const count=c.length;const pickerLabel=mode==='add'?'Add to collection...':'Move to collection...';const pickerTargets=mode==='add'?collections.filter(x=>!inCollection(book,x)):collections;const usePicker=e=>{const target=e.target.value;if(target)onDropBook?.(book.id,target,mode);e.target.value='';};
  return <div className={'book-card '+(compact?'tray-book':'')} tabIndex="0" role="button" aria-label={'Open '+(book.title||'book')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onEdit(book)}}} draggable onDragStart={e=>{e.dataTransfer.setData('bookId',book.id);e.dataTransfer.effectAllowed='copyMove';setDragging(book.id)}} onDragEnd={()=>setDragging(null)} title="Drag to another collection, or press Enter to edit"><div className="cover" onClick={()=>onEdit(book)}>{count>1&&<div className="multi-badge">{count}</div>}<ReadBadge book={book} offset={count>1}/>{book.cover?<img loading="lazy" src={book.cover} alt={book.title||'Book cover'}/>:<Icon name="book" size={28}/>}</div><div className="book-title truncate">{book.title}</div><div className="small truncate">{book.authors||'Unknown'}</div>{count>1&&<div className="small truncate" title={c.join(', ')}>{c.join(', ')}</div>}<details className="book-card-menu" onClick={e=>e.stopPropagation()}><summary aria-label={'Collection actions for '+(book.title||'book')}>•••</summary><div className="book-card-menu-panel">{!unshelved&&name&&inCollection(book,name)&&<button className="mini-action" onClick={e=>{e.stopPropagation();onRemoveFromCollection?.(book.id,name)}}>Remove from collection</button>}{pickerTargets.length>0&&<select className="shelf-picker" aria-label={(mode==='add'?'Add ':'Move ')+(book.title||'book')+' to collection'} defaultValue="" onChange={usePicker}><option value="">{pickerLabel}</option>{pickerTargets.map(s=><option key={s} value={s}>{s}</option>)}</select>}</div></details></div>;
}
function ShelfSection({name,books,collections,onEdit,onDropBook,setDragging,unshelved,mode='move',onRemoveFromCollection,system=false}){
  const [over,setOver]=useState(false);
  const dropName=unshelved?'':name;
  const actionText=mode==='add'&&dropName?'add to another collection':'move book';
  return <section className="shelf-section" onDragOver={system?undefined:e=>{e.preventDefault();setOver(true)}} onDragLeave={system?undefined:e=>{if(!e.currentTarget.contains(e.relatedTarget))setOver(false)}} onDrop={system?undefined:e=>{e.preventDefault();const id=e.dataTransfer.getData('bookId');if(id)onDropBook(id,dropName,mode);setOver(false)}} style={{outline:over?'2px dashed var(--blue)':'none',outlineOffset:over?'-4px':'0',borderRadius:10}}>
    <div className="shelf-head"><h2>{name}</h2><div className="rule"/><span className="small mono">{books.length} volumes</span>{over&&<span className="chip good">Drop to {actionText}</span>}</div>
    {books.length?<div className="book-grid">{books.map(b=><BookcaseBookCard key={b.id} book={b} collections={collections} onEdit={onEdit} onDropBook={onDropBook} setDragging={setDragging} mode={mode} unshelved={unshelved} name={name} onRemoveFromCollection={onRemoveFromCollection}/>)}</div>:<div className="empty" style={{padding:28,border:'1px dashed var(--line)',borderRadius:8}}>{over?`Drop here to ${actionText}`:'This collection is empty. Add books from Library or Organize.'}</div>}
    <div className="shelf-plank"/>
  </section>;
}

function EasyScanComplete({copyIds,onSort,onDone}){
  const count=(copyIds||[]).length;
  return <div className="workspace easy-complete"><div className="overline">Easy Scan</div><h1 className="title">{count+' book'+(count===1?'':'s')+' added'}</h1><p className="subtitle">Ready to put this group on shelves?</p><div className="row-actions"><button className="btn" onClick={()=>onSort?.(copyIds)}>Sort these books</button><button className="ghost" onClick={onDone}>Do it later</button></div></div>;
}

function SortDesk({books,collections,initialIds,onAssign,onRestore,onAddCollection,onDone}){
  const queueFromIds=ids=>uniq(ids||[]).filter(id=>{const book=books.find(item=>item.id===id);return book&&isUnshelved(book)&&!needsIdentification(book);});
  const [queue,setQueue]=useState(()=>queueFromIds(initialIds));const [total,setTotal]=useState(()=>queueFromIds(initialIds).length);const [undo,setUndo]=useState(null);const [sorted,setSorted]=useState([]);const [leftCount,setLeftCount]=useState(0);const [usage,setUsage]=useState([]);const [newShelf,setNewShelf]=useState('');const [dragging,setDragging]=useState(false);const [over,setOver]=useState('');const [feedback,setFeedback]=useState('');const feedbackRef=useRef(null);
  useEffect(()=>{const next=queueFromIds(initialIds);setQueue(next);setTotal(next.length);setUndo(null);setSorted([]);setLeftCount(0);setUsage([]);},[initialIds]);
  useEffect(()=>()=>{if(feedbackRef.current)clearTimeout(feedbackRef.current);},[]);
  useEffect(()=>setQueue(current=>current.filter(id=>{const book=books.find(item=>item.id===id);return book&&isUnshelved(book)&&!needsIdentification(book);})),[books]);
  const current=books.find(book=>book.id===queue[0]);
  const showFeedback=label=>{setFeedback(label);if(feedbackRef.current)clearTimeout(feedbackRef.current);feedbackRef.current=setTimeout(()=>setFeedback(''),900);};
  const useShelf=name=>{if(!current||!name)return;const result=onAssign?.(current.id,name);if(!result||result.error)return;setUndo({id:current.id,previous:result.previous,target:name});setQueue(items=>items.slice(1));setSorted(items=>[{id:current.id,title:current.title,cover:current.cover,shelf:name},...items].slice(0,3));setUsage(items=>{const prior=items.find(item=>item.name===name);const next={name,count:(prior?.count||0)+1,last:Date.now()};return [next,...items.filter(item=>item.name!==name)];});showFeedback(name+' ✓');};
  const skip=()=>{if(!current)return;if(queue.length===1){showFeedback('Choose a collection or leave it unshelved.');return;}setQueue(items=>[...items.slice(1),items[0]]);};
  const leave=()=>{if(!current)return;setQueue(items=>items.slice(1));setLeftCount(count=>count+1);setUndo(null);showFeedback('Left unshelved');};
  const undoLast=()=>{if(!undo)return;onRestore?.(undo.id,undo.previous);setQueue(items=>[undo.id,...items.filter(id=>id!==undo.id)]);setSorted(items=>items.filter(item=>item.id!==undo.id));setUndo(null);showFeedback('Restored');};
  const createShelf=()=>{const name=newShelf.trim();if(!name)return;onAddCollection?.(name);setNewShelf('');showFeedback(name+' ready');};
  const recent=usage.slice().sort((a,b)=>b.last-a.last||b.count-a.count).slice(0,3);
  const shelfCard=name=>{const shelfBooks=books.filter(book=>inCollection(book,name)).slice(0,3);return <button key={name} className={'sort-shelf-card '+(over===name?'drop-over':'')} onClick={()=>useShelf(name)} onDragOver={event=>{event.preventDefault();setOver(name)}} onDragLeave={()=>setOver('')} onDrop={event=>{event.preventDefault();setOver('');setDragging(false);useShelf(name)}}><span><b>{name}</b><small>{books.filter(book=>inCollection(book,name)).length+' books'}</small></span><span className="sort-shelf-covers">{shelfBooks.map(book=>book.cover?<img key={book.id} src={book.cover} alt=""/>:<i key={book.id}><Icon name="book" size={12}/></i>)}</span></button>;};
  if(!current)return <div className="workspace sort-desk sort-complete"><div className="overline">Sort Desk</div><h1 className="title">{total?'All sorted ✓':'Nothing to sort.'}</h1><p className="subtitle">{total?total-leftCount+' book'+(total-leftCount===1?'':'s')+' organized'+(leftCount?' · '+leftCount+' left unshelved':''):'Books that are identified but not yet assigned to a collection will appear here.'}</p><button className="btn" onClick={onDone}>Done</button></div>;
  return <div className={'workspace sort-desk '+(dragging?'is-dragging':'')}><div className="sort-desk-top"><div><div className="overline">Sort Desk</div><h1 className="title">Sort new books</h1></div><div className="small mono">{queue.length+' remaining'}</div></div><div className="sort-desk-grid"><section className="sort-current"><div className="sort-book-stack" draggable onDragStart={event=>{event.dataTransfer.effectAllowed='move';setDragging(true)}} onDragEnd={()=>{setDragging(false);setOver('')}}><div className="sort-book-shadow"/><div className="sort-current-card"><div className="sort-current-cover">{current.cover?<img src={current.cover} alt={current.title||'Book cover'}/>:<Icon name="book" size={52}/>}<ReadBadge book={current}/></div><h2>{current.title||'Untitled book'}</h2><p>{current.authors||'Unknown author'}</p><div className="small mono">{total-queue.length+1+' of '+total}</div></div></div><div className="sort-current-actions"><button className="ghost" onClick={skip}>Skip</button><button className="ghost" onClick={leave}>Leave unshelved</button></div>{undo&&<button className="sort-undo" onClick={undoLast}>Undo</button>}{feedback&&<div className="sort-feedback" role="status">{feedback}</div>}{sorted.length>0&&<div className="sort-recently"><span>Recently sorted</span>{sorted.map(item=><div key={item.id}>{item.cover?<img src={item.cover} alt=""/>:<Icon name="book" size={14}/>}<small>{item.shelf}</small></div>)}</div>}</section><section className="sort-destinations"><div className="label">Recent collections</div>{recent.length?<div className="sort-recent-shelves">{recent.map(item=><button key={item.name} onClick={()=>useShelf(item.name)}>{item.name}</button>)}</div>:<div className="small sort-no-recent">Your used collections will appear here.</div>}<div className="sort-all-head"><div className="label">All collections</div><div className="sort-new-shelf"><input className="field" value={newShelf} onChange={event=>setNewShelf(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();createShelf()}}} placeholder="New collection"/><button className="ghost" onClick={createShelf}>+ New collection</button></div></div><div className="sort-shelf-grid">{collections.length?collections.map(shelfCard):<div className="empty">Create a collection to start sorting.</div>}</div></section></div></div>;
}

function IntakeQueueView({books,collections,onEdit,onIdentify,onBulkIntakeUpdate,onOpenSort,setActiveView,setFilters,onOpenAddBooks,focusScope,onFocusHandled}){
  const safe=(books||[]).filter(b=>b&&typeof b==='object');
  const today=todayISO();
  const [listScope,setListScope]=useState('');
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const [advancedScope,setAdvancedScope]=useState('all');
  const [selected,setSelected]=useState([]);
  const [target,setTarget]=useState('');
  const [mode,setMode]=useState('move');
  const [status,setStatus]=useState('');
  const [markReviewed,setMarkReviewed]=useState(false);
  const [loc,setLoc]=useState({room:'',bookcase:'',shelf:'',box:''});
  const recentCutoff=Date.now()-14*86400000;
  const identification=safe.filter(needsIdentification);
  const ready=safe.filter(book=>isUnshelved(book)&&!needsIdentification(book));
  const attention=safe.filter(book=>!needsIdentification(book)&&!isUnshelved(book)&&needsReview(book,safe));
  const recent=safe.filter(book=>{const time=new Date(book.addedAt||0).getTime();return Number.isFinite(time)&&time>=recentCutoff;});
  const allOrganize=uniq([...identification,...ready,...attention].map(book=>book.id)).map(id=>safe.find(book=>book.id===id)).filter(Boolean);
  const source=listScope==='identification'?identification:listScope==='ready'?ready:listScope==='attention'?attention:listScope==='today'?safe.filter(book=>String(book.addedAt||'').slice(0,10)===today):listScope==='review'?safe.filter(book=>needsReview(book,safe)):listScope==='recent'?recent:allOrganize;
  const rows=[...source].sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  const sortIds=ready.map(book=>book.id);
  const scopeLabels={identification:'Needs identification',ready:'Ready to shelve',attention:'Other attention',today:'Added today',review:'Needs review',recent:'Recent 14 days',all:'All organization items'};
  useEffect(()=>{if(focusScope){setListScope(focusScope);setSelected([]);onFocusHandled?.();}},[focusScope]);
  useEffect(()=>setSelected(current=>current.filter(id=>rows.some(book=>book.id===id))),[listScope,books.length]);
  const toggle=id=>setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  const toggleAll=()=>setSelected(selected.length===rows.length?[]:rows.map(book=>book.id));
  const openLibrary=filters=>{setFilters({...defaultFilters,...filters});setActiveView('library');};
  const openList=scope=>{setListScope(scope);setSelected([]);};
  function apply(){
    if(!selected.length)return;
    const changes={mode};
    if(target)changes.collection=target;
    if(status)changes.status=status;
    if(markReviewed)changes.reviewed=true;
    if(loc.room||loc.bookcase||loc.shelf||loc.box)changes.location=loc;
    if(!target&&!status&&!markReviewed&&!changes.location)return;
    onBulkIntakeUpdate(selected,changes);
    setSelected([]);
  }
  const reasonFor=book=>needsIdentification(book)?'Needs identification':reviewReasons(book,safe).filter(reason=>reason!=='Unreviewed').slice(0,2).join(' · ')||'Needs review';
  const allClear=!identification.length&&!ready.length&&!attention.length;
  return <div className="workspace intake-shell organize-shell"><div><div className="overline">Organize</div><h1 className="title">To organize</h1><p className="subtitle">A calm place to identify books, add them to collections, and resolve the few details that still need attention.</p></div>
    {allClear?<section className="organize-complete"><div className="organize-complete-mark"><Icon name="check" size={18}/></div><div><h2>Everything is organized.</h2><p>Your books are identified, shelved, and up to date.</p></div><div className="row-actions"><button className="btn" onClick={onOpenAddBooks}>Add books</button><button className="ghost" onClick={()=>setActiveView('library')}>Open library</button></div></section>:<section className="organize-flow" aria-label="Organization tasks">
      <div className={identification.length?'organize-flow-card':'organize-flow-empty'}><div className="organize-flow-count"><strong>{identification.length}</strong><span>{identification.length===1?'book':'books'}</span></div><div><h2>Needs identification</h2><p>{identification.length?'Books that need a title, author, or metadata check.':'No books need identification. Scanned books with unresolved details will appear here.'}</p></div>{identification.length>0&&<button className="btn" onClick={()=>openList('identification')}>Review books</button>}</div>
      <div className={ready.length?'organize-flow-card':'organize-flow-empty'}><div className="organize-flow-count"><strong>{ready.length}</strong><span>{ready.length===1?'book':'books'}</span></div><div><h2>Ready to shelve</h2><p>{ready.length?'Identified copies with no collection yet.':'No books are waiting to be shelved.'}</p></div>{ready.length>0&&<div className="organize-flow-actions"><button className="btn" onClick={()=>onOpenSort?.(sortIds)}>Sort books</button><button className="ghost" onClick={()=>openList('ready')}>View books</button></div>}</div>
      <div className={attention.length?'organize-flow-card':'organize-flow-empty'}><div className="organize-flow-count"><strong>{attention.length}</strong><span>{attention.length===1?'book':'books'}</span></div><div><h2>Other attention</h2><p>{attention.length?'Shelved books with a detail that still needs a quick review.':'Nothing needs attention. Catalog issues that need a quick check will appear here.'}</p></div>{attention.length>0&&<button className="btn" onClick={()=>openList('attention')}>Review</button>}</div>
    </section>}
    {listScope&&<section className="organize-list-section"><div className="organize-list-head"><div><h2>{scopeLabels[listScope]||'Books'}</h2><p className="small">{rows.length} book{rows.length===1?'':'s'} shown · {selected.length} selected</p></div><div className="row-actions"><button className="ghost" onClick={toggleAll} disabled={!rows.length}>{rows.length&&selected.length===rows.length?'Clear selection':'Select all shown'}</button><button className="ghost" onClick={()=>{setListScope('');setSelected([])}}>Done</button></div></div><div className="intake-list">{rows.length?rows.map(book=><div key={book.id} className="intake-row"><input type="checkbox" checked={selected.includes(book.id)} onChange={()=>toggle(book.id)} aria-label={'Select '+(book.title||'book')}/><div className="cover-mini">{book.cover?<img loading="lazy" src={book.cover} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:3}}/>:<Icon name="book" size={18}/>}<ReadBadge book={book}/></div><button className="intake-row-main" onClick={()=>onEdit(book)}><b className="truncate">{book.title||'Untitled book'}</b><span className="truncate">{book.authors||'Unknown author'} · {collectionNames(book).join(', ')||'Unshelved'}{locationText(book)?' · '+locationText(book):''}</span></button><div className="clean-row-meta">{needsIdentification(book)&&<button className="btn identify-row-action" onClick={()=>onIdentify(book)} aria-label={'Identify '+(book.title||'this book')}>Identify</button>}<span className="chip gray">{statusLabel(book.status)}</span>{needsIdentification(book)&&<span className="chip warn">Needs identification</span>}{!needsIdentification(book)&&needsReview(book,safe)&&<span className="chip warn">{reasonFor(book)}</span>}</div></div>):<div className="clean-empty">No matching books. Try changing or clearing your search.</div>}</div></section>}
    <details className="organize-advanced" open={advancedOpen} onToggle={event=>setAdvancedOpen(event.currentTarget.open)}><summary>More organization tools</summary><section className="panel panel-pad"><div className="intake-toolbar"><label><div className="label">Show</div><select className="select" value={advancedScope} onChange={event=>{const value=event.target.value;setAdvancedScope(value);openList(value);}}><option value="all">All organization items</option><option value="today">Added today</option><option value="recent">Recent 14 days</option><option value="review">Needs review</option></select></label><button className="ghost" onClick={()=>onOpenSort?.(sortIds)} disabled={!sortIds.length}>Sort visually</button><button className="ghost" onClick={()=>openLibrary({collection:'__unshelved__'})}>Open unshelved in Library</button><button className="ghost" onClick={()=>setActiveView('bookcase')}>Open Bookcase</button></div></section></details>
    {selected.length>0&&<section className="intake-bulkbar" aria-label="Bulk organization actions"><label><div className="label">Collection action</div><select className="select" value={mode} onChange={event=>setMode(event.target.value)}><option value="move">Move to collection</option><option value="add">Add to collection, keep existing</option></select></label><label><div className="label">Collection target</div><select className="select" value={target} onChange={event=>setTarget(event.target.value)}><option value="">No collection change</option>{collections.map(collection=><option key={collection} value={collection}>{collection}</option>)}</select></label><label><div className="label">Status</div><select className="select" value={status} onChange={event=>setStatus(event.target.value)}><option value="">No status change</option>{STATUS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label><div className="label">Reviewed</div><button className={markReviewed?'chip good':'chip'} onClick={()=>setMarkReviewed(value=>!value)}>{markReviewed?'Will mark reviewed':'Leave review state'}</button></label><input className="field" placeholder="Room" value={loc.room} onChange={event=>setLoc(current=>({...current,room:event.target.value}))}/><input className="field" placeholder="Bookcase" value={loc.bookcase} onChange={event=>setLoc(current=>({...current,bookcase:event.target.value}))}/><input className="field" placeholder="Shelf" value={loc.shelf} onChange={event=>setLoc(current=>({...current,shelf:event.target.value}))}/><input className="field" placeholder="Box" value={loc.box} onChange={event=>setLoc(current=>({...current,box:event.target.value}))}/><button className="btn" onClick={apply}>Apply to {selected.length}</button><button className="ghost" onClick={()=>setSelected([])}>Clear</button></section>}
  </div>;
}
function TagManager({books,onRename,onMerge,onDelete}){const tags=useMemo(()=>uniq(books.flatMap(b=>b.tags||[])).sort(),[books]);const [selected,setSelected]=useState('');const [newName,setNewName]=useState('');const [mergeInto,setMergeInto]=useState('');const count=t=>books.filter(b=>(b.tags||[]).includes(t)).length;return <div className="workspace"><div className="overline">Tag Manager</div><h1 className="title">Clean up tags</h1><p className="subtitle">Tags are flexible descriptors. They stay separate from collections and can be renamed, merged, or removed across the catalog.</p><div className="grid2" style={{marginTop:14}}><div className="panel panel-pad"><h2 style={{marginTop:0,fontFamily:'Fraunces,serif'}}>All tags</h2>{tags.length?<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{tags.map(t=><button key={t} className={'chip '+(selected===t?'good':'')} onClick={()=>{setSelected(t);setNewName(t);setMergeInto('')}}>{t} <span className="mono">{count(t)}</span></button>)}</div>:<div className="small">No tags yet.</div>}</div><div className="panel panel-pad"><h2 style={{marginTop:0,fontFamily:'Fraunces,serif'}}>Edit selected tag</h2>{selected?<><div className="label">Selected</div><div style={{marginBottom:10}}><span className="chip">{selected}</span> <span className="small">used by {count(selected)} book{count(selected)===1?'':'s'}</span></div><div className="label">Rename to</div><div style={{display:'flex',gap:8}}><input className="field" value={newName} onChange={e=>setNewName(e.target.value)}/><button className="btn" onClick={()=>{if(newName.trim())onRename(selected,newName.trim());setSelected(newName.trim())}}>Rename</button></div><div className="label" style={{marginTop:14}}>Merge into</div><div style={{display:'flex',gap:8}}><select className="select" value={mergeInto} onChange={e=>setMergeInto(e.target.value)}><option value="">Choose tag…</option>{tags.filter(t=>t!==selected).map(t=><option key={t} value={t}>{t}</option>)}</select><button className="ghost" onClick={()=>{if(mergeInto)onMerge(selected,mergeInto);setSelected('')}}>Merge</button></div><button className="ghost danger" style={{marginTop:14}} onClick={()=>{if(confirm(`Remove tag "${selected}" from all books?`)){onDelete(selected);setSelected('')}}}><Icon name="trash" size={13}/>Delete tag</button></>:<div className="small">Select a tag to edit it.</div>}</div></div></div>}



function CleanupAssistantView({books,setActiveView,setFilters,onExportJSON}){
  const s=cleanupSummary(books);const totalProblems=s.review.length+s.covers.length+s.locations.length+s.duplicates.length+s.quality.length+s.overdue.length;
  const steps=[
    {id:'review',title:'Fix broken records',count:s.review.length,detail:'Unknown titles, missing authors, invalid ISBNs, or records that still need review.',action:()=>setActiveView('review')},
    {id:'duplicates',title:'Resolve duplicates safely',count:s.duplicates.length,detail:'Compare possible duplicates and merge only after choosing the best fields.',action:()=>setActiveView('duplicates')},
    {id:'quality',title:'Improve missing metadata',count:s.quality.length,detail:'Preview metadata candidates or fill missing fields from ISBN/title search.',action:()=>setActiveView('quality')},
    {id:'locations',title:'Assign physical locations',count:s.locations.length,detail:'Add room, bookcase, Shelf, box, or position for inventory confidence.',action:()=>{setFilters({...defaultFilters,missing:'location'});setActiveView('library')}},
    {id:'lending',title:'Check overdue loans',count:s.overdue.length,detail:'Review books past their due date and mark them returned when they come back.',action:()=>setActiveView('lending')},
    {id:'backup',title:'Export a recovery backup',count:0,detail:'Download JSON after cleanup. It preserves the full catalog better than CSV.',action:onExportJSON,always:true}
  ];
  const openStep=steps.find(st=>st.count>0)||steps[steps.length-1];const done=!totalProblems;const progress=Math.round(((steps.length-1-steps.filter(x=>x.count).length)/(steps.length-1))*100);
  return <div className="workspace"><div className="overline">Guided cleanup</div><h1 className="title">Cleanup assistant</h1><p className="subtitle">A safe, ordered path through the powerful maintenance tools. Start at the top, fix only one queue at a time, and finish with a JSON backup.</p><div className="calm-hero"><section className="next-action-card"><div className="overline">Next step</div><h2>{done?'Catalog looks healthy':openStep.title}</h2><p>{done?'No major cleanup queues are active. Download a JSON backup before large edits or imports.':openStep.detail}</p><div className="cleanup-meter"><span style={{width:progress+'%'}}/></div><div className="row-actions"><button className="btn" onClick={openStep.action}>{done?'Download backup':'Start: '+openStep.title}</button><button className="ghost" onClick={onExportJSON}>Backup now</button></div></section><section className="backup-card"><b>Safe cleanup rules</b><div className="small">1. Back up before imports or bulk edits. 2. Review duplicates before merging. 3. Use Preview metadata when changing external fields. 4. Finish by exporting JSON.</div><div className="row-actions"><button className="ghost" onClick={()=>setActiveView('settings')}>Safety settings</button><button className="ghost" onClick={onExportJSON}>Download JSON</button></div></section></div><div className="guided-steps">{steps.map((st,i)=><div key={st.id} className={'guided-step-row '+(st.count?'active':'done')}><div className="step-number">{i+1}</div><div><h3>{st.title}</h3><div className="small">{st.detail}</div></div><button className={st.id==='backup'?'btn':'ghost'} onClick={st.action}>{st.id==='backup'?'Backup':st.count?st.count+' item'+(st.count===1?'':'s'):'Review'}</button></div>)}</div></div>;
}
function QuickEditDrawer({book,collections,onClose,onSave,onPreviewMetadata}){
  const [d,setD]=useState(()=>normalizeBook(book));const [tagDraft,setTagDraft]=useState('');const [colDraft,setColDraft]=useState('');const ref=useRef(null);useModalFocus(true,onClose,ref);useEffect(()=>setD(normalizeBook(book)),[book.id]);
  const shelfOptions=editorShelfOptions(d,collections);
  const update=(k,v)=>setD(p=>({...p,[k]:v}));const updateLoc=(k,v)=>setD(p=>({...p,location:{...normalizeLocation(p.location),[k]:v}}));const addTag=()=>{const t=tagDraft.trim();if(t){setD(p=>({...p,tags:uniq([...(p.tags||[]),t])}));setTagDraft('')}};const addCol=()=>{const c=colDraft.trim();if(c){setD(p=>setBookCollections(p,uniq([...collectionNames(p),c])));setColDraft('')}};
  return <div className="quick-drawer-back" onClick={onClose} role="presentation"><aside ref={ref} className="quick-drawer" role="dialog" aria-modal="true" aria-label="Quick edit book" tabIndex="-1" onClick={e=>e.stopPropagation()}><div className="quick-drawer-head"><div><div className="overline">Quick edit</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>{d.title||'Untitled book'}</h2><div className="small">{d.authors||'Unknown author'}</div><PhysicalLocation location={d.location} compact/></div><button className="ghost" onClick={onClose}><Icon name="x" size={14}/></button></div><div className="quick-drawer-body"><label><div className="label">Status</div><select className="select" value={d.status} onChange={e=>update('status',e.target.value)}>{STATUS.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label><div><div className="label">Rating</div><StarRating value={d.rating} onChange={r=>update('rating',r)}/></div><div><div className="label">Reviewed</div><button className={d.reviewed?'chip good':'chip warn'} onClick={()=>update('reviewed',!d.reviewed)}>{d.reviewed?'Reviewed':'Needs review'}</button></div><div><div className="label">Collections</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{shelfOptions.map(c=><button key={c} className={inCollection(d,c)?'chip good':'chip gray'} onClick={()=>setD(p=>setBookCollections(p,inCollection(p,c)?collectionNames(p).filter(x=>x!==c):[...collectionNames(p),c]))}>{c}</button>)}</div><div style={{display:'flex',gap:6,marginTop:8}}><input className="field" placeholder="Add collection" value={colDraft} onChange={e=>setColDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCol()}}}/><button className="ghost" onClick={addCol}>Add</button></div></div><div><div className="label">Tags</div><div className="tagbox">{(d.tags||[]).map(t=><span key={t} className="chip">{t}<button style={{all:'unset',cursor:'pointer'}} onClick={()=>setD(p=>({...p,tags:p.tags.filter(x=>x!==t)}))}>×</button></span>)}<input value={tagDraft} onChange={e=>setTagDraft(e.target.value)} onBlur={addTag} onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addTag()}}} placeholder="Add tag…"/></div></div><div><div className="label">Location</div><div className="form-cols"><input className="field" placeholder="Room" value={normalizeLocation(d.location).room} onChange={e=>updateLoc('room',e.target.value)}/><input className="field" placeholder="Bookcase" value={normalizeLocation(d.location).bookcase} onChange={e=>updateLoc('bookcase',e.target.value)}/><input className="field" placeholder="Shelf" value={normalizeLocation(d.location).shelf} onChange={e=>updateLoc('shelf',e.target.value)}/><input className="field" placeholder="Box" value={normalizeLocation(d.location).box} onChange={e=>updateLoc('box',e.target.value)}/></div></div><div><div className="label">Loan</div><input className="field" placeholder="Lent to" value={d.lentTo||''} onChange={e=>update('lentTo',e.target.value)}/><div className="form-cols" style={{marginTop:8}}><input className="field" type="date" value={d.lentDate||''} onChange={e=>update('lentDate',e.target.value)}/><input className="field" type="date" value={d.dueDate||''} onChange={e=>update('dueDate',e.target.value)}/></div><div className="row-actions" style={{marginTop:8}}><button className="ghost" onClick={()=>setD(p=>({...p,lentDate:p.lentDate||todayISO(),returnedDate:''}))}>Mark lent today</button><button className="ghost" onClick={()=>setD(p=>({...p,returnedDate:todayISO()}))}>Mark returned</button></div></div><div className="row-actions"><button className="ghost" onClick={()=>onPreviewMetadata?.(d.id)}>Preview metadata</button></div></div><div className="quick-drawer-foot"><button className="ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={()=>onSave(d)}>Save quick edits</button></div></aside></div>;
}


function backupAgeLabel(settings,hasCatalog=true,now=Date.now()){const health=getBackupHealth(settings,hasCatalog,now);return {...health,label:health.ageLabel};}
function SafetyStatusBanner({books,settings,onExportJSON,compact=false}){
  const backup=backupAgeLabel(settings,(books||[]).filter(Boolean).length>0);
  const destructive=settings?.confirmDestructive!==false;
  const snapshots=settings?.autoJsonSnapshot!==false;
  return <div className={'safety-strip '+backup.tone}><div className="safety-strip-head"><div><b>{backup.statusLabel}</b><div className="small">{backup.detail} Destructive confirmations are {destructive?'on':'off'} and local safety snapshots are {snapshots?'on':'off'}.</div></div><button className="ghost" onClick={onExportJSON}>Download backup</button></div>{!compact&&<div className="safety-facts"><div className="safety-fact"><b>{backup.label}</b><span>Last JSON backup</span></div><div className="safety-fact"><b>{destructive?'On':'Off'}</b><span>Confirm deletes</span></div><div className="safety-fact"><b>{snapshots?'On':'Off'}</b><span>Local snapshots</span></div></div>}</div>;
}

function StarterPath({books,setActiveView,onAddManual,onLoadDemo,onExportJSON}){
  if((books||[]).length)return null;
  return <section className="starter-panel"><div className="calm-section-title"><div><div className="overline">First run path</div><h2>Build confidence in three small steps</h2></div><button className="ghost" onClick={onExportJSON}>Backup later</button></div><div className="starter-steps"><div className="starter-step"><b>1. Try the workflow</b><span>Load demo books to see Review, Works, Bookcase, and Reports without risking real data.</span><button className="ghost" onClick={onLoadDemo}>Load demo library</button></div><div className="starter-step"><b>2. Add a real book</b><span>Use manual entry or Scan. New records go to Review only when something needs attention.</span><button className="btn" onClick={onAddManual}>Add first book</button></div><div className="starter-step"><b>3. Protect the catalog</b><span>When real records exist, use JSON backup before imports, merges, or model changes.</span><button className="ghost" onClick={()=>setActiveView('settings')}>Open backup tools</button></div></div></section>;
}
function RiskSafetyRail({activeView,books,settings,onExportJSON}){
  if(!['duplicates','migration','settings','reports'].includes(activeView))return null;
  const labels={duplicates:'Compare and merge slowly. A safety snapshot is created before duplicate merges.',migration:'Catalog Model changes are safer after a fresh JSON backup and dry-run report.',settings:'Backup, restore, and maintenance tools can change many records at once.',reports:'Reports are read-only, but exporting first is still useful before large cleanup sessions.'};
  return <div className="workspace safety-rail"><SafetyStatusBanner books={books} settings={settings} onExportJSON={onExportJSON} compact={true}/><div className="risk-note" style={{marginTop:10}}>{labels[activeView]}</div></div>;
}

function HomeCoverCard({book,reading=false,onEdit}){
  return <button className={reading?'home-reading-card':'home-cover-card'} onClick={()=>onEdit?.(book)} aria-label={'Open '+(book.title||'book')}><div className="cover">{book.cover?<img loading="lazy" src={book.cover} alt=""/>:<Icon name="book" size={reading?32:26}/>}<ReadBadge book={book}/></div><div className={reading?'home-reading-copy':''}><b className="truncate">{book.title||'Untitled book'}</b><span className="truncate">{book.authors||'Unknown author'}</span><PhysicalLocation location={book.location} compact/>{reading&&book.startedAt&&<small>Started {book.startedAt}</small>}</div></button>;
}

function DashboardView({books,collections,savedViews,setActiveView,setActiveCollection,setFilters,onExportJSON,onImportJSON,settings,onAddManual,onLoadDemo,onOpenAddBooks,onOpenFind,onOpenMove,onOpenSort,onOpenOrganize,onEdit}){
  const safe=(books||[]).filter(Boolean);const restoreRef=useRef(null);const reading=[...safe].filter(book=>book.status==='reading').sort((a,b)=>(b.startedAt||b.addedAt||'').localeCompare(a.startedAt||a.addedAt||'')).slice(0,3);const recently=[...safe].sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||'')).slice(0,5);const identification=safe.filter(needsIdentification);const readyToShelve=safe.filter(book=>isUnshelved(book)&&!needsIdentification(book));const otherAttention=safe.filter(book=>!needsIdentification(book)&&!isUnshelved(book)&&needsReview(book,safe));const overdue=safe.filter(isOverdue);const backupHealth=getBackupHealth(settings,safe.length>0);const backupDue=backupHealth.state===BACKUP_HEALTH.OVERDUE||backupHealth.state===BACKUP_HEALTH.NEVER_BACKED_UP;const openIdentification=()=>onOpenOrganize?.('identification');
  if(!safe.length)return <div className="workspace library-home"><input ref={restoreRef} type="file" accept="application/json,.json" className="sr-only" onChange={e=>{const file=e.target.files?.[0];if(file)onImportJSON?.(file);e.target.value='';}}/><div className="overline">Home</div><div className="library-home-head"><div><h1 className="title">The Stacks</h1><div className="library-home-count">Your personal library</div></div></div><section className="library-home-empty"><h2>Your library is empty</h2><p>Add or scan a book to start building your library.</p><div className="library-home-empty-actions"><button className="btn" onClick={onOpenAddBooks}><Icon name="plus" size={15}/> Add books</button><button className="ghost" onClick={onOpenFind}>Find / Put Away</button><button className="ghost" onClick={()=>restoreRef.current?.click()}>Restore backup</button><button className="ghost" onClick={onLoadDemo}>Load demo</button></div></section></div>;
  return <div className="workspace library-home"><div className="overline">Home</div><div className="library-home-head"><div><h1 className="title">The Stacks</h1><div className="library-home-count">{safe.length} physical book{safe.length===1?'':'s'} in your library</div></div><div className="home-head-actions"><button className="ghost" onClick={onOpenFind}>Find / Put Away</button><button className="ghost" onClick={onOpenMove}>Move Books</button><button className="btn" onClick={onOpenAddBooks}><Icon name="plus" size={15}/> Add books</button></div></div>{reading.length>0&&<section className="library-home-section"><h2>Currently reading</h2><div className="home-reading-row">{reading.map(book=><HomeCoverCard key={book.id} book={book} reading onEdit={onEdit}/>)}</div></section>}<section className="library-home-section"><h2>Recently added</h2><div className="home-recent-row">{recently.map(book=><HomeCoverCard key={book.id} book={book} onEdit={onEdit}/>)}</div></section><section className="library-home-section"><h2>Library at a glance</h2><div className="home-glance" aria-label="Library summary"><div className="home-glance-item"><b>{safe.length}</b><span>Physical books</span></div><div className="home-glance-item"><b>{safe.filter(book=>book.status==='read').length}</b><span>Read</span></div><div className="home-glance-item"><b>{reading.length}</b><span>Currently reading</span></div><div className="home-glance-item"><b>{collections.length}</b><span>Custom collections</span></div></div></section><section className="library-home-section"><h2>Needs your attention</h2>{(identification.length||readyToShelve.length||overdue.length||otherAttention.length)?<div className="home-attention-list">{identification.length>0&&<button className="home-attention-row" onClick={openIdentification}><span><b>Needs identification</b><small>Safely scanned books waiting for details</small></span><strong>{identification.length} book{identification.length===1?'':'s'}</strong></button>}{readyToShelve.length>0&&<button className="home-attention-row" onClick={()=>onOpenSort?.(readyToShelve.map(book=>book.id))}><span><b>Ready to shelve</b><small>Identified books ready for organization</small></span><strong>{readyToShelve.length} book{readyToShelve.length===1?'':'s'}</strong></button>}{overdue.length>0&&<button className="home-attention-row" onClick={()=>setActiveView('lending')}><span><b>Overdue loans</b><small>Books past their expected return date</small></span><strong>{overdue.length} book{overdue.length===1?'':'s'}</strong></button>}{otherAttention.length>0&&<button className="home-attention-row" onClick={()=>onOpenOrganize?.('attention')}><span><b>Other attention</b><small>Review shelved books with a detail that still needs attention</small></span><strong>{otherAttention.length}</strong></button>}</div>:<div className="small">Everything in your library looks settled.</div>}{backupDue&&<div className="home-backup-note"><div><b>Backup recommended</b><small>{backupHealth.state===BACKUP_HEALTH.NEVER_BACKED_UP?'Save your first portable library backup.':'Your portable library backup is overdue.'}</small></div><button className="ghost" onClick={onExportJSON}>Save backup</button></div>}</section><div className="home-quiet-actions"><button className="ghost" onClick={onOpenAddBooks}>Add books</button>{readyToShelve.length>0&&<button className="ghost" onClick={()=>onOpenSort?.(readyToShelve.map(book=>book.id))}>Organize books</button>}</div></div>;
}

function findLocationNode(root,id){if(!root||!id)return null;if(root.id===id)return root;for(const child of root.children||[]){const found=findLocationNode(child,id);if(found)return found;}return null;}
function LocationTreeBranch({nodes,selectedId,onSelect,depth=0}){return <div className={depth?'location-tree-children':'location-tree'}>{nodes.map(node=><div className="location-tree-branch" key={node.id}><button className={'location-tree-row '+(selectedId===node.id?'active':'')} onClick={()=>onSelect(node.id)} aria-pressed={selectedId===node.id}><span className="location-kind">{node.typeLabel}</span><b className="truncate">{node.field==='shelf'?'Shelf '+node.label:node.field==='box'?'Box '+node.label:node.label}</b><span className="mono">{node.copyIds.length} {node.copyIds.length===1?'copy':'copies'}</span></button>{node.children.length>0&&<LocationTreeBranch nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth+1}/>}</div>)}</div>;}
function LocationCopyList({books,allBooks,onEdit}){return <div className="location-copy-list" role="list">{books.length?books.map(book=>{const peers=allBooks.filter(other=>book.editionId&&other.editionId===book.editionId).sort((a,b)=>String(a.copyId||a.id).localeCompare(String(b.copyId||b.id)));const number=peers.findIndex(other=>(other.copyId||other.id)===(book.copyId||book.id))+1;return <div className="location-copy-row" role="listitem" key={book.copyId||book.id}><div className="cover-mini">{book.cover?<img loading="lazy" src={book.cover} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<Icon name="book" size={18}/>}<ReadBadge book={book}/></div><button className="location-copy-row-main" onClick={()=>onEdit(book)}><b className="truncate">{book.title||'Untitled book'}</b><span className="small truncate">{book.authors||'Unknown author'}{peers.length>1?' · Copy '+number+' of '+peers.length:''}</span></button><div className="location-copy-row-meta"><div className="small">{locationText(book)||'No location'}</div>{book.condition&&<span className="chip gray">{book.condition}</span>}</div></div>}):<div className="small">This location is empty.</div>}</div>;}
function LocationDestinationFields({books,value,onChange,showPosition,idPrefix='location'}){const suggestions=useMemo(()=>locationSuggestions(books,value),[books,value.room,value.bookcase,value.shelf]);const update=(field,next)=>{const destination={...value,[field]:next};if(field==='bookcase'){destination.shelf='';destination.box='';}if(field==='shelf')destination.box='';onChange(destination);};return <div className="location-destination-grid">{LOCATION_LEVELS.map(([field,label])=><label key={field}><div className="label">{label}{['bookcase','shelf'].includes(field)?' *':''}</div><input className="field" list={idPrefix+'-'+field+'-options'} value={value[field]} onChange={event=>update(field,event.target.value)} placeholder={label}/><datalist id={idPrefix+'-'+field+'-options'}>{suggestions[field].map(item=><option key={item} value={item}/>)}</datalist></label>)}{showPosition&&<label><div className="label">Position</div><input className="field" value={value.position} onChange={event=>onChange({...value,position:event.target.value})} placeholder="Optional position"/></label>}</div>;}
function commonMoveDestinations(books=[]){
  const paths=new Map();
  for(const book of books||[]){
    if(!book)continue;const l=normalizeLocation(book.location);
    if(!l.room||!l.bookcase||!l.shelf)continue;
    const value={room:l.room,bookcase:l.bookcase,shelf:l.shelf,box:l.box,position:''},key=JSON.stringify([l.room,l.bookcase,l.shelf,l.box]);
    const entry=paths.get(key)||{location:value,count:0};entry.count++;paths.set(key,entry);
  }
  return [...paths.values()].sort((a,b)=>b.count-a.count||compareNaturalLocationValue(locationText({location:a.location}),locationText({location:b.location}))).slice(0,8);
}
function MoveDestinationPicker({books,value,onChange,idPrefix}){
  const common=useMemo(()=>commonMoveDestinations(books),[books]);
  return <div className="move-destination-picker">
    {common.length>0&&<div><div className="label">Existing locations</div><div className="move-destination-options">{common.map(({location,count})=><button type="button" className={sameLocation(value,location)?'chip good':'chip gray'} key={JSON.stringify(location)} onClick={()=>onChange({...location})} aria-pressed={sameLocation(value,location)}>{locationText({location})} <small>({count})</small></button>)}</div></div>}
    <LocationDestinationFields books={books} value={value} onChange={onChange} idPrefix={idPrefix}/>
    <div className="move-destination-preview"><span className="label">Move to</span><PhysicalLocation location={value}/></div>
  </div>;
}
function MoveCopiesDialog({books,copyIds,onConfirm,onClose}){
  const [destination,setDestination]=useState(blankLocation());const [error,setError]=useState('');const modalRef=useRef(null);useModalFocus(true,onClose,modalRef);
  const ids=new Set(copyIds),selected=books.filter(book=>ids.has(String(book.copyId||book.id)));
  const submit=()=>{if(!hasMoveDestination(destination)){setError('Choose a Bookcase and Shelf.');return;}const result=onConfirm(copyIds,destination);if(result?.error){setError(result.error);return;}onClose();};
  return <div className="modal-back" onClick={onClose} role="presentation"><div className="modal move-copies-dialog" role="dialog" aria-modal="true" aria-label="Move physical copies" tabIndex="-1" ref={modalRef} onClick={event=>event.stopPropagation()}>
    <div className="modal-head"><div><div className="overline">Physical relocation</div><h2>Move {selected.length} physical {selected.length===1?'copy':'copies'}</h2></div><button className="ghost" onClick={onClose} aria-label="Close move dialog"><Icon name="x" size={14}/></button></div>
    <div className="modal-body"><div className="move-current-list"><div className="label">Current location{selected.length===1?'':'s'}</div>{selected.map(book=><div className="move-current-row" key={book.copyId||book.id}><b>{book.title||book.isbn||'Needs identification'}</b><PhysicalLocation location={book.location} compact/></div>)}</div><MoveDestinationPicker books={books} value={destination} onChange={setDestination} idPrefix="move-dialog"/>{error&&<p className="small bad" role="alert">{error}</p>}</div>
    <div className="modal-head modal-foot"><button className="ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={submit} disabled={!selected.length||!hasMoveDestination(destination)}>Confirm move</button></div>
  </div></div>;
}
function LocationsView({books,setActiveView,setFilters,onRenameLocation,onMergeLocation,onClearLocation,onUpdateCopyLocations,onEdit}){
  const safe=books.filter(Boolean),tree=useMemo(()=>buildLocationTree(safe),[books]),groups=useMemo(()=>locationGroups(safe),[books]),missing=safe.filter(hasMissingLocation);
  const [selectedNodeId,setSelectedNodeId]=useState('');const selectedNode=findLocationNode(tree,selectedNodeId);const [mode,setMode]=useState('assign');const [allCandidates,setAllCandidates]=useState(false);const [selectedCopies,setSelectedCopies]=useState([]);const [query,setQuery]=useState('');const [destination,setDestination]=useState(blankLocation());
  const [adminSource,setAdminSource]=useState('');const [adminTarget,setAdminTarget]=useState('');const [adminDestination,setAdminDestination]=useState(blankLocation());
  const baseCandidates=allCandidates?safe:(mode==='assign'?missing:safe.filter(book=>!hasMissingLocation(book)));const candidates=baseCandidates.filter(book=>!query.trim()||matches(book,query,safe));const candidateIds=candidates.map(book=>String(book.copyId||book.id));const sourceGroup=groups.find(group=>group.id===adminSource);const targetGroup=groups.find(group=>group.id===adminTarget);const sourceLocation=sourceGroup?.location||blankLocation();const targetLocation=targetGroup?.location||blankLocation();
  useEffect(()=>setSelectedCopies(current=>current.filter(id=>safe.some(book=>String(book.copyId||book.id)===id))),[books]);
  const chooseMode=next=>{setMode(next);setAllCandidates(next==='move');setSelectedCopies([]);setQuery('');};
  const openMissing=()=>{chooseMode('assign');setAllCandidates(false);document.getElementById('location-workflow')?.scrollIntoView({behavior:'smooth',block:'start'});};
  const openLibrary=path=>{setFilters({...defaultFilters,room:path.room||'',bookcase:path.bookcase||'',physicalShelf:path.shelf||'',box:path.box||''});setActiveView('library');};
  const toggleCopy=id=>setSelectedCopies(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  const applySelected=()=>{if(!selectedCopies.length)return;onUpdateCopyLocations(selectedCopies,destination,mode);setSelectedCopies([]);};
  const selectAdminSource=id=>{const group=groups.find(item=>item.id===id);setAdminSource(id);setAdminTarget(current=>current===id?'':current);setAdminDestination(group?.location||blankLocation());};
  return <div className="workspace"><div className="overline">Locations</div><h1 className="title">Physical inventory</h1><p className="subtitle">Find, assign, move, and browse exact physical copies by where they are stored.</p>
    <section className="panel location-summary"><div className="location-summary-copy"><span className="label">Books without location</span><strong>{missing.length}</strong><span className="small">{missing.length?'Physical copies ready to place.':'All physical copies have a location.'}</span></div>{missing.length>0&&<button className="btn" onClick={openMissing}>Assign locations</button>}</section>
    <section className="panel location-browser"><div className="location-browser-head"><div><div className="label">Browse locations</div><h2 style={{fontFamily:'Fraunces,serif',margin:'3px 0 0'}}>Room / Bookcase / Shelf / Box</h2></div><button className="ghost" onClick={()=>printLocationInventory(safe)}>Print inventory</button></div>{tree.children.length?<LocationTreeBranch nodes={tree.children} selectedId={selectedNodeId} onSelect={setSelectedNodeId}/>:<div className="empty"><b>No physical locations yet.</b><div className="small">Add a location in Book Details or assign books here.</div></div>}</section>
    {selectedNode&&<section className="panel location-detail"><div className="location-detail-head"><div><div className="label">{selectedNode.typeLabel}</div><h2 style={{fontFamily:'Fraunces,serif',margin:'3px 0'}}>{selectedNode.field==='shelf'?'Shelf '+selectedNode.label:selectedNode.field==='box'?'Box '+selectedNode.label:selectedNode.label}</h2><div className="small">{selectedNode.copyIds.length} physical {selectedNode.copyIds.length===1?'copy':'copies'} · {locationText({location:selectedNode.path})}</div></div><div className="row-actions"><button className="ghost" onClick={()=>openLibrary(selectedNode.path)}>Open in Library</button><button className="ghost" onClick={()=>printBookReport('Location: '+locationText({location:selectedNode.path}),selectedNode.books,'Physical copy inventory')}>Print</button></div></div><LocationCopyList books={selectedNode.books} allBooks={safe} onEdit={onEdit}/></section>}
    <section className="panel location-workflow" id="location-workflow"><div className="location-workflow-head"><div><div className="label">Everyday workflow</div><h2 style={{fontFamily:'Fraunces,serif',margin:'3px 0'}}>Assign or move books</h2><p className="small" style={{margin:'4px 0 0'}}>Select exact physical copies, then choose their destination.</p></div><div className="location-workflow-modes" role="group" aria-label="Location workflow"><button className={mode==='assign'?'btn':'ghost'} onClick={()=>chooseMode('assign')}>Assign locations</button><button className={mode==='move'?'btn':'ghost'} onClick={()=>chooseMode('move')}>Move books</button></div></div>
      <div className="location-picker"><div><div className="location-candidate-tools"><input className="field" style={{flex:'1 1 180px'}} aria-label="Search physical copies" placeholder="Search title, author, ISBN..." value={query} onChange={event=>setQuery(event.target.value)}/><button className="ghost" onClick={()=>setSelectedCopies(candidateIds)}>Select all ({candidateIds.length})</button><button className="ghost" onClick={()=>setSelectedCopies([])}>Clear</button><button className="ghost" onClick={()=>{setAllCandidates(value=>!value);setSelectedCopies([])}}>{allCandidates?'Show default candidates':'Show all copies'}</button></div><div className="small" style={{marginTop:8}}>{selectedCopies.length} selected · {candidates.length} candidate{candidates.length===1?'':'s'}</div><div className="location-candidates">{candidates.length?candidates.map(book=>{const id=String(book.copyId||book.id),checked=selectedCopies.includes(id);return <label className={'location-candidate '+(checked?'selected':'')} key={id}><input type="checkbox" checked={checked} onChange={()=>toggleCopy(id)} aria-label={'Select '+(book.title||'book')}/><div className="cover-mini">{book.cover?<img loading="lazy" src={book.cover} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<Icon name="book" size={16}/>}</div><span style={{minWidth:0}}><b className="truncate" style={{display:'block'}}>{book.title||'Untitled book'}</b><span className="small truncate" style={{display:'block'}}>{book.authors||'Unknown author'} · {locationText(book)||'No location'}</span></span></label>}):<div className="small">{allCandidates?'No matching physical copies.':mode==='assign'?'All physical copies have a location.':'No located physical copies yet.'}</div>}</div></div>
        <div className="location-destination"><div className="label">Destination</div><p className="small" style={{margin:'4px 0 12px'}}>Choose existing values or type a new one. Partial locations are allowed.</p><LocationDestinationFields books={safe} value={destination} onChange={setDestination} showPosition={selectedCopies.length===1} idPrefix="workflow-location"/>{selectedCopies.length>1&&<p className="small">Each selected copy keeps its current Position; Room, Bookcase, Shelf, and Box are updated.</p>}<button className="btn" style={{marginTop:12}} disabled={!selectedCopies.length||hasMissingLocation({location:destination})} onClick={applySelected}>{mode==='assign'?'Assign':'Move'} {selectedCopies.length||''} {selectedCopies.length===1?'book':'books'}</button></div></div>
    </section>
    <details className="location-advanced"><summary>Advanced location tools</summary><div className="location-advanced-grid"><section className="panel location-advanced-card"><h3>Rename / move entire location</h3><label><div className="label">Source location</div><select className="select" value={adminSource} onChange={event=>selectAdminSource(event.target.value)}><option value="">Choose source...</option>{groups.map(group=><option key={group.id} value={group.id}>{group.label} ({group.books.length})</option>)}</select></label><div style={{marginTop:10}}><LocationDestinationFields books={safe} value={adminDestination} onChange={setAdminDestination} idPrefix="advanced-location"/></div><p className="small">Updates all {sourceGroup?.books.length||0} physical copies at the exact source location. Individual Positions are preserved.</p><div className="row-actions"><button className="btn" disabled={!adminSource||hasMissingLocation({location:adminDestination})} onClick={()=>onRenameLocation(sourceLocation,adminDestination)}>Apply to entire location</button><button className="ghost danger" disabled={!adminSource} onClick={()=>onClearLocation(sourceLocation)}>Clear location from all {sourceGroup?.books.length||0} books here</button></div></section><section className="panel location-advanced-card"><h3>Merge locations</h3><label><div className="label">Source</div><select className="select" value={adminSource} onChange={event=>selectAdminSource(event.target.value)}><option value="">Choose source...</option>{groups.map(group=><option key={group.id} value={group.id}>{group.label} ({group.books.length})</option>)}</select></label><label style={{display:'block',marginTop:10}}><div className="label">Target</div><select className="select" value={adminTarget} onChange={event=>setAdminTarget(event.target.value)}><option value="">Choose target...</option>{groups.filter(group=>group.id!==adminSource).map(group=><option key={group.id} value={group.id}>{group.label} ({group.books.length})</option>)}</select></label><p className="small">Moves {sourceGroup?.books.length||0} physical copies into {targetGroup?.label||'the target location'}. Book records are not merged or deleted.</p><button className="ghost" disabled={!adminSource||!adminTarget} onClick={()=>onMergeLocation(sourceLocation,targetLocation)}>Merge entire source location</button></section></div></details>
  </div>;
}

function ReportsView({books,filteredBooks,setActiveView,setFilters,onExportJSON}){
  const missing=books.filter(b=>needsReview(b,books));const current=filteredBooks&&filteredBooks.length?filteredBooks:books;const [title,setTitle]=useState('Custom Catalog Report');const [subtitle,setSubtitle]=useState('Selected report from The Stacks');const [columns,setColumns]=useState(['title','authors','status','location','collections','tags','rating','isbn']);const toggleCol=id=>setColumns(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);const runCustom=(reportTitle,items,desc)=>printCustomBookReport({title:reportTitle||title,subtitle:desc||subtitle,books:items,columns});const report=(titleText,desc,run,detail)=><div className="report-card"><h3>{titleText}</h3><p>{desc}</p><div className="small">{detail}</div><button className="btn" onClick={run}>Open printable report</button></div>;
  return <div className="workspace"><div className="overline">Reports</div><h1 className="title">Print and export views</h1><p className="subtitle">Generate configurable reports for inventory, cleanup, lending, duplicate review, and the current Library filter.</p><div className="panel panel-pad" style={{marginTop:14}}><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Report options</h2><div className="form-cols"><label><div className="label">Report title</div><input className="field" value={title} onChange={e=>setTitle(e.target.value)}/></label><label><div className="label">Subtitle / notes</div><input className="field" value={subtitle} onChange={e=>setSubtitle(e.target.value)}/></label></div><div className="label" style={{marginTop:12}}>Columns</div><div className="report-options">{REPORT_COLUMNS.map(([id,label])=><label key={id}><input type="checkbox" checked={columns.includes(id)} onChange={()=>toggleCol(id)}/>{label}</label>)}</div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="ghost" onClick={()=>setColumns(['title','authors','status','location','collections','tags','rating','isbn'])}>Standard columns</button><button className="ghost" onClick={()=>setColumns(REPORT_COLUMNS.map(c=>c[0]))}>All columns</button><button className="ghost" onClick={onExportJSON}>Download JSON backup first</button></div></div><div className="report-grid" style={{marginTop:16}}>{report('Full catalog','Printable list of every book using your selected columns.',()=>runCustom(title||'Full Catalog',books,'All catalog records'),books.length+' book'+(books.length===1?'':'s'))}{report('Current Library view','Print the books matched by the current Library filters and smart search.',()=>runCustom(title||'Current Library View',current,'Current filtered set'),current.length+' book'+(current.length===1?'':'s'))}{report('Location inventory','Grouped by room, bookcase, shelf, and box.',()=>printLocationInventory(books),locationGroups(books).length+' location group'+(locationGroups(books).length===1?'':'s'))}{report('Lending report','Current loans, overdue books, and returned loan history.',()=>printLendingReport(books),books.filter(isLentOut).length+' currently lent out')}{report('Missing metadata report','Books that still need review or cleanup.',()=>runCustom('Missing Metadata / Review Report',missing,'Books needing catalog cleanup'),missing.length+' needing review')}{report('Possible duplicate report','Records that may describe the same physical copy.',()=>printDuplicateReport(books),possibleDuplicateGroups(books).length+' possible duplicate group'+(possibleDuplicateGroups(books).length===1?'':'s'))}</div><div className="panel panel-pad" style={{marginTop:18}}><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Jump to related workspaces</h2><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="ghost" onClick={()=>setActiveView('locations')}>Locations</button><button className="ghost" onClick={()=>setActiveView('lending')}>Lending</button><button className="ghost" onClick={()=>setActiveView('duplicates')}>Duplicates</button><button className="ghost" onClick={()=>{setFilters({...defaultFilters,review:'needs'});setActiveView('library')}}>Needs Review in Library</button></div></div></div>;
}

function LendingView({books,onEdit,onReturn}){
  const lent=books.filter(b=>b.lentTo||b.returnedDate).sort((a,b)=>(isOverdue(b)-isOverdue(a))||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));
  const out=lent.filter(isLentOut);
  const overdue=lent.filter(isOverdue);
  return <div className="workspace"><div className="overline">Lending</div><h1 className="title">Loan tracking</h1><p className="subtitle">Track who has a book, when it left, due dates, and returned loans.</p><div className="grid3" style={{marginTop:14}}>{[['Currently lent',out.length],['Overdue',overdue.length],['Loan history',lent.length]].map(([l,v])=><div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div><div className="panel" style={{marginTop:14,overflow:'hidden'}}>{lent.length?lent.map(b=><div key={b.id} className="tr" style={{gridTemplateColumns:'2fr 1.2fr 1fr 1fr auto',display:'grid'}}><button style={{all:'unset',cursor:'pointer',textAlign:'left'}} onClick={()=>onEdit(b)}><b>{b.title}</b><div className="small">{b.authors||'Unknown author'}</div></button><div>{b.lentTo||'-'}</div><div>{b.lentDate||'-'}</div><div>{b.returnedDate?<span className="chip good">Returned {b.returnedDate}</span>:isOverdue(b)?<span className="chip bad">Overdue {b.dueDate}</span>:<span className="chip warn">Due {b.dueDate||'open'}</span>}</div>{isLentOut(b)?<button className="ghost" onClick={()=>onReturn(b.id)}>Mark returned</button>:<span/>}</div>):<div className="empty">No lending records yet. Open a book and fill the Lending section to start tracking loans.</div>}</div></div>
}

function StatsDashboard({books}){
  const total=books.length;
  const read=books.filter(b=>b.status==='read').length;
  const unread=books.filter(b=>b.status==='unread'||b.status==='want').length;
  const lent=books.filter(isLentOut).length;
  const overdue=books.filter(isOverdue).length;
  const needs=books.filter(b=>needsReview(b,books)).length;
  const pages=books.reduce((n,b)=>n+(Number(b.pages)||0)*(Number(b.copyCount)||1),0);
  const copies=books.reduce((n,b)=>n+(Number(b.copyCount)||1),0);
  const byStatus=STATUS.map(([id,l])=>[l,books.filter(b=>b.status===id).length]).filter(([,n])=>n);
  const byRoom=Object.entries(books.reduce((m,b)=>{const r=normalizeLocation(b.location).room||'No room';m[r]=(m[r]||0)+1;return m},{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const byTag=Object.entries(books.flatMap(b=>b.tags||[]).reduce((m,t)=>{m[t]=(m[t]||0)+1;return m},{})).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const byAuthor=Object.entries(books.reduce((m,b)=>{const a=(b.authors||'Unknown').split(',')[0].trim()||'Unknown';m[a]=(m[a]||0)+1;return m},{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max=Math.max(1,...byStatus.map(x=>x[1]),...byRoom.map(x=>x[1]),...byTag.map(x=>x[1]),...byAuthor.map(x=>x[1]));
  const Bars=({title,rows})=><div className="panel panel-pad"><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>{title}</h2>{rows.length?rows.map(([label,value])=><div key={label} style={{margin:'9px 0'}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span className="truncate">{label}</span><b>{value}</b></div><div style={{height:7,background:'#e9f4ff',borderRadius:999,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.max(4,(value/max)*100)}%`,background:'var(--blue)',borderRadius:999}}/></div></div>):<div className="small">No data yet.</div>}</div>;
  return <div className="workspace"><div className="overline">Stats</div><h1 className="title">Catalog dashboard</h1><p className="subtitle">A quick overview of reading status, collection health, locations, tags, and loans.</p><div className="grid3" style={{marginTop:14}}>{[['Books',total],['Copies',copies],['Read',read],['Unread / wanted',unread],['Needs review',needs],['Lent out',lent],['Overdue',overdue],['Known pages',pages]].map(([l,v])=><div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(260px,1fr))',gap:14,marginTop:14}}><Bars title="Reading status" rows={byStatus}/><Bars title="Locations" rows={byRoom}/><Bars title="Top tags" rows={byTag}/><Bars title="Top authors" rows={byAuthor}/></div></div>
}

function EditModal({book,collections,onSave,onDelete,onClose,onPreviewMetadata,onMoveCopy,editionCopyCount=1}){
  const [d,setD]=useState(()=>normalizeBook(book));const [tagDraft,setTagDraft]=useState('');const [colDraft,setColDraft]=useState('');const [coverErr,setCoverErr]=useState(false);const [coverControlsOpen,setCoverControlsOpen]=useState(false);const uploadRef=useRef(null);const modalRef=useRef(null);useModalFocus(true,onClose,modalRef);
  useEffect(()=>{setD(normalizeBook(book));setCoverErr(false);setCoverControlsOpen(false)},[book.id]);
  const shelfOptions=editorShelfOptions(d,collections);const update=(key,value)=>setD(current=>({...current,[key]:value}));const updateLoc=(key,value)=>setD(current=>({...current,location:{...normalizeLocation(current.location),[key]:value}}));
  const addTag=()=>{const value=tagDraft.trim();if(value)setD(current=>({...current,tags:uniq([...(current.tags||[]),value])}));setTagDraft('')};const addCollection=()=>{const value=colDraft.trim();if(value)setD(current=>setBookCollections(current,[...collectionNames(current),value]));setColDraft('')};const toggleCollection=value=>setD(current=>setBookCollections(current,inCollection(current,value)?collectionNames(current).filter(item=>item!==value):[...collectionNames(current),value]));
  const setOpenLibraryCover=()=>{const url=coverUrlFromISBN(d.isbn);if(url){setCoverErr(false);update('cover',url)}};const uploadCover=async event=>{const file=event.target.files?.[0];if(!file)return;try{const data=await compressImageFile(file);if(data){setCoverErr(false);update('cover',data);if(textBytes(data)>COVER_WARN_BYTES)alert('The compressed cover is still large and may increase backup size.');}}catch(error){alert(error?.message||'Could not process cover image');}event.target.value=''};
  const setStatus=value=>setD(current=>{const next={...current,status:value};if(value==='reading'&&!next.startedAt)next.startedAt=todayISO();if(value==='read'){if(!next.finishedAt)next.finishedAt=todayISO();if(!next.readCount)next.readCount=1;}return next;});const field=(label,node,className='')=>{const shownLabel=['Bookcase','Shelf'].includes(label)?label+' *':['Room','Box','Position'].includes(label)?label+' (optional)':label;return <label className={className}><div className="label">{shownLabel}</div>{node}</label>};const location=normalizeLocation(d.location);const publication=[d.publisher,d.year].filter(Boolean).join(' · ');const seriesLabel=d.series?[d.series,d.seriesNumber?'Book '+d.seriesNumber:''].filter(Boolean).join(' · '):'';const reviewHints=reviewReasons(d,[]);
  return <div className="modal-back" onClick={onClose} role="presentation"><div ref={modalRef} className="modal book-detail-modal" role="dialog" aria-modal="true" aria-label="Edit book details" tabIndex="-1" onClick={event=>event.stopPropagation()}>
    <div className="modal-head"><div><div className="overline">Catalog Entry</div><b>Book details</b></div><button className="ghost" onClick={onClose} aria-label="Close book details"><Icon name="x" size={14}/></button></div>
    <div className="modal-body"><header className="book-detail-hero"><div className="book-detail-cover-column"><div className="cover book-detail-cover">{d.cover&&!coverErr?<img loading="lazy" src={d.cover} alt="" onError={()=>setCoverErr(true)}/>:<Icon name="book" size={38}/>}<ReadBadge book={d}/></div><input ref={uploadRef} type="file" accept="image/*" className="sr-only" onChange={uploadCover}/><div className="book-detail-cover-actions"><button type="button" className="ghost book-detail-cover-toggle" aria-expanded={coverControlsOpen} aria-controls="book-detail-cover-action-menu" onClick={()=>setCoverControlsOpen(open=>!open)}>Change cover</button><div id="book-detail-cover-action-menu" className="book-detail-cover-action-menu" hidden={!coverControlsOpen}><button className="ghost" onClick={()=>uploadRef.current?.click()}>Upload cover</button><button className="ghost" disabled={!d.isbn||!isValidISBN(d.isbn)} onClick={setOpenLibraryCover}>Use ISBN cover</button><button className="ghost danger" disabled={!d.cover} onClick={()=>{setCoverErr(false);update('cover','')}}>Remove cover</button></div></div></div><div className="book-detail-identity"><div className="overline">My library record</div><h1>{d.title||'Untitled book'}</h1><div className="book-detail-author">{d.authors||'Unknown author'}</div>{seriesLabel&&<div className="book-detail-series">{seriesLabel}</div>}<PhysicalLocation location={d.location}/><div className="book-detail-publication">{publication||'Publication details not recorded'}<br/><span className="book-detail-isbn">{d.isbn?'ISBN '+d.isbn:'ISBN not recorded'}</span></div>{d.status==='read'&&<span className="chip good book-detail-status"><Icon name="check" size={12}/> Read</span>}</div></header>

      <section className="book-detail-section" aria-labelledby="book-detail-book"><div className="book-detail-section-head"><h2 id="book-detail-book">Book</h2><p>About the work itself.</p></div><div className="book-detail-grid">{field('Title',<input className="field" value={d.title} onChange={event=>update('title',event.target.value)}/>,'book-detail-wide')}{field('Author(s)',<input className="field" value={d.authors} onChange={event=>update('authors',event.target.value)}/>,'book-detail-wide')}{field('Series',<input className="field" value={d.series||''} onChange={event=>update('series',event.target.value)}/>)}{field('Series number',<input className="field" value={d.seriesNumber||''} onChange={event=>update('seriesNumber',event.target.value)} placeholder="1, III, Book One..."/>)}{field('Original publication year',<div><input className="field" inputMode="numeric" maxLength="4" value={d.originalPublicationYear||''} onChange={event=>update('originalPublicationYear',event.target.value)}/><div className="small" style={{marginTop:4}}>First publication of the work.</div></div>)}<fieldset className="book-detail-fieldset book-detail-wide"><legend className="label">Tags</legend><div className="tagbox">{(d.tags||[]).map(tag=><span key={tag} className="chip">{tag}<button style={{all:'unset',cursor:'pointer'}} aria-label={'Remove tag '+tag} onClick={()=>setD(current=>({...current,tags:current.tags.filter(item=>item!==tag)}))}>×</button></span>)}<input value={tagDraft} aria-label="Add tag" onChange={event=>setTagDraft(event.target.value)} onBlur={addTag} onKeyDown={event=>{if(event.key==='Enter'||event.key===','){event.preventDefault();addTag()}}} placeholder="Add tag..."/></div></fieldset>{field('Book notes',<textarea className="field" rows="4" value={d.notes||''} onChange={event=>update('notes',event.target.value)}/>,'book-detail-wide')}</div></section>

      <section className="book-detail-section" aria-labelledby="book-detail-edition"><div className="book-detail-section-head"><h2 id="book-detail-edition">Edition</h2><p>Details of this particular published edition.</p></div><div className="book-detail-grid">{field('ISBN',<input className="field mono" inputMode="numeric" value={d.isbn||''} onChange={event=>update('isbn',normalizeISBN(event.target.value))}/>)}{field('Edition statement',<input className="field" value={d.edition||''} onChange={event=>update('edition',event.target.value)} placeholder="2nd ed., German edition..."/>)}{field('Publisher',<input className="field" value={d.publisher} onChange={event=>update('publisher',event.target.value)}/>)}{field('Publication year',<input className="field" inputMode="numeric" value={d.year} onChange={event=>update('year',event.target.value)}/>)}{field('Translator(s)',<input className="field" value={personListInput(d.translators)} onChange={event=>update('translators',event.target.value)} placeholder="Name; another name"/>)}{field('Editor(s)',<input className="field" value={personListInput(d.editors)} onChange={event=>update('editors',event.target.value)} placeholder="Name; another name"/>)}{field('Language',<input className="field" value={d.language||''} onChange={event=>update('language',event.target.value)} placeholder="English, German..."/>)}{field('Page count',<input className="field" inputMode="numeric" value={d.pages||''} onChange={event=>update('pages',event.target.value)}/>)}{field('Format / binding',<select className="select" value={d.format||''} onChange={event=>update('format',event.target.value)}>{FORMAT_OPTIONS.map(value=><option key={value} value={value}>{value||'Unknown format'}</option>)}</select>)}</div></section>

      <section className="book-detail-section" aria-labelledby="book-detail-copy"><div className="book-detail-section-head"><h2 id="book-detail-copy">My copy</h2><p>Details about this physical book. {editionCopyCount>1?editionCopyCount+' physical copies share this edition.':'This is your physical copy.'}</p></div><div className="book-detail-grid"><fieldset className="book-detail-fieldset book-detail-wide"><legend className="label">Collections</legend><div className="book-detail-choice-list">{shelfOptions.length?shelfOptions.map(collection=><button key={collection} className={'chip '+(inCollection(d,collection)?'good':'gray')} aria-pressed={inCollection(d,collection)} onClick={()=>toggleCollection(collection)}>{collection}</button>):<span className="small">No collections yet.</span>}</div><div className="book-detail-add-row"><input className="field" value={colDraft} aria-label="Add collection" onChange={event=>setColDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addCollection()}}} placeholder="Add collection..."/><button className="ghost" onClick={addCollection}>Add</button></div></fieldset>
      <fieldset className="book-detail-fieldset book-detail-wide"><legend className="label">Physical location</legend><p className="small">Bookcase and Shelf place this physical Copy in your library.</p><div className="book-detail-location">{field('Bookcase',<input className="field" value={location.bookcase} onChange={event=>updateLoc('bookcase',event.target.value)}/>)}{field('Shelf',<input className="field" value={location.shelf} onChange={event=>updateLoc('shelf',event.target.value)}/>)}{field('Position',<input className="field" value={location.position} onChange={event=>updateLoc('position',event.target.value)}/>)}{field('Room',<input className="field" value={location.room} onChange={event=>updateLoc('room',event.target.value)}/>)}{field('Box',<input className="field" value={location.box} onChange={event=>updateLoc('box',event.target.value)}/>)}</div></fieldset>{field('Condition',<select className="select" value={d.condition||''} onChange={event=>update('condition',event.target.value)}>{CONDITION_OPTIONS.map(value=><option key={value} value={value}>{value||'Unknown condition'}</option>)}</select>)}{field('Acquisition date',<input className="field" type="date" value={d.acquisitionDate||''} onChange={event=>update('acquisitionDate',event.target.value)}/>)}{field('Acquired from',<input className="field" value={d.acquisitionSource||''} onChange={event=>update('acquisitionSource',event.target.value)} placeholder="Bookstore, gift, estate..."/>)}{field('Copy notes',<textarea className="field" rows="4" value={d.copyNotes||''} onChange={event=>update('copyNotes',event.target.value)} placeholder="Signed, damaged jacket, replacement copy..."/>,'book-detail-wide')}<fieldset className="book-detail-fieldset book-detail-wide"><legend className="label">Loan status</legend><div className="book-detail-grid">{field('Borrower',<input className="field" value={d.lentTo||''} onChange={event=>update('lentTo',event.target.value)} placeholder="Name..."/>)}{field('Lent date',<input className="field" type="date" value={d.lentDate||''} onChange={event=>update('lentDate',event.target.value)}/>)}{field('Due date',<input className="field" type="date" value={d.dueDate||''} onChange={event=>update('dueDate',event.target.value)}/>)}{field('Returned date',<input className="field" type="date" value={d.returnedDate||''} onChange={event=>update('returnedDate',event.target.value)}/>)}</div><div className="book-detail-loan-actions" style={{marginTop:10}}><button className="ghost" onClick={()=>setD(current=>({...current,lentDate:current.lentDate||todayISO(),returnedDate:''}))}>Mark lent today</button><button className="ghost" onClick={()=>setD(current=>({...current,returnedDate:todayISO()}))}>Mark returned today</button><button className="ghost danger" onClick={()=>setD(current=>({...current,lentTo:'',lentDate:'',dueDate:'',returnedDate:''}))}>Clear loan</button></div></fieldset></div></section>

      <section className="book-detail-section" aria-labelledby="book-detail-reading"><div className="book-detail-section-head"><h2 id="book-detail-reading">Reading</h2><p>Your reading history for this copy.</p></div><div className="book-detail-grid">{field('Reading status',<select className="select" value={d.status} onChange={event=>setStatus(event.target.value)}>{STATUS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>)}<div><div className="label">Rating</div><StarRating value={d.rating} onChange={rating=>update('rating',rating)}/></div>{field('Date started',<input className="field" type="date" value={d.startedAt||''} onChange={event=>update('startedAt',event.target.value)}/>)}{field('Date finished',<input className="field" type="date" value={d.finishedAt||''} onChange={event=>update('finishedAt',event.target.value)}/>)}{field('Read count',<input className="field" type="number" min="0" value={d.readCount||0} onChange={event=>update('readCount',event.target.value)}/>)}{field('Private review / reading notes',<textarea className="field" rows="5" value={d.privateReview||''} onChange={event=>update('privateReview',event.target.value)}/>,'book-detail-wide')}<div className="book-detail-reading-actions book-detail-wide"><button className="ghost" onClick={()=>setD(current=>({...current,status:'read',finishedAt:current.finishedAt||todayISO(),readCount:Math.max(1,Number(current.readCount)||0)}))}>Mark read today</button></div></div></section>

      <details className="book-detail-more"><summary>More details</summary><div className="book-detail-advanced">{field('Cover URL',<input className="field" value={d.cover||''} onChange={event=>{setCoverErr(false);update('cover',event.target.value)}}/>)}<label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={d.reviewed} onChange={event=>update('reviewed',event.target.checked)}/> Reviewed</label>{reviewHints.length>0&&<div><div className="label">Review hints</div><div className="book-detail-review-hints">{reviewHints.map(reason=><span className="chip warn" key={reason}>{reason}</span>)}</div></div>}<div><div className="label">Metadata</div><dl className="book-detail-technical"><div><dt>Source</dt><dd>{d.metadataSource||'Not recorded'}</dd></div><div><dt>Confidence</dt><dd>{d.metadataConfidence||'Not recorded'}</dd></div><div><dt>Match method</dt><dd>{d.metadataMatchMethod||'Not recorded'}</dd></div><div><dt>Metadata updated</dt><dd><time dateTime={d.metadataUpdatedAt||undefined} title={d.metadataUpdatedAt||undefined}>{formatLocalTimestamp(d.metadataUpdatedAt)}</time></dd></div></dl><button className="ghost" style={{marginTop:10}} onClick={()=>onPreviewMetadata?.(d.id)}>Preview metadata</button></div><div><div className="label">Catalog identifiers</div><dl className="book-detail-technical"><div><dt>Work ID</dt><dd><code className="book-detail-id">{d.workId||'Assigned on save'}</code></dd></div><div><dt>Edition ID</dt><dd><code className="book-detail-id">{d.editionId||'Assigned on save'}</code></dd></div><div><dt>Copy ID</dt><dd><code className="book-detail-id">{d.copyId||d.id}</code></dd></div><div><dt>Added</dt><dd><time dateTime={d.addedAt||undefined} title={d.addedAt||undefined}>{formatLocalTimestamp(d.addedAt)}</time></dd></div><div><dt>Updated</dt><dd><time dateTime={d.updatedAt||undefined} title={d.updatedAt||undefined}>{formatLocalTimestamp(d.updatedAt)}</time></dd></div></dl></div><div className="book-detail-danger"><div><b>Danger zone</b><p>Delete only this physical copy from the catalog.</p></div><button className="ghost danger" onClick={()=>onDelete(d.id)}><Icon name="trash" size={13}/> Delete copy</button></div></div></details>
    </div><div className="modal-head modal-foot book-detail-footer"><span className="small">Changes apply when you save.</span><div><button className="ghost" onClick={()=>{if(JSON.stringify(d)!==JSON.stringify(normalizeBook(book))&&!confirm('Discard unsaved changes and move this physical Copy?'))return;onMoveCopy?.(book)}}>Move Copy</button><button className="ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={()=>onSave(d)}><Icon name="save" size={13}/> Save changes</button></div></div>
  </div></div>;
}


function StorageModePanel({storageMode,storageInfo,onEnableIndexedDB,onUseLocalStorage,onRepairIndexedDB,books,collections,savedViews,settings}){
  const perf=storageDiagnostics(books,collections,savedViews,settings);
  const quota=storageInfo?.quota||0;
  const usage=storageInfo?.usage||0;
  const quotaLabel=quota?`${formatBytes(usage)} / ${formatBytes(quota)}`:'not reported by browser';
  const modeLabel=storageMode==='indexeddb'?'Larger Library Mode (IndexedDB)':'Portable localStorage mode';
  const idbOk=idbAvailable();
  return <div className="workspace" style={{paddingTop:0}}><section className="panel panel-pad"><div className="overline">Storage engine</div><h2 style={{fontFamily:'Fraunces,serif',margin:'4px 0 6px'}}>Larger Library Mode</h2><p className="subtitle" style={{marginBottom:14}}>Use IndexedDB for larger catalogs while keeping JSON backup/restore as the safest portable format. Switching modes copies the current in-memory catalog; it does not delete the old storage copy automatically.</p><div className="grid3"><div className="stat"><strong style={{fontSize:18}}>{modeLabel}</strong><span>Current mode</span></div><div className="stat"><strong>{idbOk?'Available':'Unavailable'}</strong><span>IndexedDB</span></div><div className="stat"><strong style={{fontSize:18}}>{quotaLabel}</strong><span>Browser storage estimate</span></div><div className="stat"><strong>{formatBytes(perf.estimate)}</strong><span>localStorage footprint</span></div><div className="stat"><strong>{formatBytes(perf.backupBytes)}</strong><span>JSON backup estimate</span></div><div className="stat"><strong>{perf.embeddedCovers}</strong><span>Embedded covers</span></div></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>{storageMode!=='indexeddb'?<button className="btn" disabled={!idbOk} onClick={onEnableIndexedDB}>Enable Larger Library Mode</button>:<button className="ghost" onClick={onUseLocalStorage}>Copy active catalog to localStorage mode</button>}{storageMode==='indexeddb'&&<button className="ghost" onClick={onRepairIndexedDB}>Rewrite / repair IndexedDB copy</button>}</div><ul className="diagnostic-list"><li>Always download a JSON backup before changing storage mode.</li><li>IndexedDB is better for larger catalogs and cover-heavy records, but the single-file app still needs browser access to this local database.</li><li>localStorage is more portable but has a much smaller practical limit.</li></ul></section></div>}


function WorksView({books,onEdit,onApplyV3,onExportV3,onPrintV3,setActiveView,setFilters}){
  const model=useMemo(()=>buildV3CatalogModel(books),[books]);
  const [query,setQuery]=useState('');
  const [selectedWork,setSelectedWork]=useState(null);
  const needle=query.toLowerCase().trim();
  const works=model.works.filter(w=>!needle||`${w.title} ${w.author} ${w.tags.join(' ')}`.toLowerCase().includes(needle)).slice(0,120);
  const active=selectedWork?model.byWork.get(selectedWork):works[0];
  const editions=active?model.editions.filter(e=>e.workId===active.id):[];
  const copies=active?model.copies.filter(c=>c.workId===active.id):[];
  const unstamped=books.filter(b=>!b?.workId||!b?.editionId||!b?.copyId).length;
  return <div className="workspace"><div className="overline">v3 catalog model</div><h1 className="title">Works, editions, and physical copies</h1><p className="subtitle">This workspace inspects the native catalog model. A work is the intellectual book, an edition is a publication, and a copy is the physical item you own.</p>
    <div className="grid3" style={{marginTop:14}}>{[['Works',model.works.length],['Editions',model.editions.length],['Physical copies',model.copies.length],['Legacy records',unstamped],['Multi-edition works',model.ambiguousWorks.length],['Editions with multiple copies',model.duplicateEditions.length]].map(([label,value])=><div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="backup-card" style={{marginTop:16}}><b>Native catalog model</b><div className="small">The app now stores the catalog as separate Works, Editions, and Physical Copies. The familiar Library list is a view generated from this native model.</div><div className="row-actions"><button className="btn" onClick={onApplyV3}>Rebuild native model</button><button className="ghost" onClick={onExportV3}>Export native model JSON</button><button className="ghost" onClick={onPrintV3}>Print inventory</button><button className="ghost" onClick={()=>setActiveView('duplicates')}>Open duplicate review</button></div></div>
    <div className="grid2" style={{gridTemplateColumns:'minmax(280px,.9fr) minmax(420px,1.4fr)',marginTop:16}}><section className="panel panel-pad"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><h2 style={{fontFamily:'Fraunces,serif',margin:'0'}}>Works</h2><input className="field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter works…" style={{maxWidth:180}}/></div><div style={{display:'grid',gap:6,marginTop:12}}>{works.length?works.map(w=><button key={w.id} className={'tr '+(active?.id===w.id?'active':'')} style={{gridTemplateColumns:'1fr 90px',textAlign:'left'}} onClick={()=>setSelectedWork(w.id)}><span><b>{w.title}</b><div className="small">{w.author||'Unknown author'} · {w.editionIds.length} edition{w.editionIds.length===1?'':'s'} · {w.copyIds.length} cop{w.copyIds.length===1?'y':'ies'}</div></span><span className="chip gray">{Math.round(w.quality||0)}%</span></button>):<div className="empty">No works matched.</div>}</div></section>
      <section className="panel panel-pad">{active?<><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}><div><div className="overline">Selected work</div><h2 style={{fontFamily:'Fraunces,serif',margin:'2px 0'}}>{active.title}</h2><div className="small">{active.author||'Unknown author'} · {active.tags.slice(0,6).join(', ')||'No work tags'}</div></div><button className="ghost" onClick={()=>{setFilters({...defaultFilters,search:`title:"${active.title.replace(/"/g,'')}"`});setActiveView('library')}}>Open in Library</button></div><h3>Editions</h3><div style={{display:'grid',gap:8}}>{editions.map(ed=>{const edCopies=model.copies.filter(c=>c.editionId===ed.id);return <div key={ed.id} className="panel panel-pad" style={{boxShadow:'none'}}><div style={{display:'grid',gridTemplateColumns:'58px 1fr auto',gap:10,alignItems:'center'}}>{ed.cover?<img loading="lazy" src={ed.cover} style={{width:48,height:70,objectFit:'cover',borderRadius:4}}/>:<div className="cover-mini">No cover</div>}<div><b>{ed.signature}</b><div className="small">{[ed.publisher,ed.year,ed.language,ed.format,ed.isbn].filter(Boolean).join(' · ')||'Edition details missing'}</div><div className="small">{edCopies.length} physical cop{edCopies.length===1?'y':'ies'}</div></div><button className="mini-action" onClick={()=>{const b=books.find(x=>ed.bookIds.includes(x.id));if(b)onEdit(b)}}>Edit source</button></div><div style={{marginTop:8,display:'grid',gap:5}}>{edCopies.map(c=><div key={c.id} className="tr" style={{gridTemplateColumns:'1fr 100px 110px'}}><span>{copyLabel(c)}<div className="small">{c.collections.join(', ')||'No collections'}</div></span><span className="small">{statusLabel(c.status)}</span><span>{c.lentTo?<span className={isOverdue({lentTo:c.lentTo,dueDate:c.dueDate,returnedDate:c.returnedDate})?'chip danger':'chip warn'}>{c.lentTo}</span>:<span className="chip gray">Available</span>}</span></div>)}</div></div>})}</div></>:<div className="empty">Select a work to inspect its editions and copies.</div>}</section></div>
    {(model.ambiguousWorks.length>0||model.duplicateEditions.length>0)&&<div className="grid2" style={{marginTop:16}}><section className="panel panel-pad"><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Work / edition decisions</h2>{model.ambiguousWorks.slice(0,8).map(w=><div key={w.id} className="tr" style={{gridTemplateColumns:'1fr 90px'}}><span><b>{w.title}</b><div className="small">{w.editionIds.length} likely editions · {w.copyIds.length} copies</div></span><span className="chip warn">Review</span></div>)}</section><section className="panel panel-pad"><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Same-edition copy groups</h2>{model.duplicateEditions.slice(0,8).map(e=><div key={e.id} className="tr" style={{gridTemplateColumns:'1fr 90px'}}><span><b>{e.title}</b><div className="small">{e.signature}</div></span><span className="chip">{e.copyIds.length} copies</span></div>)}</section></div>}
  </div>;
}

function ResetLibraryModal({onClose,onExport,onConfirm}){
  const modalRef=useRef(null);const [phrase,setPhrase]=useState('');const [busy,setBusy]=useState(false);useModalFocus(true,onClose,modalRef);
  async function reset(){if(phrase.trim()!=='RESET'||busy)return;setBusy(true);const done=await onConfirm();setBusy(false);if(done)onClose();}
  return <div className="modal-back" onClick={busy?undefined:onClose} role="presentation"><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-library-title" tabIndex="-1" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="overline">Library data</div><h2 id="reset-library-title" style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Reset library?</h2></div><button className="ghost" disabled={busy} onClick={onClose} aria-label="Close reset dialog"><Icon name="x" size={14}/></button></div><div className="modal-body"><p>This permanently removes every Work, Edition, and physical Copy from this browser, together with collections and saved views.</p><p className="small">Your appearance and book defaults stay unchanged. A verified safety snapshot is required before any catalog data is removed.</p><button className="ghost" onClick={onExport}>Export JSON backup first</button><label style={{display:'block',marginTop:18}}><div className="label">Type RESET to confirm</div><input className="field" value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off" autoFocus/></label><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18,flexWrap:'wrap'}}><button className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="ghost danger" disabled={phrase.trim()!=='RESET'||busy} onClick={reset}>{busy?'Creating safety snapshot…':'Reset library'}</button></div></div></div></div>;
}

function SampleLibraryModal({onClose,onConfirm}){
  const modalRef=useRef(null);const [busy,setBusy]=useState(false);useModalFocus(true,onClose,modalRef);
  async function load(){if(busy)return;setBusy(true);const done=await onConfirm();setBusy(false);if(done)onClose();}
  return <div className="modal-back" onClick={busy?undefined:onClose} role="presentation"><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="sample-library-title" tabIndex="-1" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="overline">Library data</div><h2 id="sample-library-title" style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Load sample library?</h2></div><button className="ghost" disabled={busy} onClick={onClose} aria-label="Close sample library dialog"><Icon name="x" size={14}/></button></div><div className="modal-body"><p>Add seven sample physical copies so you can explore Library, Collections, reading status, and locations.</p><p className="small">The examples use built-in metadata only. Two copies share one edition to demonstrate the native catalog model.</p><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={load}>{busy?'Loading…':'Load sample library'}</button></div></div></div></div>;
}

function SettingsView({books,collections,settings,setSettings,onExportJSON,onImportJSON,onRestoreSnapshot,onRepair,onRebuildCollections,onClearSavedViews,onDownloadCSV,onDownloadAiMarkdown,onPurgeEmptyCollections,onLoadDemo,onClearDemo,onOpenView,storagePanel}){
  const jsonRef=useRef(null);const [section,setSection]=useState('');const [jsonIntent,setJsonIntent]=useState('restore');const [showReset,setShowReset]=useState(false);const [showSample,setShowSample]=useState(false);
  const chooseJson=intent=>{setJsonIntent(intent);setTimeout(()=>jsonRef.current?.click(),0)};const backupStats=nativeCatalogStats(nativeCatalogFromBookViews(books));const backupHealth=getBackupHealth(settings,backupStats.copies>0);const sampleAllowed=books.length===0;
  function setSetting(k,v){setSettings(s=>normalizeSettings({...s,[k]:v}))}function setDefaultLoc(k,v){setSettings(s=>normalizeSettings({...s,defaultLocation:{...normalizeLocation(s.defaultLocation),[k]:v}}))}const toggle=id=>setSection(current=>current===id?'':id);
  return <><div className="workspace quiet-settings"><input ref={jsonRef} type="file" accept=".json,application/json" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)onImportJSON(f,jsonIntent);e.target.value=''}}/><div className="overline">Settings</div><h1 className="title">Settings</h1><div className="quiet-settings-menu"><button onClick={()=>toggle('appearance')}>Appearance <span>›</span></button><button onClick={()=>toggle('defaults')}>Book defaults <span>›</span></button><button onClick={()=>toggle('backup')}>Backup & restore <span>›</span></button><button onClick={()=>toggle('library-data')}>Library data <span>›</span></button><button onClick={()=>toggle('import')}>Import & export <span>›</span></button><button onClick={()=>toggle('advanced')}>Advanced <span>›</span></button></div>
    {section==='appearance'&&<section className="quiet-settings-section"><label><div className="label">Theme</div><select className="select" value={settings.theme} onChange={e=>setSetting('theme',e.target.value)}><option value="light">Light blue</option><option value="dark">Dark blue</option></select></label></section>}
    {section==='defaults'&&<section className="quiet-settings-section"><div className="form-cols"><label><div className="label">Default status</div><select className="select" value={settings.defaultStatus} onChange={e=>setSetting('defaultStatus',e.target.value)}>{STATUS.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label><label><div className="label">Default collection</div><select className="select" value={settings.defaultCollection||''} onChange={e=>setSetting('defaultCollection',e.target.value)}><option value="">Unshelved</option>{collections.map(c=><option key={c} value={c}>{c}</option>)}</select></label></div><div className="label" style={{marginTop:12}}>Default location</div><div className="form-cols"><input className="field" placeholder="Room" value={normalizeLocation(settings.defaultLocation).room} onChange={e=>setDefaultLoc('room',e.target.value)}/><input className="field" placeholder="Bookcase" value={normalizeLocation(settings.defaultLocation).bookcase} onChange={e=>setDefaultLoc('bookcase',e.target.value)}/><input className="field" placeholder="Shelf" value={normalizeLocation(settings.defaultLocation).shelf} onChange={e=>setDefaultLoc('shelf',e.target.value)}/><input className="field" placeholder="Box" value={normalizeLocation(settings.defaultLocation).box} onChange={e=>setDefaultLoc('box',e.target.value)}/></div></section>}
    {section==='backup'&&<section className="quiet-settings-section"><div className="overline">Backup & Restore</div><h2 style={{fontFamily:'Fraunces,serif',margin:'4px 0'}}>Backup & restore</h2><p className="small">{backupStats.copies} physical cop{backupStats.copies===1?'y':'ies'} · {collections.length} collection{collections.length===1?'':'s'}</p><div className={'backup-health-panel '+backupHealth.tone}><div className="backup-health-grid"><div className="backup-health-item"><span>Portable backup</span><b>{backupHealth.statusLabel}</b></div><div className="backup-health-item"><span>Last backup</span><b>{backupHealth.ageLabel}</b><small>{backupHealth.lastBackupLocal}</small></div><div className="backup-health-item"><label htmlFor="backup-reminder-days">Reminder interval</label><select id="backup-reminder-days" className="select" value={settings.backupReminderDays} onChange={e=>setSetting('backupReminderDays',Number(e.target.value))}><option value="7">Every 7 days</option><option value="14">Every 14 days</option><option value="30">Every 30 days</option><option value="60">Every 60 days</option><option value="0">Off</option></select></div></div><p>{backupHealth.detail}</p><button className="btn" onClick={onExportJSON}>Save backup file</button></div><p className="small">Safety snapshots help recover recent changes in this browser. A JSON backup is the portable copy of your library.</p><hr style={{border:0,borderTop:'1px solid var(--line)',margin:'18px 0'}}/><h2 style={{fontFamily:'Fraunces,serif',margin:'4px 0'}}>Restore from backup</h2><p className="small">The file will be checked before anything is changed.</p><button className="ghost" onClick={()=>chooseJson('restore')}>Choose backup file</button><details style={{marginTop:18}}><summary className="small" style={{cursor:'pointer'}}>Advanced</summary><div className="row-actions" style={{marginTop:10}}><button className="ghost" onClick={onRestoreSnapshot}>Restore last safety snapshot</button></div></details></section>}
    {section==='library-data'&&<section className="quiet-settings-section"><div className="overline">Library data</div><h2 style={{fontFamily:'Fraunces,serif',margin:'4px 0'}}>Manage this browser's catalog</h2><p className="small">Back up, explore with built-in examples, or clear catalog data with explicit safeguards.</p><div className="row-actions"><button className="btn" onClick={onExportJSON}>Export JSON backup</button></div><hr style={{border:0,borderTop:'1px solid var(--line)',margin:'18px 0'}}/><h3 style={{marginBottom:4}}>Sample library</h3><p className="small">Available only while the native catalog has no physical Copies. It adds seven built-in copies without contacting metadata services.</p><button className="ghost" disabled={!sampleAllowed} onClick={()=>setShowSample(true)}>Load sample library</button>{!sampleAllowed&&<p className="small">Remove or reset the current catalog before loading samples.</p>}<hr style={{border:0,borderTop:'1px solid var(--line)',margin:'18px 0'}}/><h3 style={{marginBottom:4,color:'var(--danger)'}}>Danger zone</h3><p className="small">Reset removes catalog records, collections, and saved views. Your settings and the new safety snapshot remain available.</p><button className="ghost danger" onClick={()=>setShowReset(true)}>Reset library</button></section>}
    {section==='import'&&<section className="quiet-settings-section"><div className="label">Backup</div><p className="small">JSON backup is the complete recovery format and can be restored.</p><div className="row-actions"><button className="ghost" onClick={()=>chooseJson('merge')}>Merge a JSON file</button><button className="ghost" onClick={onExportJSON}>Download JSON backup</button></div><div className="label" style={{marginTop:18}}>Export</div><p className="small">Create local files for spreadsheets or AI-assisted library conversations. Exports stay on this device; nothing is uploaded.</p><div className="row-actions"><button className="ghost" onClick={onDownloadCSV}>Export full library CSV</button><button className="ghost" onClick={onDownloadAiMarkdown}>Export for AI (.md)</button></div></section>}
    {section==='advanced'&&<section className="quiet-settings-section"><div className="quiet-advanced-links">{[['Intake Queue','intake'],['Review','review'],['Duplicates','duplicates'],['Quality','quality'],['Locations','locations'],['Reports','reports'],['Lending','lending'],['Works','works'],['Catalog Model','migration'],['Help','help']].map(([label,view])=><button key={view} onClick={()=>onOpenView(view)}>{label}<span>›</span></button>)}</div><div className="row-actions" style={{marginTop:12}}><button className="ghost" onClick={onRepair}>Repair catalog</button><button className="ghost" onClick={onRebuildCollections}>Rebuild collection list</button><button className="ghost" onClick={onPurgeEmptyCollections}>Remove empty collections</button><button className="ghost" onClick={onClearSavedViews}>Clear saved views</button></div>{storagePanel}</section>}
  </div>{showReset&&<ResetLibraryModal onClose={()=>setShowReset(false)} onExport={onExportJSON} onConfirm={onClearDemo}/>} {showSample&&<SampleLibraryModal onClose={()=>setShowSample(false)} onConfirm={()=>onLoadDemo(true)}/>}</>;
}


function MigrationPlanReport({plan}){if(!plan)return <div className="empty">Inspect the current native model to see Works, Editions, and Physical Copies.</div>;const stats=[['Current records',plan.currentRecords],['Planned works',plan.plannedWorks],['Planned editions',plan.plannedEditions],['Planned physical copies',plan.plannedCopies],['Possible duplicate groups',plan.duplicateGroups],['Ambiguous works',plan.ambiguousWorks],['Editions with multiple copies',plan.duplicateEditionRecords],['Manual review items',plan.manualReviewItems],['Schema issues',plan.schemaIssues.length]];return <div style={{display:'grid',gap:14}}><div className="grid3">{stats.map(([label,value])=><div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>{plan.schemaIssues.length>0&&<section className="panel panel-pad" style={{background:'rgba(245,158,11,.08)'}}><h3 style={{marginTop:0}}>Schema warnings before migration</h3><ul className="small">{plan.schemaIssues.slice(0,10).map(x=><li key={x}>{x}</li>)}</ul>{plan.schemaIssues.length>10&&<div className="small">+ {plan.schemaIssues.length-10} more issue{plan.schemaIssues.length-10===1?'':'s'} in exported report.</div>}</section>}<div className="grid2"><section className="panel panel-pad"><h3 style={{marginTop:0}}>Largest planned works</h3>{plan.topWorks.length?plan.topWorks.map(w=><div key={w.key} className="tr" style={{gridTemplateColumns:'1fr 70px 70px 70px'}}><span><b>{w.title}</b><div className="small">{w.author||'Unknown author'}</div></span><span className="mono small">{w.records} rec.</span><span className="mono small">{w.editions} ed.</span><span className="mono small">{w.copies} copy</span></div>):<div className="small">No work groups found.</div>}</section><section className="panel panel-pad"><h3 style={{marginTop:0}}>Records needing manual review</h3>{plan.manualReviewSamples.length?plan.manualReviewSamples.map(x=><div key={x.id+'-'+x.reason} className="tr" style={{gridTemplateColumns:'1fr 1.2fr'}}><span>{x.title}</span><span className="small">{x.reason}</span></div>):<div className="small">No obvious manual-review problems.</div>}</section></div>{(plan.ambiguousWorkSamples.length>0||plan.duplicateEditionSamples.length>0)&&<div className="grid2"><section className="panel panel-pad"><h3 style={{marginTop:0}}>Possible work / edition decisions</h3>{plan.ambiguousWorkSamples.length?plan.ambiguousWorkSamples.map(w=><div key={w.key} className="tr" style={{gridTemplateColumns:'1fr 80px'}}><span><b>{w.title}</b><div className="small">{w.records} records across {w.editions} likely editions</div></span><span className="chip warn">Review</span></div>):<div className="small">No ambiguous works detected.</div>}</section><section className="panel panel-pad"><h3 style={{marginTop:0}}>Editions with multiple physical copies</h3>{plan.duplicateEditionSamples.length?plan.duplicateEditionSamples.map(e=><div key={e.key} className="tr" style={{gridTemplateColumns:'1fr 80px'}}><span><b>{e.title}</b><div className="small">{e.records} records · {e.isbn||[e.publisher,e.year].filter(Boolean).join(', ')||'no ISBN'}</div></span><span className="chip">{e.copies} copies</span></div>):<div className="small">No editions with multiple physical copies detected.</div>}</section></div>}</div>}
function MigrationSafetyPanel({books,collections,savedViews,settings,onCreateBackup,onRestoreBackup,onExportPlan,backupInfo}){const [plan,setPlan]=useState(null);const currentPlan=()=>buildPreV3MigrationPlan(books,collections);const runCurrent=()=>setPlan(currentPlan());const runDemo=()=>setPlan(buildPreV3MigrationPlan(makeDemoBooks(),['Favorites','Science Fiction','Reference','Fantasy']));return <div className="workspace"><div className="overline">Native catalog safety</div><h1 className="title">Work / Edition / Copy catalog model</h1><p className="subtitle">The catalog now uses Work → Edition → Physical Copy storage natively. This panel remains as a safety and diagnostics area for rebuilding, exporting, and backing up the model.</p><div className="backup-card" style={{marginTop:14}}><b>Model backup status</b><div className="small">{backupInfo?`Latest local model backup: ${new Date(backupInfo.createdAt).toLocaleString()} · ${backupInfo.records} records · v${backupInfo.version}`:'No local model backup saved yet.'}</div><div className="row-actions"><button className="btn" onClick={onCreateBackup}>Create model backup</button><button className="ghost" onClick={runCurrent}>Inspect current catalog</button><button className="ghost" onClick={()=>onExportPlan(plan||currentPlan())}>Export model report</button><button className="ghost" onClick={runDemo}>Preview demo model</button>{backupInfo&&<button className="ghost danger" onClick={onRestoreBackup}>Rollback to local model backup</button>}</div></div><div className="panel panel-pad" style={{marginTop:16}}><h2 style={{marginTop:0,fontFamily:'Fraunces,serif'}}>Model audit</h2><MigrationPlanReport plan={plan}/></div><div className="panel panel-pad" style={{marginTop:16}}><h2 style={{marginTop:0,fontFamily:'Fraunces,serif'}}>How the native model is structured</h2><div className="grid3">{[['Work','The intellectual book: title, main author, work-level notes and tags.'],['Edition','A publication: ISBN, publisher, year, language, format, cover, pages.'],['Physical copy','The item you own: location, condition, lending, acquisition, copy notes.']].map(([h,t])=><div className="stat" key={h}><strong style={{fontSize:16}}>{h}</strong><span style={{textTransform:'none',letterSpacing:0,fontFamily:'DM Sans'}}>{t}</span></div>)}</div></div></div>}


function HelpView({setActiveView,setFilters,onOpenCommand}){
  const searchExamples=['status:read rating>=4','tag:chemistry room:office','cover:missing review:needs','lent:overdue','author:"Ursula Le Guin"','-tag:archive location:missing','series:Discworld','subject:anthropology','physical-shelf:3','translator:"Edith Grossman"','editor:"Robert Silverberg"'];
  const goView=(name,view,filters)=> <button className="ghost" onClick={()=>{if(filters)setFilters({...defaultFilters,...filters});setActiveView(view)}}>{name}</button>;
  return <div className="workspace"><div className="overline">Phase 7</div><h1 className="title">Help, shortcuts, and metadata control</h1><p className="subtitle">Use this page as the in-app guide for the catalog model, daily actions, keyboard shortcuts, and smarter search.</p>
    <div className="grid2" style={{marginTop:16}}><section className="panel panel-pad"><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Recommended workflow</h2><ol className="small" style={{lineHeight:1.8,marginTop:8}}><li><b>Scan</b> or manually create entries.</li><li>Use <b>Intake</b> to bulk assign collections, status, locations, and review state.</li><li>Use <b>Review</b> to fix incomplete records.</li><li>Use <b>Library</b> for filtering, saved views, and bulk edits.</li><li>Use <b>Duplicates</b>, <b>Tags</b>, and <b>Settings</b> for cleanup.</li><li>Export a JSON backup before major changes.</li><li>Use <b>Settings → Larger Library Mode</b> for large catalogs or cover-heavy collections.</li></ol><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>{goView('Dashboard','dashboard')}{goView('Open Scan','scan')}{goView('Intake Queue','intake')}{goView('Open Library','library')}{goView('Locations','locations')}{goView('Reports','reports')}{goView('Quality','quality')}{goView('Needs Review','library',{review:'needs'})}{goView('Duplicates','duplicates')}{goView('Catalog Model','migration')}{goView('Settings','settings')}</div></section>
    <section className="panel panel-pad"><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Keyboard shortcuts</h2><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>{[['Ctrl/⌘ K','Command palette'],['↑ / ↓','Navigate command results'],['Enter','Run selected command'],['Shift ?','Open Help'],['N','New manual book'],['S','Scan workspace'],['L','Library workspace'],['Esc','Close modal / palette']].map(([k,v])=><div key={k} className="stat"><strong className="mono" style={{fontSize:15}}>{k}</strong><span>{v}</span></div>)}</div><button className="btn" style={{marginTop:12}} onClick={onOpenCommand}>Open command palette</button></section></div>
    <div className="panel panel-pad" style={{marginTop:16}}><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Smart search examples</h2><p className="small">Search works in the sidebar, Bookcase, and Library filter. Ordinary searches ignore capitalization and are forgiving about accents, punctuation, and small spelling mistakes. Structured filters remain precise. Combine normal words with field operators, use quotes for phrases, and prefix a token with <b>-</b> to exclude it.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{searchExamples.map(ex=><button key={ex} className="chip" onClick={()=>{setActiveView('library');setFilters({...defaultFilters,query:ex})}}>{ex}</button>)}</div><div className="small" style={{marginTop:12,lineHeight:1.7}}>Supported fields include <b>status</b>, <b>tag / subject</b>, <b>collection</b> (legacy <b>shelf</b>), <b>room</b>, <b>bookcase</b>, <b>physical-shelf</b>, <b>box</b>, <b>author</b>, <b>title</b>, <b>series</b>, <b>translator</b>, <b>editor</b>, <b>publisher</b>, <b>isbn</b>, <b>year</b>, <b>rating</b>, <b>format</b>, <b>language</b>, <b>review</b>, <b>lent</b>, <b>cover</b>, <b>location</b>, <b>quality</b>, <b>work</b>, <b>source</b>, and <b>notes</b>. Use <b>physical-shelf:</b> for a physical location; <b>shelf:</b> continues to mean Collection for saved-search compatibility.</div></div>
    <div className="panel panel-pad" style={{marginTop:16}}><h2 style={{fontFamily:'Fraunces,serif',marginTop:0}}>Catalog model</h2><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(160px,1fr))',gap:10}}>{[['Collections','Curated collections you choose manually.'],['Tags','Flexible labels for topics and notes.'],['Status','Reading workflow such as Read or Currently reading.'],['Location','Where the physical copy actually lives.']].map(([h,t])=><div className="stat" key={h}><strong style={{fontSize:16}}>{h}</strong><span style={{textTransform:'none',letterSpacing:0,fontFamily:'DM Sans'}}>{t}</span></div>)}</div></div></div>
}

function CommandPalette({open,onClose,books,collections,setActiveView,setFilters,setSearch,onAddManual,onExportJSON,onEdit}){
  const [q,setQ]=useState('');
  const [activeIndex,setActiveIndex]=useState(0);
  const inputRef=useRef(null);
  const modalRef=useRef(null);
  useModalFocus(open,onClose,modalRef);
  useEffect(()=>{if(open){setActiveIndex(0);setTimeout(()=>inputRef.current?.focus(),30)}},[open]);
  const openView=(id,label)=>({label:'Open '+label,detail:'Workspace',run:()=>setActiveView(id)});
  const actions=[openView('dashboard','Dashboard'),openView('scan','Scan'),openView('intake','Intake Queue'),openView('library','Library'),openView('bookcase','Bookcase'),openView('works','Works'),openView('locations','Locations'),openView('reports','Reports'),openView('review','Review'),openView('duplicates','Duplicates'),openView('quality','Quality'),openView('lending','Lending'),openView('stats','Stats'),openView('tags','Tags'),openView('settings','Settings'),openView('migration','Catalog Model'),openView('help','Help'),{label:'Add book manually',detail:'Create a new catalog entry',run:onAddManual},{label:'Export JSON backup',detail:'Full-fidelity local backup',run:onExportJSON},{label:'Clear search and filters',detail:'Reset Library and sidebar search',run:()=>{setSearch('');setFilters(defaultFilters);setActiveView('library')}},...BUILTIN_VIEWS.map(v=>({label:'Quick view: '+v.name,detail:'Library saved filter',run:()=>{setFilters({...defaultFilters,...v.filters});setActiveView('library')}}))];
  const needle=String(q||'').toLowerCase();
  const actionRows=actions.filter(a=>!needle||(a.label+' '+a.detail).toLowerCase().includes(needle)).map(a=>({...a,type:'Action'}));
  const bookRows=needle.length>1?books.filter(b=>matches(b,q,books)).slice(0,8).map(b=>({label:b.title,detail:[b.authors,statusLabel(b.status),locationText(b)].filter(Boolean).join(' · '),type:'Book',run:()=>onEdit(b)})):[];
  const rows=[...actionRows,...bookRows].slice(0,16);
  useEffect(()=>{setActiveIndex(i=>Math.min(Math.max(0,i),Math.max(0,rows.length-1)))},[q,rows.length]);
  const run=row=>{if(!row)return;row.run();setQ('');onClose();};
  const onKey=e=>{
    if(e.key==='ArrowDown'){e.preventDefault();setActiveIndex(i=>rows.length?Math.min(rows.length-1,i+1):0);return;}
    if(e.key==='ArrowUp'){e.preventDefault();setActiveIndex(i=>rows.length?Math.max(0,i-1):0);return;}
    if(e.key==='Home'){e.preventDefault();setActiveIndex(0);return;}
    if(e.key==='End'){e.preventDefault();setActiveIndex(Math.max(0,rows.length-1));return;}
    if(e.key==='Escape'){e.preventDefault();onClose();return;}
    if(e.key==='Enter'&&rows[activeIndex]){e.preventDefault();run(rows[activeIndex]);}
  };
  if(!open)return null;
  return <div className="modal-back" onClick={onClose} role="presentation"><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label="Command palette" tabIndex="-1" style={{maxWidth:720}} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="overline">Command Palette</div><h2 style={{fontFamily:'Fraunces,serif',margin:'2px 0 0'}}>Jump anywhere</h2></div><button className="ghost" onClick={onClose} aria-label="Close command palette"><Icon name="x" size={14}/></button></div><div className="modal-body"><input ref={inputRef} className="field" value={q} onChange={e=>{setQ(e.target.value);setActiveIndex(0)}} onKeyDown={onKey} placeholder="Type a command, view, smart search, or book title…" aria-label="Search commands and books" aria-controls="command-results" aria-activedescendant={rows[activeIndex]?'command-'+activeIndex:undefined}/><div className="small" style={{margin:'8px 0 12px'}}>Use <span className="kbd">↑</span> <span className="kbd">↓</span> and <span className="kbd">Enter</span>. Try <b>review:needs</b>, <b>cover:missing</b>, <b>lent:overdue</b>, or <b>rating&gt;=4</b>.</div><div id="command-results" role="listbox" aria-label="Command results" style={{display:'grid',gap:6}}>{rows.length?rows.map((row,i)=><button key={row.type+'-'+row.label+'-'+i} id={'command-'+i} role="option" aria-selected={i===activeIndex} className={'tr command-row '+(i===activeIndex?'active':'')} style={{gridTemplateColumns:'90px 1fr',textAlign:'left'}} onMouseEnter={()=>setActiveIndex(i)} onClick={()=>run(row)}><span className="chip gray">{row.type}</span><span><b>{row.label}</b><div className="small">{row.detail}</div></span></button>):<div className="empty">No commands or books matched.</div>}</div></div></div></div>
}


function IdentificationAssistant({book,onClose,onSearch,onRetryISBN,onApply,onEditManually}){
  const modalRef=useRef(null),requestRef=useRef(0);useModalFocus(true,onClose,modalRef);
  const knownTitle=!isIdentificationPlaceholderTitle(book?.title)&&String(book?.title||'').trim()?book.title:'';
  const knownAuthor=/^(Unknown author|Author unknown)$/i.test(String(book?.authors||'').trim())?'':String(book?.authors||'');
  const [title,setTitle]=useState(knownTitle),[author,setAuthor]=useState(knownAuthor),[candidates,setCandidates]=useState([]),[state,setState]=useState('initial'),[message,setMessage]=useState('Search by title and, optionally, author.');
  useEffect(()=>{setTitle(knownTitle);setAuthor(knownAuthor);setCandidates([]);setState('initial');setMessage('Search by title and, optionally, author.');requestRef.current++;return()=>{requestRef.current++;};},[book?.id]);
  async function run(loader,searchingMessage){
    const request=++requestRef.current;setState('searching');setMessage(searchingMessage);setCandidates([]);
    try{const found=await loader();if(request!==requestRef.current)return;setCandidates(found||[]);setState(found?.length?'results':'empty');setMessage(found?.length?'Possible matches':'No matching editions found.');}
    catch{if(request!==requestRef.current)return;setState('empty');setMessage('No matching editions found.');}
  }
  function submit(event){event?.preventDefault();if(!hasMeaningfulIdentificationTitle(title)){setState('invalid');setMessage('Enter at least 3 meaningful title characters.');return;}run(()=>onSearch({title,author}),'Searching library catalogs…');}
  function retryISBN(){if(!book?.isbn||!isValidISBN(book.isbn)){setState('invalid');setMessage('This copy does not have a valid ISBN to retry.');return;}run(()=>onRetryISBN(book.isbn),'Retrying exact ISBN lookup…');}
  const isbn=book?.isbn&&isValidISBN(book.isbn)?toISBN13(book.isbn):String(book?.isbn||'');const busy=state==='searching';
  return <div className="modal-back" onClick={onClose} role="presentation"><div ref={modalRef} className="modal identification-modal" role="dialog" aria-modal="true" aria-label="Identify this book" aria-busy={busy} tabIndex="-1" onClick={event=>event.stopPropagation()}>
    <div className="modal-head"><div><div className="overline">Needs identification</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Identify this book</h2></div><button className="ghost" onClick={onClose} aria-label="Close identification assistant"><Icon name="x" size={14}/></button></div>
    <div className="modal-body"><div className="identification-current"><div className="identification-current-cover">{book?.cover?<img src={book.cover} alt=""/>:<Icon name="book" size={26}/>}</div><div><h3>{book?.title||'Unknown book'}</h3><p>{book?.authors||'Author unknown'}{book?.publisher?' · '+book.publisher:''}</p><p>{isbn?'ISBN '+isbn:'No ISBN recorded'}{locationText(book)?' · '+locationText(book):''}</p></div></div>
      <form className="identification-search-form" onSubmit={submit}><label><div className="label">Title</div><input className="field" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Book title" autoFocus/></label><label><div className="label">Author (optional)</div><input className="field" value={author} onChange={event=>setAuthor(event.target.value)} placeholder="Author name"/></label><button className="btn" type="submit" disabled={busy}>Search</button></form>
      <div className="identification-search-actions"><button className="ghost" onClick={retryISBN} disabled={busy||!isbn}>Retry ISBN lookup</button><span className="small">Search runs only when you choose an action.</span></div>
      <div className="identification-status" aria-live="polite">{busy?<><span className="spinner" aria-hidden="true"></span> {message}</>:message}{state==='empty'&&<p className="small">Try a shorter title, another author spelling, or edit the book manually.</p>}</div>
      {candidates.length>0&&<div className="identification-results" aria-label="Possible matches">{candidates.map((candidate,index)=>{const candidateIsbn=normalizedCandidateIsbns(candidate)[0]||'';const publication=[candidate.publisher,candidate.year].filter(Boolean).join(' · ');const details=[candidate.edition,candidate.format,candidate.language,candidate.pages&&candidate.pages+' pages',candidate.series&&'Series: '+candidate.series+(candidate.seriesNumber?' · Book '+candidate.seriesNumber:''),candidate.originalPublicationYear&&'Original publication: '+candidate.originalPublicationYear,(candidate.translators||[]).length&&'Translator(s): '+personListInput(candidate.translators),(candidate.editors||[]).length&&'Editor(s): '+personListInput(candidate.editors)].filter(Boolean);return <article className="identification-candidate" key={candidate.candidateId||identificationCandidateKey(candidate,index)}><div className="identification-candidate-cover">{candidate.cover?<img loading="lazy" src={candidate.cover} alt=""/>:<Icon name="book" size={22}/>}</div><div className="identification-candidate-copy"><h3>{candidate.title||'Untitled edition'}</h3><div className="identification-candidate-author">{candidate.authors||'Author not listed'}</div><div className="identification-candidate-meta">{publication||'Publication details not listed'}{candidate.edition?<><br/>{candidate.edition}</>:null}{candidateIsbn?<><br/>ISBN {candidateIsbn}</>:null}</div><div className="identification-candidate-source">Source: {candidate.metadataSource||'Library catalog'}</div>{details.length>0&&<details><summary>Details</summary><div>{details.join(' · ')}</div></details>}</div><button className="btn" onClick={()=>onApply(candidate)} aria-label={'Use this edition: '+(candidate.title||'Untitled edition')+(publication?', '+publication:'')}>Use this edition</button></article>})}</div>}
      <div className="identification-footer"><button className="ghost" onClick={onClose}>Cancel</button><button className="ghost" onClick={onEditManually}>Edit manually</button></div>
    </div>
  </div></div>;
}

function MetadataPreviewModal({preview,onCancel,onApply}){
  const modalRef=useRef(null);
  useModalFocus(!!preview,onCancel,modalRef);
  const [selected,setSelected]=useState([]);
  const [candidateIndex,setCandidateIndex]=useState(0);
  const candidates=preview?.candidates?.length?preview.candidates:(preview?.meta?[preview.meta]:[]);
  useEffect(()=>{if(preview){setCandidateIndex(0);const first=(preview.candidates?.[0]||preview.meta);setSelected(defaultMetadataFields(preview.book,first||{}));}},[preview?.id]);
  if(!preview)return null;
  const {book}=preview;const meta=candidates[candidateIndex]||preview.meta||{};
  const toggle=f=>setSelected(p=>p.includes(f)?p.filter(x=>x!==f):[...p,f]);
  const chooseAll=()=>setSelected(replaceableMetadataFields(meta));
  const chooseMissing=()=>setSelected(defaultMetadataFields(book,meta));
  const chooseCandidate=i=>{setCandidateIndex(i);setSelected(defaultMetadataFields(book,candidates[i]||{}));};
  const sourceBits=[meta.metadataSource||'Unknown source',meta.metadataConfidence?'Confidence: '+meta.metadataConfidence:'',meta.metadataMatchMethod||'',meta.candidateScore!==undefined?'Score: '+meta.candidateScore:''].filter(Boolean).join(' · ');
  return <div className="modal-back" onClick={onCancel} role="presentation"><div ref={modalRef} className="modal" style={{maxWidth:980}} role="dialog" aria-modal="true" aria-label="Metadata preview" tabIndex="-1" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><div><div className="overline">Metadata candidate search</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Choose source, then fields</h2><div className="small">{sourceBits}</div></div><button className="ghost" onClick={onCancel} aria-label="Close metadata preview"><Icon name="x" size={14}/></button></div>
    <div className="modal-body"><p className="subtitle" style={{marginTop:0}}>Review possible matches from available sources. Pick the best candidate, then choose exactly which fields should update this record.</p>
      {candidates.length>1&&<div className="panel panel-pad" style={{boxShadow:'none',marginBottom:14}}><b>Candidate matches</b><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:8,marginTop:10}}>{candidates.map((cand,i)=><button key={(cand.metadataSource||'source')+'-'+i} className={i===candidateIndex?'btn':'ghost'} onClick={()=>chooseCandidate(i)} style={{textAlign:'left',alignItems:'stretch',justifyContent:'flex-start',whiteSpace:'normal'}}><span style={{display:'block',fontWeight:700}}>{cand.title||'Untitled match'}</span><span className="small" style={{display:'block'}}>{cand.authors||'Unknown author'}</span><span className="small" style={{display:'block'}}>{cand.metadataSource||'Unknown'} · {cand.year||'no year'} · {cand.candidateFields||0} fields</span><span className="chip gray" style={{marginTop:6,display:'inline-flex'}}>Score {cand.candidateScore||0}</span></button>)}</div></div>}
      <div style={{display:'grid',gridTemplateColumns:'150px 1fr 1fr 90px',gap:8,alignItems:'stretch'}}>
        <div className="th" style={{display:'contents'}}><div>Field</div><div>Current</div><div>Selected candidate</div><div>Use</div></div>
        {METADATA_FIELD_DEFS.map(([field,label])=>{const cur=field==='tags'?(book.tags||[]):book[field];const found=metaValue(meta,field);const has=metadataHasValue(found);const checked=selected.includes(field);return <React.Fragment key={field}><div className="tr" style={{display:'contents'}}><div style={{padding:8,fontWeight:700}}>{label}</div><div style={{padding:8,overflowWrap:'anywhere'}}>{field==='cover'&&cur?<img loading="lazy" src={cur} style={{width:45,height:65,objectFit:'cover',display:'block',marginBottom:4}}/>:null}<span className="small">{metadataFieldDisplay(cur)||'—'}</span></div><div style={{padding:8,overflowWrap:'anywhere'}}>{field==='cover'&&found?<img loading="lazy" src={found} style={{width:45,height:65,objectFit:'cover',display:'block',marginBottom:4}}/>:null}<span className={has?'small':'small muted'}>{metadataFieldDisplay(found)||'No suggestion'}</span></div><div style={{padding:8}}><input type="checkbox" disabled={!has} checked={checked&&has} onChange={()=>toggle(field)} aria-label={'Use '+label}/></div></div></React.Fragment>})}
      </div>
      <div className="panel panel-pad" style={{marginTop:14,boxShadow:'none'}}><b>Recommended:</b> use <b>Fill missing fields</b> unless you intentionally want to replace manual edits. Candidate scores are guidance, not a guarantee.</div>
      <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:16,flexWrap:'wrap'}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="ghost" onClick={chooseMissing}>Select missing only</button><button className="ghost" onClick={chooseAll}>Select all found</button></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="ghost" onClick={onCancel}>Cancel</button><button className="ghost" onClick={()=>onApply('missing',[],meta)}>Fill missing fields</button><button className="btn" disabled={!selected.length} onClick={()=>onApply('selected',selected,meta)}>Apply selected fields</button></div></div>
    </div>
  </div></div>;
}

function ImportPreviewModal({preview,onCancel,onApply}){
  const modalRef=useRef(null);
  useModalFocus(!!preview,onCancel,modalRef);
  if(!preview)return null;
  if(preview.restoreOnly){const b=preview.backup||{};const n=b.stats||{};return <div className="modal-back" onClick={onCancel} role="presentation"><div ref={modalRef} className="modal" style={{maxWidth:620}} role="dialog" aria-modal="true" aria-label="Restore backup preview" tabIndex="-1" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="overline">Backup found</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Restore backup</h2></div><button className="ghost" onClick={onCancel} aria-label="Close restore preview"><Icon name="x" size={14}/></button></div><div className="modal-body"><div className="small">Created: <b>{b.createdAt?new Date(b.createdAt).toLocaleString():'Not recorded'}</b></div><div className="small">Version: <b>{b.version||'Older supported backup'}</b></div><div className="grid3" style={{marginTop:14}}>{[['Works',n.works||0],['Editions',n.editions||0],['Physical copies',n.copies||0],['Collections',preview.replacePayload.collections.length]].map(([label,value])=><div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="panel panel-pad" style={{marginTop:14,boxShadow:'none'}}><div className="small">✓ Backup structure valid</div><div className="small">✓ {b.legacy?'Older The Stacks backup — it will be upgraded during restore.':'Native catalog found'}</div><div className="small">✓ Relationships valid</div></div><p className="small">Nothing has been changed yet. Restoring first creates a local safety snapshot, then replaces this catalog.</p><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}><button className="ghost" onClick={onCancel}>Cancel</button><button className="btn" onClick={()=>onApply('restore')}>Restore this backup</button></div></div></div></div>;}
  const rows=[['Incoming records',preview.incoming],['New on merge',preview.add],['Same copy ID',preview.matchCounts?.copy||0],['Same edition / ISBN',preview.matchCounts?.edition||0],['Same work',preview.matchCounts?.work||0],['Duplicates inside file',preview.internal],['Invalid ISBNs',preview.invalid],['Need review after import',preview.needsReview]];
  const replaceDanger=preview.kind==='JSON backup'||preview.kind==='JSON restore';
  return <div className="modal-back" onClick={onCancel} role="presentation"><div ref={modalRef} className="modal" style={{maxWidth:680}} role="dialog" aria-modal="true" aria-label="Import preview" tabIndex="-1" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><div><div className="overline">Safe import preview</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>{preview.kind}</h2></div><button className="ghost" onClick={onCancel} aria-label="Close import preview"><Icon name="x" size={14}/></button></div>
    <div className="modal-body"><p className="subtitle" style={{marginTop:0}}>Nothing has been changed yet. Review the counts, then choose whether to merge only clearly new records or replace the local catalog.</p>
      <div className="grid3" style={{marginTop:14}}>{rows.map(([label,value])=><div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      <div className="panel panel-pad" style={{marginTop:14,boxShadow:'none'}}><div className="small"><b>Merge</b> keeps your current catalog and adds only records that do not match an existing physical copy, edition/ISBN, or work/title+author. <b>Replace</b> overwrites the current local catalog with the file contents after creating a safety snapshot.</div>
      <div className="small" style={{marginTop:8}}>If you are importing intentional extra physical copies, scan them or add them after import so each copy gets its own copy record and location.</div>
      <div className="small" style={{marginTop:8}}>Estimated local storage after merge: <b>{formatBytes(preview.storageAfterMerge)}</b> ({storagePercentAfter(preview.storageAfterMerge)}% of a conservative 5 MB browser limit). Replace estimate: <b>{formatBytes(preview.storageAfterReplace)}</b>.</div>
      {preview.hasSettings&&<div className="small" style={{marginTop:8}}>This file contains settings. Settings are restored only when you choose Replace.</div>}
      {preview.hasSavedViews&&<div className="small" style={{marginTop:8}}>This file contains saved views. Saved views are restored only when you choose Replace.</div>}</div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16,flexWrap:'wrap'}}><button className="ghost" onClick={onCancel}>Cancel</button><button className="ghost" disabled={!preview.add} onClick={()=>onApply('merge')}>Merge {preview.add} new</button><button className={replaceDanger?'ghost danger':'btn'} onClick={()=>onApply('replace')}>Replace catalog</button></div>
    </div>
  </div></div>;
}

function makeDemoBooks(){
  const now=new Date().toISOString();
  return [
    normalizeBook({title:'The Left Hand of Darkness',authors:'Ursula K. Le Guin',year:'1969',publisher:'Ace Books',isbn:'9780441478125',status:'read',rating:5,tags:['science fiction','classic'],collections:['Favorites','Science Fiction'],location:{room:'Office',bookcase:'North wall',shelf:'2'},reviewed:true,finishedAt:'2025-02-11',readCount:1,cover:coverUrlFromISBN('9780441478125'),demo:true,addedAt:now}),
    normalizeBook({title:'Gödel, Escher, Bach',authors:'Douglas R. Hofstadter',year:'1979',publisher:'Basic Books',isbn:'9780465026562',status:'reading',rating:4,tags:['logic','mathematics'],collections:['Reference'],location:{room:'Office',bookcase:'Desk shelf',shelf:'1'},reviewed:true,startedAt:todayISO(),cover:coverUrlFromISBN('9780465026562'),demo:true,addedAt:now}),
    normalizeBook({title:'Unknown demo book',authors:'',isbn:'',status:'unread',tags:['needs cleanup'],collections:['To Process'],location:blankLocation(),reviewed:false,demo:true,addedAt:now}),
    normalizeBook({title:'The Hobbit',authors:'J. R. R. Tolkien',year:'1937',publisher:'George Allen & Unwin',isbn:'9780547928227',status:'want',tags:['fantasy'],collections:['Fantasy'],location:{room:'Living room',bookcase:'Main case',shelf:'3'},reviewed:true,cover:coverUrlFromISBN('9780547928227'),demo:true,addedAt:now})
  ];
}

function sampleNativeCatalog(){
  const createdAt='2026-01-15T12:00:00.000Z';
  const workRows=[
    ['work_sample_pride','Pride and Prejudice','Jane Austen','1813','Austen Novels','1',['classic','romance']],
    ['work_sample_frankenstein','Frankenstein','Mary Shelley','1818','','',['classic','gothic']],
    ['work_sample_origin','On the Origin of Species','Charles Darwin','1859','','',['science','natural history']],
    ['work_sample_treasure','Treasure Island','Robert Louis Stevenson','1883','Adventure Library','1',['adventure','classic']],
    ['work_sample_meditations','Meditations','Marcus Aurelius','','','','philosophy'],
    ['work_sample_garden','The Secret Garden','Frances Hodgson Burnett','1911','Garden Stories','1',['children','classic']]
  ];
  const works=workRows.map(([id,title,authors,originalPublicationYear,series,seriesNumber,tags])=>({id,title,author:authors,authors,originalPublicationYear,series,seriesNumber,tags:Array.isArray(tags)?tags:[tags].filter(Boolean),createdAt,updatedAt:createdAt}));
  const editionRows=[
    ['edition_sample_pride','work_sample_pride','Pride and Prejudice','Jane Austen','9780141439518','Penguin Classics','2003','English','Paperback',480],
    ['edition_sample_frankenstein','work_sample_frankenstein','Frankenstein','Mary Shelley','9780141439471','Penguin Classics','2003','English','Paperback',352],
    ['edition_sample_origin','work_sample_origin','On the Origin of Species','Charles Darwin','9780140439120','Penguin Classics','2009','English','Paperback',576],
    ['edition_sample_treasure','work_sample_treasure','Treasure Island','Robert Louis Stevenson','9780141321004','Puffin Classics','2008','English','Paperback',224],
    ['edition_sample_meditations','work_sample_meditations','Meditations','Marcus Aurelius','9780140449334','Penguin Classics','2006','English','Paperback',304],
    ['edition_sample_garden','work_sample_garden','The Secret Garden','Frances Hodgson Burnett','9780141321066','Puffin Classics','2008','English','Paperback',375]
  ];
  const editions=editionRows.map(([id,workId,title,authors,isbn,publisher,year,language,format,pages])=>({id,workId,title,authors,isbn,publisher,year,language,format,pages,metadataSource:'Sample library',createdAt,updatedAt:createdAt}));
  const copyRows=[
    ['copy_sample_pride_1','edition_sample_pride','work_sample_pride',['Classics'],'read',{room:'Study',bookcase:'Bookcase 1',shelf:'2'},['favorite']],
    ['copy_sample_pride_2','edition_sample_pride','work_sample_pride',['Classics'],'unread',{room:'Living room',bookcase:'Bookcase 2',shelf:'1'},[]],
    ['copy_sample_frankenstein','edition_sample_frankenstein','work_sample_frankenstein',['Classics'],'reading',{room:'Study',bookcase:'Bookcase 1',shelf:'2'},[]],
    ['copy_sample_origin','edition_sample_origin','work_sample_origin',['Ideas'],'unread',{room:'Study',bookcase:'Bookcase 1',shelf:'3'},[]],
    ['copy_sample_treasure','edition_sample_treasure','work_sample_treasure',['Adventure'],'want',{room:'Living room',bookcase:'Bookcase 2',shelf:'1'},[]],
    ['copy_sample_meditations','edition_sample_meditations','work_sample_meditations',['Ideas'],'reference',{room:'Study',bookcase:'Desk',shelf:'1'},[]],
    ['copy_sample_garden','edition_sample_garden','work_sample_garden',[],'unread',blankLocation(),[]]
  ];
  const copies=copyRows.map(([id,editionId,workId,collections,status,location,tags],index)=>({id,copyId:id,editionId,workId,collections,status,location,tags,reviewed:true,readCount:status==='read'?1:0,finishedAt:status==='read'?'2026-01-10':'',startedAt:status==='reading'?'2026-01-12':'',addedAt:new Date(Date.parse(createdAt)+index*1000).toISOString(),updatedAt:createdAt}));
  return normalizeNativeCatalog({modelVersion:NATIVE_CATALOG_MODEL,createdAt,updatedAt:createdAt,works,editions,copies});
}

function OnboardingPanel({books,collections,setActiveView,onAddManual,onExportJSON,onLoadDemo}){
  if(books.length>0)return null;
  const steps=[['1','Add a book','Scan an ISBN or create a manual entry.'],['2','Create collections','Use collections only for curated groups.'],['3','Set locations','Record where physical books live.'],['4','Back up','Download a JSON backup before serious cataloging.']];
  return <div className="onboarding panel panel-pad"><div><div className="overline">Welcome</div><h1 className="title" style={{fontSize:28}}>Start your catalog with a clean workflow</h1><p className="subtitle">The Stacks now separates collections, tags, reading status, location, loans, and quality cleanup so the catalog stays usable as it grows.</p><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}><button className="btn" onClick={onAddManual}>Add first book</button><button className="ghost" onClick={()=>setActiveView('bookcase')}>Create collection</button><button className="ghost" onClick={onLoadDemo}>Load demo library</button><button className="ghost" onClick={onExportJSON}>Export backup</button></div></div><div className="onboarding-steps">{steps.map(([n,h,t])=><div className="onboarding-step" key={n}><strong>{n}</strong><span><b>{h}</b><small>{t}</small></span></div>)}</div></div>;
}


function MinimalToolsPanel({setActiveView,setFilters,onExportJSON}){
  const openLibrary=filters=>{setFilters({...defaultFilters,...filters});setActiveView('library');};
  const tools=[['Organize books','Identify books, sort unshelved copies, and use bulk tools.',()=>setActiveView('intake')],['Review issues','Fix books that need attention.',()=>openLibrary({review:'needs'})],['Duplicates','Compare likely duplicate records.',()=>openLibrary({missing:'duplicates'})],['Quality','Improve missing metadata and covers.',()=>setActiveView('quality')],['Locations','Manage rooms, bookcases, shelves, and boxes.',()=>setActiveView('locations')],['Lending','See borrowed and overdue books.',()=>setActiveView('lending')],['Reports','Print or export custom reports.',()=>setActiveView('reports')],['Tags','Rename, merge, or remove tags.',()=>setActiveView('tags')],['Stats','View simple catalog statistics.',()=>setActiveView('stats')],['Catalog model','Works, editions, copies, and migration safety.',()=>setActiveView('migration')],['Help','Keyboard shortcuts and search examples.',()=>setActiveView('help')]];
  return <section className="settings-toolbox panel panel-pad"><div className="calm-section-title"><h2 style={{fontFamily:'Fraunces,serif',margin:0}}>Tools</h2><button className="ghost" onClick={onExportJSON}>Backup now</button></div><p className="small" style={{marginTop:0}}>The main app stays simple. Use these tools only when you need cleanup, reports, or deeper catalog maintenance.</p><div className="settings-toolbox-grid">{tools.map(([title,detail,action])=><button key={title} className="settings-tool" onClick={action}><b>{title}</b><small>{detail}</small></button>)}</div></section>;
}

function ChangelogModal({onClose}){const modalRef=useRef(null);useModalFocus(true,onClose,modalRef);return <div className="modal-back" onClick={onClose} role="presentation"><div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label="Changelog" tabIndex="-1" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="overline">The Stacks</div><h2 style={{margin:'2px 0 0',fontFamily:'Fraunces,serif'}}>Version {APP_VERSION}</h2></div><button className="ghost" onClick={onClose}><Icon name="x" size={14}/></button></div><div className="modal-body">{CHANGELOG.map(c=><div key={c.version} style={{borderBottom:'1px solid var(--line)',padding:'0 0 14px',marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between'}}><b>v{c.version}</b><span className="small mono">{c.date}</span></div><ul>{c.items.map(i=><li key={i} className="small" style={{margin:'5px 0'}}>{i}</li>)}</ul></div>)}</div></div></div>}

function App(){
  const [booksState,setBookViews]=useState([]);const books=booksState;const [collections,setCollections]=useState([]);const [loaded,setLoaded]=useState(false);const [storageMode,setStorageMode]=useState(()=>getPreferredStorageMode());const [storageInfo,setStorageInfo]=useState({usage:0,quota:0});const [activeView,setActiveView]=useState('dashboard');const [activeCollection,setActiveCollection]=useState('');const [search,setSearch]=useState('');const [editing,setEditing]=useState(null);const [identifying,setIdentifying]=useState(null);const [dragging,setDragging]=useState(null);const [toasts,setToasts]=useState([]);const [filters,setFilters]=useState(defaultFilters);const [savedViews,setSavedViews]=useState([]);const [settings,setSettings]=useState(DEFAULT_SETTINGS);const [showChangelog,setShowChangelog]=useState(false);const [showCommand,setShowCommand]=useState(false);const [showAddBooks,setShowAddBooks]=useState(false);const [scanFocus,setScanFocus]=useState('');const [organizeFocus,setOrganizeFocus]=useState('');const [pendingImport,setPendingImport]=useState(null);const [pendingMetadata,setPendingMetadata]=useState(null);const [quickEditing,setQuickEditing]=useState(null);const [moveRequest,setMoveRequest]=useState(null);const [scanDestination,setScanDestination]=useState(blankLocation());const [sortDeskQueue,setSortDeskQueue]=useState([]);const [easyCompletionIds,setEasyCompletionIds]=useState([]);const [migrationBackupStamp,setMigrationBackupStamp]=useState(()=>migrationBackupInfo()?.createdAt||'');const nativeCatalogRef=useRef(blankNativeCatalog());const booksRef=useRef([]);const storageWarningRef=useRef(false);const backupReminderShownRef=useRef(false);
  function commitNativeCatalog(model){const native=normalizeNativeCatalog(model);const views=nativeCatalogToBookViews(native);nativeCatalogRef.current=native;booksRef.current=views;setBookViews(views);return views;}
  function setBooks(update){setBookViews(prev=>{const candidate=typeof update==='function'?update(prev):update;const native=nativeCatalogFromBookViews(candidate,nativeCatalogRef.current);const views=nativeCatalogToBookViews(native);nativeCatalogRef.current=native;booksRef.current=views;return views;});}
  function insertScannedBook(book){const clean=normalizeBook(book);const candidate=[clean,...booksRef.current.filter(b=>b.id!==clean.id)];const native=nativeCatalogFromBookViews(candidate,nativeCatalogRef.current);const views=nativeCatalogToBookViews(native);nativeCatalogRef.current=native;booksRef.current=views;setBookViews(views);return views.find(b=>b.id===clean.copyId||b.id===clean.id)||clean;}
  function currentCatalogPayload(){return catalogPayload(booksRef.current||books,collections,savedViews,settings,nativeCatalogRef.current);}
  useEffect(()=>{let cancelled=false;(async()=>{try{const loadedCatalog=await loadCatalogFromPreferredStorage();const migrated=migrateCatalogData(loadedCatalog.data);if(cancelled)return;setStorageMode(loadedCatalog.mode);setPreferredStorageMode(loadedCatalog.mode);commitNativeCatalog(migrated.nativeCatalog||nativeCatalogFromBookViews(migrated.books));setCollections(migrated.collections);setSavedViews(migrated.savedViews);setSettings(migrated.settings);safeLocalSet(SCHEMA_KEY,APP_VERSION);if(loadedCatalog.mode==='indexeddb')toast('Larger Library Mode active: catalog loaded from IndexedDB');}catch(err){toast(`Could not load saved catalog: ${err?.message||'unknown error'}`,'error')}if(!cancelled)setLoaded(true)})();return()=>{cancelled=true}},[]);
  useEffect(()=>{booksRef.current=books;if(loaded)persistPart('books',books,'books')},[books,loaded,storageMode]);
  useEffect(()=>{if(loaded)persistPart('collections',collections,'shelves')},[collections,loaded,storageMode]);
  useEffect(()=>{if(loaded)persistPart('savedViews',savedViews,'views')},[savedViews,loaded,storageMode]);
  useEffect(()=>{if(loaded)persistPart('settings',settings,'settings');document.body.classList.toggle('theme-dark',settings.theme==='dark');document.body.classList.toggle('compact-mobile',!!settings.compactMobile);},[settings,loaded,storageMode]);
  useEffect(()=>{if(!loaded)return;idbStorageInfo().then(setStorageInfo).catch(()=>{});},[loaded,storageMode,books.length,collections.length,savedViews.length,settings.lastBackupAt]);
  useEffect(()=>{if(!loaded||backupReminderShownRef.current)return;const health=getBackupHealth(settings,(booksRef.current||[]).filter(Boolean).length>0);if(!health.shouldRemind)return;backupReminderShownRef.current=true;toast(health.state===BACKUP_HEALTH.NEVER_BACKED_UP?'Save your first portable library backup.':'Your library backup is due.','ok',{label:'Save backup',onClick:exportJSON})},[loaded,books.length,settings.backupReminderDays,settings.lastBackupAt]);
  useEffect(()=>{if(!loaded||storageWarningRef.current)return;const perf=storageDiagnostics(books,collections,savedViews,settings);const browserRisk=storageMode==='indexeddb'&&storageInfo.quota&&storageInfo.usage/storageInfo.quota>.8;if((storageMode==='localStorage'&&perf.warnings.length)||browserRisk){storageWarningRef.current=true;toast('Storage warning: catalog data is getting large. Download a JSON backup and check Settings diagnostics.','error',{label:'Settings',onClick:()=>setActiveView('settings')})}},[loaded,storageMode,storageInfo.usage,storageInfo.quota,books.length,collections.length,savedViews.length,settings.lastBackupAt]);
  const debouncedSearch=useDebouncedValue(search,180);
  useEffect(()=>{if(activeView==='library'&&search!==filters.query)setFilters(f=>({...f,query:search}));},[debouncedSearch]);
  useEffect(()=>{const onErr=e=>toast(`App error: ${e.message||'unexpected runtime error'}`,'error');const onRej=e=>toast(`Async error: ${e.reason?.message||e.reason||'unexpected error'}`,'error');window.addEventListener('error',onErr);window.addEventListener('unhandledrejection',onRej);return()=>{window.removeEventListener('error',onErr);window.removeEventListener('unhandledrejection',onRej);}},[]);
  useEffect(()=>{const h=e=>{if(activeView==='easy')return;const key=String(e.key||'').toLowerCase();const typing=isTypingTarget(e.target);if(key==='escape'){if(showCommand){setShowCommand(false);return}if(showChangelog){setShowChangelog(false);return}if(pendingImport){setPendingImport(null);return}if(pendingMetadata){setPendingMetadata(null);return}if(identifying){setIdentifying(null);return}if(editing){setEditing(null);return}}if((e.metaKey||e.ctrlKey)&&key==='k'){e.preventDefault();setShowCommand(true);return}if(e.shiftKey&&e.key==='?'&&!typing){e.preventDefault();setActiveView('help');return}if(!typing&&key==='n'){e.preventDefault();addManual();return}if(!typing&&key==='s'){e.preventDefault();setActiveView('scan');return}if(!typing&&key==='l'){e.preventDefault();setActiveView('library');return}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[activeCollection,settings,books,collections,savedViews,showCommand,showChangelog,pendingImport,pendingMetadata,identifying,editing]);
  function toast(msg,type='ok',action,duration=5000){const id=genId();setToasts(p=>[...p,{id,msg,type,action}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),duration)}
  function persistPart(part,value,label){
    if(part==='books'){
      const native=nativeCatalogRef.current||nativeCatalogFromBookViews(value);
      if(storageMode==='indexeddb'){
        Promise.all([idbSetKV('catalog',native),idbSetKV('books',value),idbSetKV('appVersion',APP_VERSION),idbSetKV('updatedAt',new Date().toISOString())]).catch(()=>toast(`Could not save ${label} in IndexedDB; download a JSON backup`,'error',{label:'Backup',onClick:exportJSON}));
        return;
      }
      const ok0=safeLocalSet(NATIVE_CATALOG_KEY,JSON.stringify(native));
      const ok1=safeLocalSet(BOOKS_KEY,JSON.stringify(value));
      safeLocalSet(SCHEMA_KEY,APP_VERSION);
      if(!ok0||!ok1)toast(`Could not save ${label} locally; download a JSON backup`,'error',{label:'Backup',onClick:exportJSON});
      return;
    }
    if(storageMode==='indexeddb'){
      idbSetKV(part,value).then(()=>idbSetKV('appVersion',APP_VERSION)).catch(()=>toast(`Could not save ${label} in IndexedDB; download a JSON backup`,'error',{label:'Backup',onClick:exportJSON}));
      return;
    }
    const key={collections:COLLECTIONS_KEY,savedViews:VIEWS_KEY,settings:SETTINGS_KEY}[part];
    if(key&&!safeLocalSet(key,JSON.stringify(value)))toast(`Could not save ${label} locally; download a JSON backup`,'error',{label:'Backup',onClick:exportJSON});
  }
  async function enableIndexedDBMode(){
    if(!idbAvailable()){toast('IndexedDB is not available in this browser','error');return;}
    if(settings.confirmDestructive&&!confirm('Enable Larger Library Mode? Your current localStorage catalog will be copied into IndexedDB. The old localStorage data is left in place as a fallback until you clear it manually.'))return;
    try{await idbSaveCurrentCatalog(books,collections,savedViews,settings);setPreferredStorageMode('indexeddb');setStorageMode('indexeddb');const info=await idbStorageInfo();setStorageInfo(info);toast('Larger Library Mode enabled. Export a JSON backup now for safety.','ok',{label:'Backup',onClick:exportJSON});}
    catch(err){toast(`Could not enable Larger Library Mode: ${err?.message||'IndexedDB error'}`,'error');}
  }
  function useLocalStorageMode(){
    if(settings.confirmDestructive&&!confirm('Copy the current catalog back to localStorage and use portable localStorage mode? This may fail if the catalog is too large.'))return;
    const payload=catalogPayload(books,collections,savedViews,settings,nativeCatalogRef.current);
    if(!writeLocalCatalogPayload(payload)){toast('Could not copy the active catalog to localStorage. Download JSON backup instead.','error',{label:'Backup',onClick:exportJSON});return;}
    setPreferredStorageMode('localStorage');setStorageMode('localStorage');toast('Portable localStorage mode enabled. IndexedDB data was left untouched.');
  }
  async function repairIndexedDB(){
    if(storageMode!=='indexeddb'){toast('IndexedDB repair is only needed in Larger Library Mode');return;}
    try{await idbSaveCurrentCatalog(books.map(normalizeBook).filter(Boolean),uniq(collections).filter(x=>!isAutoFacet(x)),savedViews,settings);const info=await idbStorageInfo();setStorageInfo(info);toast('IndexedDB catalog rewritten from current in-memory data.');}
    catch(err){toast(`Could not repair IndexedDB storage: ${err?.message||'unknown error'}`,'error');}
  }
  function makeSnapshot(label='snapshot',force=false){if(!force&&!settings.autoJsonSnapshot)return;const payload={...catalogPayload(booksRef.current,collections,savedViews,settings,nativeCatalogRef.current),snapshotLabel:label,snapshotAt:new Date().toISOString()};if(storageMode==='indexeddb')idbSetKV('snapshot',payload).catch(()=>safeLocalSet(SNAPSHOT_KEY,JSON.stringify(payload)));else safeLocalSet(SNAPSHOT_KEY,JSON.stringify(payload));}
  async function persistCatalogPayloadStrict(payload){if(storageMode==='indexeddb')await idbSaveCatalogPayload(payload);else if(!writeLocalCatalogPayload(payload))throw new Error('Browser storage rejected the catalog update');}
  function clearCatalogSessionState(){
    setActiveCollection('');setSearch('');setFilters(defaultFilters);setEditing(null);setIdentifying(null);setDragging(null);setScanFocus('');setOrganizeFocus('');setPendingImport(null);setPendingMetadata(null);setQuickEditing(null);setSortDeskQueue([]);setEasyCompletionIds([]);setShowCommand(false);setShowChangelog(false);setShowAddBooks(false);setActiveView('dashboard');
  }
  async function loadSampleLibrary(){
    if(!canLoadSampleLibrary(nativeCatalogRef.current)){toast('Sample library can only be loaded when there are no physical Copies','error');return false;}
    const catalog=sampleNativeCatalog();const views=nativeCatalogToBookViews(catalog);const sampleCollections=uniq([...collections,...catalog.copies.flatMap(copy=>copy.collections||[])]).filter(name=>!isAutoFacet(name));const payload=catalogPayload(views,sampleCollections,savedViews,settings,catalog);
    try{await persistCatalogPayloadStrict(payload);}catch(err){toast('Sample library was not loaded: '+(err?.message||'catalog storage failed'),'error');return false;}
    commitNativeCatalog(catalog);setCollections(sampleCollections);clearCatalogSessionState();toast('Sample library loaded · 7 physical copies');return true;
  }
  async function resetLibrary(){
    const current=currentCatalogPayload();const hadCopies=nativeCatalogStats(current.catalog).copies>0;let emptyPayload;
    try{emptyPayload=await prepareLibraryResetPayload(current,storageMode);}catch(err){toast('Library was not reset because the safety snapshot could not be saved: '+(err?.message||'verification failed'),'error');return false;}
    const emptyCatalog=blankNativeCatalog();
    try{await persistCatalogPayloadStrict(emptyPayload);}catch(err){try{await persistCatalogPayloadStrict(current);}catch{}toast('Library was not reset because the empty catalog could not be saved: '+(err?.message||'catalog storage failed'),'error');return false;}
    commitNativeCatalog(emptyCatalog);setCollections([]);setSavedViews([]);clearCatalogSessionState();toast(hadCopies?'Library reset. A verified safety snapshot was saved.':'Library reset.');return true;
  }
  function confirmRisk(title,whatWillHappen,whatWillNotHappen='Your JSON backups and unrelated book records will not be changed.',recovery='A local safety snapshot will be created before this action.'){
    if(settings.confirmDestructive===false)return true;
    return confirm(`${title}

What will happen:
${whatWillHappen}

What will not happen:
${whatWillNotHappen}

Recovery:
${recovery}`);
  }
  function exportJSON(){try{const savedAt=new Date().toISOString();const prepared=preparePortableBackup(books,collections,savedViews,{...settings,lastBackupAt:savedAt},nativeCatalogRef.current);if(!downloadJSON(prepared.payload,'backup'))throw new Error('The browser could not save the file.');setSettings(st=>normalizeSettings({...st,lastBackupAt:savedAt}));const n=prepared.checked.stats;toast('Backup saved · '+n.copies+' books · '+n.works+' works · '+n.editions+' editions')}catch(err){toast('Backup was not saved: '+(err?.message||'validation failed'),'error')}}
  function downloadLibraryCsv(){downloadTextFile('\uFEFF'+createLibraryCsv(nativeCatalogRef.current),`the-stacks-library-${localDateStamp()}.csv`,'text/csv;charset=utf-8');toast('Full-library CSV downloaded')}
  function downloadAiMarkdown(){downloadTextFile(createAiMarkdown(nativeCatalogRef.current,collections),`the-stacks-ai-export-${localDateStamp()}.md`,'text/markdown;charset=utf-8');toast('AI-friendly library export downloaded')}
  function createMigrationBackup(){const backup=migrationBackupPayload(books,collections,savedViews,settings);const saved=safeLocalSet(MIGRATION_BACKUP_KEY,JSON.stringify(backup));downloadJSON(backup,'pre-v3-migration-backup');setMigrationBackupStamp(backup.createdAt);toast(saved?'Native model backup saved locally and downloaded':'Native model backup downloaded, but local browser backup could not be saved','ok',{label:'Catalog model',onClick:()=>setActiveView('migration')});}
  function exportMigrationPlan(plan){const report={app:'The Stacks',kind:'native-model-audit',version:APP_VERSION,createdAt:new Date().toISOString(),plan:plan||buildPreV3MigrationPlan(books,collections)};downloadJSON(report,'native-model-audit');toast('Catalog model audit report downloaded')}
  function applyV3Migration(){makeSnapshot('before-rebuild-native-catalog');setBooks(books);const summary=nativeCatalogStats(nativeCatalogRef.current);toast(`Native catalog model active: ${summary.works} works · ${summary.editions} editions · ${summary.copies} physical copies`)}
  function exportV3Model(){downloadJSON(catalogPayload(books,allCollections,savedViews,settings,nativeCatalogRef.current),'native-work-edition-copy-catalog');toast('Native Work / Edition / Copy catalog exported')}
  function printV3Model(){printV3Inventory(books)}
  function restoreMigrationBackup(){const backup=safeJSONParse(localStorage.getItem(MIGRATION_BACKUP_KEY),null);if(!backup?.payload){toast('No local native-model backup found','error');return;}if(!confirmRisk(`Rollback to the local native-model backup from ${new Date(backup.createdAt).toLocaleString()}?`,'Current catalog data in this app copy will be replaced by the local pre-v3 migration backup.','Downloaded JSON backups and browser files outside this app storage will not be changed.','A local safety snapshot of the current state will be created before rollback.'))return;makeSnapshot('before-rollback-to-migration-backup');const migrated=migrateCatalogData(backup.payload);setBooks(migrated.books.filter(Boolean));setCollections(migrated.collections);setSavedViews(migrated.savedViews);setSettings(migrated.settings);toast(`Rolled back to model backup with ${migrated.books.length} records`)}

  function importJSON(file,intent='restore'){const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);const checked=validatePortableBackup(data);if(!checked.valid)throw new Error(checked.issues?.[0]||'invalid backup');const preview=buildImportPreview(books,checked.migrated,intent==='restore'?'Restore backup':'JSON import');preview.restoreOnly=intent==='restore';preview.backup=checked;setPendingImport(preview)}catch(err){toast(`Could not preview this JSON file: ${err?.message||'invalid backup'}`,'error')}};r.onerror=()=>toast('Could not read JSON file','error');r.readAsText(file)}
  async function restoreSnapshot(){try{let data=null;if(storageMode==='indexeddb'){data=await idbGetKV('snapshot').catch(()=>null);}if(!data){const raw=localStorage.getItem(SNAPSHOT_KEY);data=raw?JSON.parse(raw):null;}if(!data){toast('No local safety snapshot found','error');return}if(!confirmRisk('Restore the last local safety snapshot?','Current local catalog data will be replaced with the latest safety snapshot in this browser.','Downloaded JSON backup files outside this browser will not be changed.','Export a JSON backup first if you want an extra recovery point.'))return;const migrated=migrateCatalogData(data);setBooks(migrated.books.filter(Boolean));setCollections(migrated.collections);setSavedViews(migrated.savedViews);if(data.settings)setSettings(migrated.settings);toast(`Restored safety snapshot with ${migrated.books.length} books`);}catch{toast('Could not restore safety snapshot','error')}}
  const allCollections=useMemo(()=>{const from=books.flatMap(collectionNames);return uniq([...collections,...from]).filter(x=>!isAutoFacet(x)).sort((a,b)=>a.localeCompare(b));},[books,collections]);
  function addCollection(name){name=String(name||'').trim();if(!name){toast('Enter a collection name first','error');return;}if(isAutoFacet(name)){toast('Author, publisher, and genre facets are filters, not collections','error');return;}if(allCollections.includes(name)){toast(`Collection "${name}" already exists`);return;}setCollections(p=>uniq([...p,name]));toast(`Added collection "${name}"`)}
  function openAddBooks(){setShowAddBooks(true)}
  function openEasyScan(){setShowAddBooks(false);setActiveView('easy')}
  function openOrganize(scope=''){setOrganizeFocus(scope);setActiveView('intake')}
  function openBatchScan(){setShowAddBooks(false);setScanFocus('batch');setActiveView('scan')}
  function openManualAdd(){setShowAddBooks(false);addManual()}
  function onScan(raw,options){return processScan(raw,options)}
  async function processScan(raw,options={}){
    const entered=normalizeISBN(raw);const quiet=Boolean(options.quiet);
    if(!entered||!isValidISBN(entered)){if(!quiet)toast(`"${raw}" is not a valid ISBN checksum`,'error');return {state:'invalid',detail:'Catalog unchanged'}}
    const isbn=toISBN13(entered);const hasSessionCollection=Object.prototype.hasOwnProperty.call(options,'collection');const chosen=hasSessionCollection?String(options.collection||'').trim():String(settings.defaultCollection||'').trim();const col=chosen?[chosen]:[];const scanStatus=options.status||settings.defaultStatus||'unread';const scanLocation=normalizeLocation(options.location||settings.defaultLocation);
    const existing=booksRef.current.find(b=>normalizeISBN(b.isbn)&&toISBN13(b.isbn)===isbn);
    if(existing){
      const copyId=genId();const copyCollections=hasSessionCollection?col:(col.length?col:collectionNames(existing));const copy=normalizeBook({...existing,id:copyId,copyId,workId:existing.workId||v3WorkId(existing),editionId:existing.editionId||v3EditionId(existing),catalogModel:NATIVE_CATALOG_MODEL,copyCount:1,collections:copyCollections,shelves:copyCollections,shelf:copyCollections[0]||'',needsIdentification:Boolean(existing.needsIdentification),status:scanStatus||existing.status||'unread',location:scanLocation,condition:'',acquisitionDate:'',acquisitionSource:'',copyNotes:'',lentTo:'',lentDate:'',dueDate:'',returnedDate:'',startedAt:'',finishedAt:'',readCount:0,privateReview:'',rating:0,reviewed:false,addedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      const saved=insertScannedBook(copy);const editionCopies=booksRef.current.filter(b=>b.editionId===saved.editionId).length;
      if(!quiet)toast(`Added physical copy ${editionCopies}: ${existing.title}`);return {state:'copy',book:saved,detail:`Copy ${editionCopies} of this edition`};
    }
    if(!quiet)toast(`Looking up ${isbn}…`);const lookup=await lookupBook(isbn);const meta=hasUsableMetadata(lookup)?lookup:null;const base=normalizeBook({isbn,title:meta?.title||'Unidentified book',authors:meta?.authors||'',originalPublicationYear:meta?.originalPublicationYear||'',series:meta?.series||'',seriesNumber:meta?.seriesNumber||'',year:meta?.year||'',publisher:meta?.publisher||'',translators:meta?.translators||[],editors:meta?.editors||[],pages:meta?.pages||'',language:meta?.language||'',edition:meta?.edition||'',format:meta?.format||'',cover:meta?.cover||'',tags:meta?.tags||[],metadataSource:meta?.metadataSource||'',metadataConfidence:meta?.metadataConfidence||'',metadataMatchMethod:meta?.metadataMatchMethod||'',metadataUpdatedAt:meta?new Date().toISOString():'',collections:col,status:scanStatus,location:scanLocation,reviewed:false,needsIdentification:!meta});
    const book=normalizeBook({...base,copyId:base.id,workId:v3WorkId(base),editionId:v3EditionId(base),catalogModel:NATIVE_CATALOG_MODEL});const saved=insertScannedBook(book);
    if(!quiet)toast(meta?`Added: ${meta.title}`:`Added ${isbn} — needs identification`);if(!meta&&!options.silentReview)setEditing(saved);return {state:meta?'added':'review',book:saved,detail:meta?`Metadata from ${meta.metadataSource||'catalog lookup'}`:'Added — needs identification'};
  }
  async function processEasyScan(raw,session){return processScan(raw,{...session,quiet:true,silentReview:true})}
  function lookupFindBook(raw){return lookupOwnedISBN(nativeCatalogRef.current,raw)}
  async function resolveFindMetadata(isbn){try{return await lookupBook(isbn)}catch{return null}}
  async function addFoundBook(isbn){const existing=lookupFindBook(isbn);if(existing.state==='owned')return existing;const added=await processScan(isbn,{quiet:true,silentReview:true});if(['added','review','copy'].includes(added.state)){toast(added.state==='review'?'Added to library · needs identification':'Added to library');return lookupFindBook(isbn)}return added;}
  function editFoundCopy(copyId){const book=(booksRef.current||[]).find(item=>(item.copyId||item.id)===copyId);if(book)setEditing(book);}
  function undoEasyScanLast(id){const removed=booksRef.current.find(book=>book.id===id);if(!removed)return false;makeSnapshot('before-easy-scan-undo',true);setBooks(current=>current.filter(book=>book.id!==id));return true;}

  function saveBook(book){if(String(book?.originalPublicationYear||'').trim()&&!normalizeOriginalPublicationYear(book.originalPublicationYear)){toast('Original publication year must be a four-digit year from 1000 through next year','error');return}let b=normalizeBook({...book,updatedAt:new Date().toISOString()});if(b.needsIdentification&&hasUsefulIdentification(b))b={...b,needsIdentification:false};if(b.status==='reading'&&!b.startedAt)b={...b,startedAt:todayISO()};if(b.status==='read'){if(!b.finishedAt)b={...b,finishedAt:todayISO()};if(!b.readCount)b={...b,readCount:1};}if(b.isbn&&!isValidISBN(b.isbn)){toast(`"${b.isbn}" is not a valid ISBN`,'error');return}setBooks(p=>[b,...p.filter(x=>x.id!==b.id)]);setCollections(p=>uniq([...p,...collectionNames(b)]).filter(x=>!isAutoFacet(x)));setEditing(null);setQuickEditing(null);toast('Entry saved')}
  function deleteBook(id){const removed=books.find(b=>b.id===id);if(!removed)return;if(!confirmRisk(`Remove "${removed.title}"?`,'This one book record will be removed from the active catalog.','Other books, collections, saved views, and JSON backup files will not be changed.','A local safety snapshot will be created first, and this toast will include Undo.'))return;makeSnapshot('before-delete-book');setBooks(p=>p.filter(b=>b.id!==id));setEditing(null);toast(`Removed "${removed.title}"`,'ok',{label:'Undo',onClick:()=>setBooks(p=>p.some(b=>b.id===removed.id)?p:[removed,...p])})}
  function deleteBooks(ids){if(!ids.length)return;if(!confirmRisk(`Delete ${ids.length} selected book${ids.length===1?'':'s'}?`,`${ids.length} selected record${ids.length===1?'':'s'} will be removed from the active catalog.`,'Unselected books, JSON backups, and app settings will not be changed.','A local safety snapshot will be created first, and this toast will include Undo.'))return;makeSnapshot('before-bulk-delete');const removed=books.filter(b=>ids.includes(b.id));setBooks(p=>p.filter(b=>!ids.includes(b.id)));toast(`Deleted ${ids.length} book${ids.length===1?'':'s'}`,'ok',{label:'Undo',onClick:()=>setBooks(p=>[...removed,...p.filter(b=>!ids.includes(b.id))])})}
  function addManual(){const chosen=activeCollection&&activeCollection!=='__unshelved__'&&activeCollection!=='__needs_identification__'?activeCollection:settings.defaultCollection;const col=chosen?[chosen]:[];const book=normalizeBook({title:'Untitled book',collections:col,status:settings.defaultStatus||'unread',location:normalizeLocation(settings.defaultLocation)});setBooks(p=>[book,...p]);setEditing(book);toast('Manual entry created')}
  function updateShelfMembership(id,target,mode='move'){const book=(booksRef.current||books).filter(Boolean).find(item=>item.id===id);if(!book)return {error:'Could not find that copy'};target=String(target||'').trim();if(target&&isAutoFacet(target))return {error:'That is not a collection'};const previous=collectionNames(book);const next=mode==='add'&&target?uniq([...previous,target]):(target?[target]:[]);if(previous.length===next.length&&previous.every((name,index)=>name===next[index]))return {book,previous,next,changed:false};setBooks(current=>current.filter(Boolean).map(item=>item.id===id?normalizeBook(setBookCollections(item,next)):item));if(target&&!collections.includes(target))setCollections(current=>uniq([...current,target]).filter(name=>!isAutoFacet(name)));return {book,previous,next,changed:true};}
  function onDropBook(id,target,mode='move',options={}){const result=updateShelfMembership(id,target,mode);if(result.error){if(!options.brief)toast(result.error,'error');return result;}if(!result.changed){if(!options.brief)toast(target?'Already on "'+target+'"':'Already unshelved');return result;}setDragging(null);if(options.brief)toast('Added to collection '+target+' ✓','ok',null,1300);else toast(target?(mode==='add'?'Added to collection':'Moved to collection')+' "'+target+'"':'Moved to Unshelved','ok',{label:'Undo',onClick:()=>setBooks(current=>current.filter(Boolean).map(book=>book.id===id?normalizeBook(setBookCollections(book,result.previous)):book))});return result;}
  function assignSortDeskShelf(id,target){return updateShelfMembership(id,target,'add');}
  function restoreSortDeskShelf(id,previous){setBooks(current=>current.filter(Boolean).map(book=>book.id===id?normalizeBook(setBookCollections(book,previous||[])):book));}
  function openSortDesk(ids){const explicit=Array.isArray(ids)&&ids.length>0;const requested=uniq(ids||[]).filter(id=>(booksRef.current||books).some(book=>book.id===id&&!needsIdentification(book)));const fallback=[...(booksRef.current||books).filter(book=>isUnshelved(book)&&!needsIdentification(book))].sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||'')).map(book=>book.id);setSortDeskQueue(explicit?requested:fallback);setActiveView('sort');}
  function bulkIntakeUpdate(ids,changes){ids=uniq(ids||[]).filter(Boolean);if(!ids.length)return;const target=String(changes.collection||'').trim();if(target&&isAutoFacet(target)){toast('Author, publisher, and genre facets are filters, not collections','error');return;}makeSnapshot('before-bulk-intake-update');const before=(booksRef.current||books).filter(b=>ids.includes(b.id)).map(b=>normalizeBook(b));setBooks(p=>p.filter(Boolean).map(b=>{if(!ids.includes(b.id))return b;let next={...b};if(target)next=setBookCollections(next,changes.mode==='add'?uniq([...collectionNames(next),target]):[target]);if(changes.status)next.status=changes.status;if(changes.reviewed!==undefined)next.reviewed=Boolean(changes.reviewed);if(changes.location){const old=normalizeLocation(next.location);next={...next,location:{...old,room:changes.location.room||old.room,bookcase:changes.location.bookcase||old.bookcase,shelf:changes.location.shelf||old.shelf,box:changes.location.box||old.box}};}return normalizeBook({...next,updatedAt:new Date().toISOString()});}));if(target&&!collections.includes(target))setCollections(p=>uniq([...p,target]).filter(x=>!isAutoFacet(x)));toast(`Updated ${ids.length} intake book${ids.length===1?'':'s'}`,'ok',{label:'Undo',onClick:()=>setBooks(p=>p.filter(Boolean).map(b=>{const old=before.find(x=>x.id===b.id);return old||b;}))})}
  function removeFromCollection(id,name){const book=(booksRef.current||books).filter(Boolean).find(b=>b.id===id);if(!book||!name)return;const old=collectionNames(book);if(!old.includes(name)){toast('Book is not in that collection');return;}const next=old.filter(c=>c!==name);setBooks(p=>p.filter(Boolean).map(b=>b.id===id?normalizeBook(setBookCollections(b,next)):b));toast(`Removed from "${name}"`,'ok',{label:'Undo',onClick:()=>setBooks(p=>p.filter(Boolean).map(b=>b.id===id?normalizeBook(setBookCollections(b,old)):b))})}
  function renameCollection(oldName,newName){newName=String(newName||'').trim();if(!oldName||!newName||oldName===newName)return;if(isAutoFacet(newName)){toast('Author, publisher, and genre facets are filters, not collections','error');return;}if(allCollections.includes(newName)&&settings.confirmDestructive&&!confirm(`Merge "${oldName}" into "${newName}"?`))return;makeSnapshot('before-rename-shelf');setCollections(p=>uniq(p.map(c=>c===oldName?newName:c)).filter(x=>!isAutoFacet(x)));setBooks(p=>p.filter(Boolean).map(b=>inCollection(b,oldName)?normalizeBook(setBookCollections(b,collectionNames(b).map(c=>c===oldName?newName:c))):b));if(activeCollection===oldName)setActiveCollection(newName);toast(`Renamed collection to "${newName}"`)}

  function updateCopyLocations(copyIds,destination,mode='move'){const result=updateCopyLocationsInBooks(booksRef.current||books,copyIds,destination);if(!result.changed){toast('Select at least one physical copy','error');return;}makeSnapshot('before-copy-location-'+mode);setBooks(result.books);const target=locationText({location:destination})||'the selected location';toast(`${mode==='assign'?'Assigned':'Moved'} ${result.changed} ${result.changed===1?'book':'books'} to ${target}`,'ok',{label:'Undo',onClick:()=>setBooks(current=>restoreCopyLocationsInBooks(current,result.previous))});}
  function moveExactCopies(copyIds,destination,{silent=false}={}){
    if(!hasMoveDestination(destination))return {error:'Choose a destination before moving books.'};
    const result=moveExactCopiesInBooks(booksRef.current||books,copyIds,destination);
    if(result.missingIds.length)return {error:'One or more physical Copies could not be found. Nothing was moved.'};
    if(result.changed){
      if(!silent)makeSnapshot('before-exact-copy-move');
      commitNativeCatalog(nativeCatalogFromBookViews(result.books,nativeCatalogRef.current));
      if(!silent)toast(`Moved ${result.changed} physical ${result.changed===1?'copy':'copies'}`,'ok',{label:'Undo',onClick:()=>undoExactCopyMove(result.previous,destination)});
    }else if(!silent)toast('Already at that destination');
    return result;
  }
  function undoExactCopyMove(previous,destination,{silent=false}={}){
    const result=undoExactCopyMoveInBooks(booksRef.current||books,previous,destination);
    if(result.conflict){if(!silent)toast('Could not undo: a Copy has moved again or is missing.','error');return false;}
    if(!silent)makeSnapshot('before-exact-copy-move-undo');
    commitNativeCatalog(nativeCatalogFromBookViews(result.books,nativeCatalogRef.current));
    if(!silent)toast(`Restored ${result.restored} physical ${result.restored===1?'copy':'copies'}`);
    return true;
  }
  function openMoveCopies(copyIds){
    const ids=uniq(copyIds).filter(id=>(booksRef.current||books).some(book=>String(book.copyId||book.id)===id));
    if(!ids.length){toast('No physical Copies selected','error');return;}
    setEditing(null);setQuickEditing(null);setMoveRequest(ids);
  }
  function openScanToLocation(destination=blankLocation()){setScanDestination(normalizeLocation(destination));setActiveView('move');}
  function renameLocation(from,to){from=normalizeLocation(from);to=normalizeLocation(to);if(!from.room&&!from.bookcase&&!from.shelf&&!from.box){toast('Choose a source location first','error');return;}const result=updateEntireLocationInBooks(booksRef.current||books,from,to);if(!result.changed){toast('No physical copies found at that location','error');return;}makeSnapshot('before-rename-location');setBooks(result.books);toast('Updated '+result.changed+' physical '+(result.changed===1?'copy':'copies')+' in that location')}
  function mergeLocation(from,to){renameLocation(from,to)}
  function clearLocation(from){from=normalizeLocation(from);const result=clearEntireLocationInBooks(booksRef.current||books,from);if(!result.changed){toast('No physical copies found at that location','error');return;}if(!confirmRisk(`Clear location from all ${result.changed} books here?`,`${result.changed} physical ${result.changed===1?'copy':'copies'} will have Room, Bookcase, Shelf, Box, and Position cleared.`,'No books, Collections, reading data, lending data, Works, or Editions will be deleted.','A local safety snapshot will be created before clearing these locations.'))return;makeSnapshot('before-clear-location');setBooks(result.books);toast('Cleared location from '+result.changed+' physical '+(result.changed===1?'copy':'copies'))}
  function deleteCollection(name){const count=books.filter(b=>inCollection(b,name)).length;if(settings.confirmDestructive&&!confirm(`Delete collection "${name}"? It will be removed from ${count} book${count===1?'':'s'}.`))return;makeSnapshot('before-delete-shelf');const affected=books.filter(b=>inCollection(b,name)).map(b=>b.id);setCollections(p=>p.filter(c=>c!==name));setBooks(p=>p.filter(Boolean).map(b=>inCollection(b,name)?normalizeBook(setBookCollections(b,collectionNames(b).filter(c=>c!==name))):b));if(activeCollection===name)setActiveCollection('');toast(`Deleted collection "${name}"`,'ok',{label:'Undo',onClick:()=>{setCollections(p=>uniq([...p,name]).filter(x=>!isAutoFacet(x)));setBooks(p=>p.filter(Boolean).map(b=>affected.includes(b.id)?normalizeBook(setBookCollections(b,uniq([...collectionNames(b),name]))):b));}})}
  function importCSV(file){const r=new FileReader();r.onload=()=>{try{const incoming=csvRowsToBooks(r.result);if(!incoming.length)throw new Error('No catalog rows found');setPendingImport(buildImportPreview(books,{books:incoming,collections:incoming.flatMap(collectionNames)},'CSV import'));}catch(err){toast(`Could not preview this CSV: ${err?.message||'invalid CSV'}`,'error')}};r.onerror=()=>toast('Could not read this CSV','error');r.readAsText(file)}
  function applyPendingImport(mode){if(!pendingImport)return;const restore=pendingImport.restoreOnly&&mode==='restore';if(pendingImport.restoreOnly&&!restore)return;if(restore)makeSnapshot('before-restore-backup',true);else makeSnapshot(`before-${mode}-import`);if(mode==='replace'||restore){const p=pendingImport.replacePayload;const restored=commitNativeCatalog(p.nativeCatalog||nativeCatalogFromBookViews(p.books));setCollections(p.collections);setSavedViews(Array.isArray(p.savedViews)?p.savedViews:[]);if(p.settings)setSettings(normalizeSettings(p.settings));const n=nativeCatalogStats(p.nativeCatalog);toast(restore?'Catalog restored · '+n.copies+' books · '+n.works+' works':`Replaced catalog with ${restored.length} book${restored.length===1?'':'s'}`)}else{const p=pendingImport.mergePayload;if(!p.books.length){toast('No new books to merge','error');setPendingImport(null);return}setBooks(cur=>[...p.books,...cur]);setCollections(cur=>uniq([...cur,...p.collections]).filter(x=>!isAutoFacet(x)));toast(`Merged ${p.books.length} new book${p.books.length===1?'':'s'}`)}setPendingImport(null);}
  function markReviewed(ids){ids=Array.isArray(ids)?ids:[ids];setBooks(p=>p.map(b=>ids.includes(b.id)?{...b,reviewed:true,updatedAt:new Date().toISOString()}:b));toast(`Marked ${ids.length} book${ids.length===1?'':'s'} reviewed`)}
  async function findMetadataSuggestion(book){
    const candidates=await lookupMetadataCandidates(book);
    return candidates[0]||null;
  }
  async function previewMetadata(id){
    const current=booksRef.current.find(b=>b.id===id);if(!current){toast('Could not find that record','error');return;}
    toast('Searching metadata candidates for '+(current.title||current.isbn||'record')+'…');
    const candidates=await lookupMetadataCandidates(current);
    if(!candidates.length){toast('No metadata candidates found for '+(current.title||current.isbn||'record'),'error');return;}
    setPendingMetadata({id:genId(),book:current,meta:candidates[0],candidates});
  }
  function applyMetadataPreview(mode,fields,metaOverride){
    if(!pendingMetadata)return;
    const {book}=pendingMetadata;const meta=metaOverride||pendingMetadata.meta;makeSnapshot('before-metadata-update');
    setBooks(list=>{const updated=applyMetadataToBook(book,meta,fields,mode);return[updated,...list.filter(item=>item.id!==book.id)]});
    setPendingMetadata(null);
    toast('Updated metadata for '+book.title+' from '+(meta.metadataSource||'external source'));
  }
  async function searchIdentification(query,book){return searchMetadataCandidates(query,book);}
  async function retryIdentificationISBN(isbn,book){return dedupeMetadataCandidates(await lookupISBNMetadataCandidates(isbn,book)).slice(0,8);}
  function applyIdentification(candidate){
    const current=(booksRef.current||[]).find(book=>book.id===identifying?.id);if(!current){toast('Could not find that physical copy','error');setIdentifying(null);return;}
    const conflicts=identificationConflictReasons(current,candidate,booksRef.current||[]);
    if(conflicts.length&&settings.confirmDestructive!==false&&!confirm('Use this edition?\n\nThis will '+conflicts.join(' and ')+'.\n\nThe physical Copy ID and copy details will stay unchanged.'))return;
    makeSnapshot('before-identification');setBooks(list=>{const updated=applySelectedMetadataCandidate(current,candidate,list);return[updated,...list.filter(book=>book.id!==current.id)]});setIdentifying(null);toast('Book identified');
  }
  function editIdentificationManually(){const current=(booksRef.current||[]).find(book=>book.id===identifying?.id);setIdentifying(null);if(current)setEditing(current);}
  async function enrichBook(id,replace=false){
    const current=booksRef.current.find(b=>b.id===id);if(!current)return false;
    const meta=await findMetadataSuggestion(current);
    if(!meta){toast('No metadata found for '+(current.title||current.isbn||'record'),'error');return false;}
    setBooks(list=>{const updated=applyMetadataToBook(current,meta,[],replace?'replace':'missing');return[updated,...list.filter(book=>book.id!==id)]});
    toast('Filled missing metadata for '+current.title+' via '+(meta.metadataSource||'external source'));
    return true;
  }
  async function enrichMany(ids){ids=uniq(ids);let ok=0;for(const id of ids){const done=await enrichBook(id,false);if(done)ok++;}if(ids.length>1)toast(`Metadata fill-missing complete: ${ok}/${ids.length} updated`)}
  function fillMissingCovers(ids){ids=uniq(ids);let count=0;setBooks(p=>p.map(b=>{if(!ids.includes(b.id)||b.cover||!b.isbn||!isValidISBN(b.isbn))return b;count++;return normalizeBook({...b,cover:coverUrlFromISBN(b.isbn),updatedAt:new Date().toISOString()});}));toast(`Filled ${count} ISBN cover URL${count===1?'':'s'}`)}
  function bulkUpdate(ids,changes){if(changes.location)makeSnapshot('before-library-bulk-location-update');setBooks(p=>p.map(b=>{if(!ids.includes(b.id))return b;let next={...b};if(changes.status)next.status=changes.status;if(changes.reviewed!==undefined)next.reviewed=changes.reviewed;if(changes.addCollection)next=setBookCollections(next,uniq([...collectionNames(next),changes.addCollection]));if(changes.addTag)next={...next,tags:uniq([...(next.tags||[]),changes.addTag])};if(changes.location){const old=normalizeLocation(next.location);next={...next,location:{...old,room:changes.location.room||old.room,bookcase:changes.location.bookcase||old.bookcase,shelf:changes.location.shelf||old.shelf}};}return normalizeBook({...next,updatedAt:new Date().toISOString()});}));toast(`Updated ${ids.length} selected book${ids.length===1?'':'s'}`)}
  function mergeGroup(primaryId,removeIds){const primary=books.find(b=>b.id===primaryId);const others=books.filter(b=>removeIds.includes(b.id));if(!primary||!others.length)return;if(!confirmRisk(`Merge ${others.length+1} records into "${primary.title}"?`,`${others.length+1} records will become one combined record. The duplicate source records will be removed from the active catalog.`,'Other duplicate groups and JSON backup files will not be changed.','A local safety snapshot will be created before merging.'))return;makeSnapshot('before-merge-duplicates');const merged=mergeBookRecords(primary,others);setBooks(p=>[merged,...p.filter(b=>b.id!==primaryId&&!removeIds.includes(b.id))]);setCollections(p=>uniq([...p,...collectionNames(merged)]));toast(`Merged duplicate group into "${merged.title}"`)}
  function mergeCustomRecord(merged,removeIds){if(!merged||!removeIds?.length)return;if(!confirmRisk(`Merge selected records into "${merged.title}"?`,'Your selected field choices will become one combined record. The duplicate source records will be removed from the active catalog.','Other catalog records and JSON backup files will not be changed.','A local safety snapshot will be created before merging.'))return;makeSnapshot('before-field-merge');const clean=normalizeBook(merged);setBooks(p=>[clean,...p.filter(b=>b.id!==clean.id&&!removeIds.includes(b.id))]);setCollections(p=>uniq([...p,...collectionNames(clean)]));toast(`Merged records into "${clean.title}"`)}
  function renameTag(oldTag,newTag){newTag=String(newTag||'').trim();if(!oldTag||!newTag){toast('Enter a valid tag name','error');return;}makeSnapshot('before-rename-tag');setBooks(p=>p.filter(Boolean).map(b=>normalizeBook({...b,tags:uniq((b.tags||[]).map(t=>t===oldTag?newTag:t))})));toast(`Renamed tag to "${newTag}"`)}
  function mergeTag(oldTag,target){target=String(target||'').trim();if(!oldTag||!target||oldTag===target){toast('Choose a different target tag','error');return;}makeSnapshot('before-merge-tag');setBooks(p=>p.filter(Boolean).map(b=>normalizeBook({...b,tags:(b.tags||[]).includes(oldTag)?uniq((b.tags||[]).map(t=>t===oldTag?target:t)):b.tags})));toast(`Merged "${oldTag}" into "${target}"`)}
  function deleteTag(tag){if(!tag)return;makeSnapshot('before-delete-tag');setBooks(p=>p.filter(Boolean).map(b=>normalizeBook({...b,tags:(b.tags||[]).filter(t=>t!==tag)})));toast(`Deleted tag "${tag}"`)}
  function returnLoan(id){setBooks(p=>p.map(b=>b.id===id?{...b,returnedDate:todayISO(),updatedAt:new Date().toISOString()}:b));toast('Marked book returned')}
  function repairCatalog(){makeSnapshot('before-repair');const repaired=repairCatalogData(booksRef.current||books,collections);setBooks(repaired.books);setCollections(repaired.collections);toast(`Catalog repaired: ${repaired.books.length} book${repaired.books.length===1?'':'s'} checked, collections rebuilt, duplicate IDs fixed`)}
  function rebuildCollections(){makeSnapshot('before-rebuild-shelves');setCollections(current=>uniq([...current,...books.flatMap(collectionNames)]).filter(x=>!isAutoFacet(x)).sort((a,b)=>a.localeCompare(b)));toast('Collection list checked and missing references added')}
  function purgeEmptyCollections(){const used=new Set(books.flatMap(collectionNames));const removed=collections.filter(c=>!used.has(c)).length;if(!removed){toast('No empty collections found');return;}if(!confirmRisk(`Remove ${removed} empty collection${removed===1?'':'s'}?`,'Only collections with no books will be removed.','Books, populated collections, and JSON backup files will not be changed.'))return;makeSnapshot('before-purge-empty-shelves');setCollections(p=>p.filter(c=>used.has(c)));toast(`Removed ${removed} empty collection${removed===1?'':'s'}`)}
  function clearSavedViews(){if(settings.confirmDestructive&&!confirm('Clear all saved custom views?'))return;makeSnapshot('before-clear-views');setSavedViews([]);toast('Saved views cleared')}

  function loadDemoLibrary(confirmed=false){if(!confirmed){setActiveView('settings');toast('Sample data is available in Settings → Library data');return false;}return loadSampleLibrary();}
  function clearDemoLibrary(){return resetLibrary();}
  const collectionFiltered=useMemo(()=>books.filter(b=>b&&typeof b==='object').filter(b=>activeCollection===''?true:activeCollection==='__unshelved__'?isUnshelved(b)&&!needsIdentification(b):activeCollection==='__needs_identification__'?needsIdentification(b):inCollection(b,activeCollection)),[books,activeCollection]);
  const filteredBooks=useMemo(()=>filterBooks(books.filter(Boolean),filters),[books,filters]);
  const easyMode=activeView==='easy';
  return <div className={easyMode?'easy-app':'app'}>{!easyMode&&<Sidebar books={books} collections={allCollections} activeView={activeView} setActiveView={setActiveView} activeCollection={activeCollection} setActiveCollection={setActiveCollection} isDragging={!!dragging} onDropBook={onDropBook} search={search} setSearch={setSearch} onScan={onScan} loaded={loaded} onAddManual={addManual} onImport={importCSV} onExport={doExport} onExportJSON={exportJSON} onImportJSON={importJSON} onOpenCommand={()=>setShowCommand(true)} onOpenChangelog={()=>setShowChangelog(true)} onAddCollection={addCollection} onRenameCollection={renameCollection} onDeleteCollection={deleteCollection} onOpenAddBooks={openAddBooks}/>}<main className={easyMode?'easy-main':'main'} id="main-content" tabIndex="-1">{!easyMode&&activeView!=='dashboard'&&activeView!=='find'&&<OnboardingPanel books={books} collections={allCollections} setActiveView={setActiveView} onAddManual={addManual} onExportJSON={exportJSON} onLoadDemo={loadDemoLibrary}/>}<RiskSafetyRail activeView={activeView} books={books} settings={settings} onExportJSON={exportJSON}/>{activeView==='dashboard'&&<DashboardView books={books} collections={allCollections} savedViews={savedViews} setActiveView={setActiveView} setActiveCollection={setActiveCollection} setFilters={setFilters} onExportJSON={exportJSON} onImportJSON={importJSON} settings={settings} onAddManual={addManual} onLoadDemo={loadDemoLibrary} onOpenAddBooks={openAddBooks} onOpenFind={()=>setActiveView('find')} onOpenMove={()=>openScanToLocation()} onOpenSort={openSortDesk} onOpenOrganize={openOrganize} onEdit={setEditing}/>} {activeView==='move'&&<MoveBooksView books={books} initialDestination={scanDestination} onLookup={lookupFindBook} onMoveCopies={moveExactCopies} onUndoMove={undoExactCopyMove} onBack={()=>setActiveView('library')}/>} {activeView==='find'&&<FindPutAway catalog={nativeCatalogRef.current} onLookup={lookupFindBook} onResolveMetadata={resolveFindMetadata} onAddToLibrary={addFoundBook} onEditCopy={editFoundCopy}/>} {activeView==='easy'&&<EasyScan collections={allCollections} settings={settings} onScan={processEasyScan} onUndoLast={undoEasyScanLast} onDone={ids=>{if(ids?.length){setEasyCompletionIds(ids);setActiveView('easy-complete')}else setActiveView('dashboard')}} onUseScanDesk={()=>setActiveView('scan')}/>} {activeView==='easy-complete'&&<EasyScanComplete copyIds={easyCompletionIds} onSort={openSortDesk} onDone={()=>{setEasyCompletionIds([]);setActiveView('dashboard')}}/>} {activeView==='scan'&&<ScanDesk books={books} collections={allCollections} onScan={onScan} onAddManual={addManual} onEdit={setEditing} onDeleteIds={deleteBooks} onSortSession={openSortDesk} settings={settings} setSettings={setSettings} focusBatch={scanFocus==='batch'} onBatchFocused={()=>setScanFocus('')}/>} {activeView==='intake'&&<IntakeQueueView books={books} collections={allCollections} onEdit={setEditing} onIdentify={setIdentifying} onBulkIntakeUpdate={bulkIntakeUpdate} onOpenSort={openSortDesk} setActiveView={setActiveView} setFilters={setFilters} onOpenAddBooks={openAddBooks} focusScope={organizeFocus} onFocusHandled={()=>setOrganizeFocus('')}/>} {activeView==='sort'&&<SortDesk books={books} collections={allCollections} initialIds={sortDeskQueue} onAssign={assignSortDeskShelf} onRestore={restoreSortDeskShelf} onAddCollection={addCollection} onDone={()=>{setSortDeskQueue([]);setActiveView('dashboard')}}/>} {activeView==='library'&&<LibraryView catalog={nativeCatalogRef.current} books={books} onMoveRequest={openMoveCopies} onOpenScan={openScanToLocation} collections={allCollections} filters={filters} setFilters={setFilters} savedViews={savedViews} setSavedViews={setSavedViews} onEdit={setEditing} onQuickEdit={setQuickEditing} onExport={doExport} onBulkUpdate={bulkUpdate} onBulkDelete={deleteBooks} onBulkRetryMetadata={enrichMany}/>} {activeView==='cleanup'&&<CleanupAssistantView books={books} setActiveView={setActiveView} setFilters={setFilters} onExportJSON={exportJSON}/>} {activeView==='review'&&<NeedsReviewView books={books} onEdit={setEditing} onMarkReviewed={markReviewed} onRetryMetadata={enrichMany} onPreviewMetadata={previewMetadata} onGoDuplicates={()=>setActiveView('duplicates')}/>} {activeView==='duplicates'&&<DuplicateReviewView books={books} onEdit={setEditing} onMergeGroup={mergeGroup} onMergeCustom={mergeCustomRecord} onDeleteIds={deleteBooks}/>} {activeView==='quality'&&<QualityView books={books} onEdit={setEditing} onRetryMetadata={enrichMany} onFillCovers={fillMissingCovers} onMarkReviewed={markReviewed} onOpenDuplicates={()=>setActiveView('duplicates')}/>} {activeView==='lending'&&<LendingView books={books} onEdit={setEditing} onReturn={returnLoan}/>} {activeView==='stats'&&<StatsDashboard books={books}/>} {activeView==='locations'&&<LocationsView books={books} setActiveView={setActiveView} setFilters={setFilters} onRenameLocation={renameLocation} onMergeLocation={mergeLocation} onClearLocation={clearLocation} onUpdateCopyLocations={updateCopyLocations} onEdit={setEditing}/>} {activeView==='reports'&&<ReportsView books={books} filteredBooks={filteredBooks} setActiveView={setActiveView} setFilters={setFilters} onExportJSON={exportJSON}/>} {activeView==='bookcase'&&<BookcaseView books={books} collections={allCollections} activeCollection={activeCollection} search={debouncedSearch} onEdit={setEditing} onDropBook={onDropBook} dragging={dragging} setDragging={setDragging} onAddCollection={addCollection} setActiveCollection={setActiveCollection} onRemoveFromCollection={removeFromCollection} onRenameCollection={renameCollection} onDeleteCollection={deleteCollection} onOpenSettings={()=>setActiveView('settings')}/>} {activeView==='works'&&<WorksView books={books} onEdit={setEditing} onApplyV3={applyV3Migration} onExportV3={exportV3Model} onPrintV3={printV3Model} setActiveView={setActiveView} setFilters={setFilters}/>} {activeView==='tags'&&<TagManager books={books} onRename={renameTag} onMerge={mergeTag} onDelete={deleteTag}/>} {activeView==='help'&&<HelpView setActiveView={setActiveView} setFilters={setFilters} onOpenCommand={()=>setShowCommand(true)}/>} {activeView==='migration'&&<MigrationSafetyPanel books={books} collections={allCollections} savedViews={savedViews} settings={settings} onCreateBackup={createMigrationBackup} onRestoreBackup={restoreMigrationBackup} onExportPlan={exportMigrationPlan} backupInfo={migrationBackupInfo()}/>} {activeView==='settings'&&<SettingsView books={books} collections={allCollections} savedViews={savedViews} settings={settings} setSettings={setSettings} onExportJSON={exportJSON} onImportJSON={importJSON} onRestoreSnapshot={restoreSnapshot} onRepair={repairCatalog} onRebuildCollections={rebuildCollections} onClearSavedViews={clearSavedViews} onDownloadCSV={downloadLibraryCsv} onDownloadAiMarkdown={downloadAiMarkdown} onPurgeEmptyCollections={purgeEmptyCollections} onLoadDemo={loadDemoLibrary} onClearDemo={clearDemoLibrary} demoCount={books.filter(b=>b.demo).length} onOpenView={setActiveView} storagePanel={<StorageModePanel storageMode={storageMode} storageInfo={storageInfo} onEnableIndexedDB={enableIndexedDBMode} onUseLocalStorage={useLocalStorageMode} onRepairIndexedDB={repairIndexedDB} books={books} collections={allCollections} savedViews={savedViews} settings={settings}/>}/>} </main>{showAddBooks&&<AddBooksChooser onClose={()=>setShowAddBooks(false)} onEasy={openEasyScan} onBatch={openBatchScan} onManual={openManualAdd} onFind={()=>{setShowAddBooks(false);setActiveView('find')}}/>} {identifying&&<IdentificationAssistant book={identifying} onClose={()=>setIdentifying(null)} onSearch={query=>searchIdentification(query,identifying)} onRetryISBN={isbn=>retryIdentificationISBN(isbn,identifying)} onApply={applyIdentification} onEditManually={editIdentificationManually}/>} {moveRequest&&<MoveCopiesDialog books={books} copyIds={moveRequest} onConfirm={moveExactCopies} onClose={()=>setMoveRequest(null)}/>} {editing&&<EditModal book={editing} onMoveCopy={book=>openMoveCopies([book.copyId||book.id])} collections={allCollections} editionCopyCount={books.filter(item=>item.editionId&&item.editionId===editing.editionId).length||1} onSave={saveBook} onDelete={deleteBook} onClose={()=>setEditing(null)} onPreviewMetadata={previewMetadata}/>} {showChangelog&&<ChangelogModal onClose={()=>setShowChangelog(false)}/>} {pendingImport&&<ImportPreviewModal preview={pendingImport} onCancel={()=>setPendingImport(null)} onApply={applyPendingImport}/>} {pendingMetadata&&<MetadataPreviewModal preview={pendingMetadata} onCancel={()=>setPendingMetadata(null)} onApply={applyMetadataPreview}/>} {quickEditing&&<QuickEditDrawer book={quickEditing} collections={allCollections} onClose={()=>setQuickEditing(null)} onSave={saveBook} onPreviewMetadata={previewMetadata}/>}<CommandPalette open={showCommand} onClose={()=>setShowCommand(false)} books={books} collections={allCollections} setActiveView={setActiveView} setFilters={setFilters} setSearch={setSearch} onAddManual={addManual} onExportJSON={exportJSON} onEdit={setEditing}/>{!easyMode&&<Toasts toasts={toasts}/>}</div>;
}
class StartupErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  render(){if(this.state.error){return <div style={{padding:24,fontFamily:'system-ui, sans-serif',background:'#f6fbff',color:'#14324a',minHeight:'100vh'}}><h1 style={{color:'#dc5252'}}>The Stacks could not render</h1><p>{String(this.state.error?.message||this.state.error)}</p><p style={{color:'#516b80'}}>Your saved catalog data has not been deleted. This diagnostic screen is shown instead of a blank page.</p></div>;}return this.props.children;}
}

export {StartupErrorBoundary};
export default App;
