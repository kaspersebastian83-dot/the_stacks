const CSV_HEADERS = [
  'Work title', 'Edition title', 'Authors', 'Original publication year', 'Publication year',
  'Publisher', 'ISBN', 'Language', 'Edition', 'Format', 'Copy ID', 'Reading status',
  'Rating', 'Tags', 'Collections', 'Room', 'Bookcase', 'Shelf', 'Box', 'Position', 'Copy notes', 'Notes', 'Date added'
];

const STATUS_LABELS = {
  unread: 'Unread', want: 'Want to read', reading: 'Currently reading', read: 'Read',
  dnf: 'Did not finish', reference: 'Reference only'
};

const value = input => input == null ? '' : String(input);
const list = input => Array.isArray(input) ? input.map(value).filter(Boolean) : [];
const csvCell = input => {
  const text = value(input);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const safeList = input => JSON.stringify(list(input));
const records = catalog => {
  const works = new Map((catalog?.works || []).map(work => [work.id, work]));
  const editions = new Map((catalog?.editions || []).map(edition => [edition.id, edition]));
  return (catalog?.copies || []).map(copy => {
    const edition = editions.get(copy.editionId) || {};
    const work = works.get(copy.workId || edition.workId) || {};
    return {copy, edition, work};
  });
};
const locationParts = location => [['bookcase', ''], ['shelf', 'Shelf '], ['room', 'Room: '], ['box', 'Box '], ['position', '#']]
  .map(([key, prefix]) => { const part = value(location?.[key]).trim(); return part ? prefix + part : ''; }).filter(Boolean);
const hasLocation = location => Boolean(value(location?.bookcase).trim() && value(location?.shelf).trim());
const labelStatus = status => STATUS_LABELS[status] || 'Unread';
const md = input => value(input).replace(/([\\`*_{}\[\]<>()#+.!|])/g, '\\$1').replace(/\r?\n/g, '  \n');

export function createLibraryCsv(catalog) {
  const rows = records(catalog).map(({copy, edition, work}) => {
    const tags = [...new Set([...list(work.tags), ...list(copy.tags)])];
    const fields = [
      work.title, edition.title, edition.authors || work.authors || work.author,
      work.originalPublicationYear || work.originalYear, edition.year, edition.publisher,
      edition.isbn, edition.language, edition.edition, edition.format, copy.id,
      labelStatus(copy.status), copy.rating || 0, safeList(tags), safeList(copy.collections),
      copy.location?.room, copy.location?.bookcase, copy.location?.shelf, copy.location?.box,
      copy.location?.position, copy.copyNotes, copy.notes || work.notes, copy.addedAt
    ];
    return fields.map(csvCell).join(',');
  });
  return [CSV_HEADERS.join(','), ...rows].join('\r\n');
}

export function createAiMarkdown(catalog, collectionNames = []) {
  const items = records(catalog);
  const works = catalog?.works || [];
  const editions = catalog?.editions || [];
  const copies = catalog?.copies || [];
  const assigned = copies.filter(copy => hasLocation(copy.location)).length;
  const counts = new Map();
  copies.forEach(copy => counts.set(copy.status || 'unread', (counts.get(copy.status || 'unread') || 0) + 1));
  const lines = [
    '# The Stacks — Personal Library Export', '',
    'This file describes my personal book library.', '',
    'Interpretation notes:',
    '- A Work is the intellectual work; an Edition is a specific publication; a Copy is a physical item I own.',
    '- Physical location, reading status, rating, tags, collections, and notes are catalog data for each Copy.',
    '- Collections are conceptual groupings, not physical shelves. An unread book has not been marked as read.',
    '- When recommending books, distinguish items already in this library from books I do not own.', '',
    '## Library summary', '',
    `- Works: ${works.length}`,
    `- Editions: ${editions.length}`,
    `- Physical Copies: ${copies.length}`,
    `- Read: ${counts.get('read') || 0}`,
    `- Currently reading: ${counts.get('reading') || 0}`,
    `- Unread: ${counts.get('unread') || 0}`,
    `- Want to read: ${counts.get('want') || 0}`,
    `- Copies with a recorded location: ${assigned}`,
    `- Copies needing a location: ${copies.length - assigned}`,
    `- Collections: ${new Set([...list(collectionNames), ...copies.flatMap(copy => list(copy.collections))]).size}`, '',
    '## Library', ''
  ];
  const byWork = new Map();
  for (const item of items) {
    const id = item.work.id || item.copy.workId || item.edition.workId || 'unknown-work';
    if (!byWork.has(id)) byWork.set(id, []);
    byWork.get(id).push(item);
  }
  for (const workItems of byWork.values()) {
    const work = workItems[0].work;
    lines.push(`### ${md(work.title || 'Untitled work')}`, '');
    const authors = work.authors || work.author || workItems[0].edition.authors;
    if (authors) lines.push(`Authors: ${md(authors)}`, '');
    const byEdition = new Map();
    for (const item of workItems) {
      const id = item.edition.id || item.copy.editionId || 'unknown-edition';
      if (!byEdition.has(id)) byEdition.set(id, []);
      byEdition.get(id).push(item);
    }
    let editionNumber = 0;
    for (const editionItems of byEdition.values()) {
      const edition = editionItems[0].edition;
      editionNumber++;
      lines.push(`#### Edition ${editionNumber}${edition.title && edition.title !== work.title ? ` — ${md(edition.title)}` : ''}`, '');
      for (const [label, raw] of [['Year', edition.year], ['Publisher', edition.publisher], ['ISBN', edition.isbn], ['Language', edition.language], ['Edition', edition.edition], ['Format', edition.format]]) {
        if (raw) lines.push(`${label}: ${md(raw)}`);
      }
      if (['year', 'publisher', 'isbn', 'language', 'edition', 'format'].some(key => edition[key])) lines.push('');
      editionItems.forEach(({copy}) => {
        const parts = locationParts(copy.location);
        const location = parts.length ? parts.join(' → ') : 'Not assigned';
        lines.push(`- Copy: ${md(location)}`);
        lines.push(`  - Reading status: ${md(labelStatus(copy.status))}`);
        if (copy.rating) lines.push(`  - Rating: ${md(copy.rating)}/5`);
        const tags = [...new Set([...list(work.tags), ...list(copy.tags)])];
        if (tags.length) lines.push(`  - Tags: ${tags.map(md).join('; ')}`);
        if (list(copy.collections).length) lines.push(`  - Collections: ${list(copy.collections).map(md).join('; ')}`);
        if (copy.addedAt) lines.push(`  - Date added: ${md(copy.addedAt)}`);
        if (copy.copyNotes) lines.push(`  - Copy notes: ${md(copy.copyNotes)}`);
        const notes = copy.notes || work.notes;
        if (notes) lines.push(`  - Notes: ${md(notes)}`);
      });
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function localDateStamp(date = new Date()) {
  const part = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function downloadTextFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = Object.assign(document.createElement('a'), {href: url, download: filename});
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
