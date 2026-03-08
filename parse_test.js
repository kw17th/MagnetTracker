const fs = require('fs');
const { JSDOM } = require('jsdom');

let html = "";
try {
  html = fs.readFileSync('dmhy_test.html', 'utf8');
} catch(e) { console.error('Need html file', e); process.exit(1); }

// Simulate parseHTML
const dom = new JSDOM(html);
const doc = dom.window.document;
const sourceUrl = 'https://www.dmhy.org/topics/list?keyword=葬送的芙莉莲';
const isDmhy = true;

let title = '';
const kwInput = doc.querySelector('#keyword');
const titleMatch = doc.title.match(/^(.+?)\s+-\s+动漫花园/);
title = (kwInput && kwInput.value.trim()) ? kwInput.value.trim() : (titleMatch ? titleMatch[1] : doc.title);
if (title) title = `[动漫花园] ${title}`;
title = title.replace(/[\r\n]+/g, ' ');

let updateDate = null;
const firstDateEl = doc.querySelector('#topic_list tbody tr td:nth-child(1)');
if (firstDateEl) {
  // simple mock for normalizeDate
  updateDate = firstDateEl.textContent.trim();
}

const anchors = Array.from(doc.querySelectorAll('a[href^="magnet:?"]'));
const seen = new Set();
const magnets = [];

for (const a of anchors) {
  const href = a.getAttribute('href');
  const hashMatch = href.match(/btih:([a-zA-Z0-9]{32,40})/i);
  const hash = hashMatch ? hashMatch[1].toUpperCase() : null;
  if (!hash || seen.has(hash)) continue;
  seen.add(hash);

  const dnMatch = href.match(/[?&]dn=([^&]+)/);
  const dn = dnMatch ? decodeURIComponent(dnMatch[1]).replace(/\+/g, ' ') : null;
  
  let text = a.textContent.trim();
  if (isDmhy && !text) {
    const row = a.closest('tr');
    const titleLink = row ? row.querySelector('.title a') : null;
    if (titleLink) text = titleLink.textContent.trim();
  }
  
  text = text || dn || hash;

  magnets.push({
    href,
    hash,
    name: text,
    dn
  });
}

console.log({ title, updateDate, magnets_count: magnets.length, first_magnet: magnets[0] });
