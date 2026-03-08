/* =====================================================
   MagnetTracker — App Logic
   Uses a CORS proxy (allorigins) to bypass site restrictions,
   then parses magnet links + update dates from the page HTML.
   ===================================================== */

// ── Constants ──────────────────────────────────────────
// Multiple CORS proxy options — tried in sequence until one works
const PROXIES = [
  {
    type: 'corsproxy',
    build: url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    isRaw: true // Use ArrayBuffer for transparent proxies
  },
  {
    type: 'htmldriven',
    build: url => `https://cors.eu.org/${url}`,
    isRaw: true
  },
  {
    type: 'allorigins',
    build: url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    isRaw: false, // returns JSON
    extract: async resp => { const j = await resp.json(); return j.contents; }
  }
];
const EXAMPLE_URLS = [
  'https://www.xl720.com/thunder/60931.html',
  'https://www.xl720.com/thunder/61088.html'
];
const STORAGE_KEY = 'magnettracker_resources';
const MAX_PREVIEW = 3; // max magnet rows shown on card

// ── State ──────────────────────────────────────────────
let resources = loadResources();

// ── DOM Refs ───────────────────────────────────────────
const urlInput = document.getElementById('urlInput');
const addUrlBtn = document.getElementById('addUrlBtn');
const refreshAllBtn = document.getElementById('refreshAllBtn');
const copyAllLatestBtn = document.getElementById('copyAllLatestBtn');
const resFilter = document.getElementById('resFilter');
const cardsGrid = document.getElementById('cardsGrid');
const emptyState = document.getElementById('emptyState');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const errorToast = document.getElementById('errorToast');
const errorTextEl = document.getElementById('errorText');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

// ── Init ───────────────────────────────────────────────
document.getElementById('example1').addEventListener('click', () => addUrl(EXAMPLE_URLS[0]));
document.getElementById('example2').addEventListener('click', () => addUrl(EXAMPLE_URLS[1]));
addUrlBtn.addEventListener('click', () => addUrl(urlInput.value.trim()));
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(urlInput.value.trim()); });
refreshAllBtn.addEventListener('click', refreshAll);
copyAllLatestBtn.addEventListener('click', copyAllLatest);
resFilter.addEventListener('change', renderAll);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

renderAll();

// ── Core Functions ─────────────────────────────────────

function addUrl(rawUrl) {
  if (!rawUrl) { showError('请输入有效的网页链接'); return; }

  // basic URL validation
  let url;
  try {
    url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    showError('链接格式不正确，请输入完整的 http(s):// 链接');
    return;
  }

  const fullUrl = url.href;

  // deduplicate
  if (resources.find(r => r.url === fullUrl)) {
    showError('该链接已在列表中');
    return;
  }

  const resource = {
    id: Date.now().toString(),
    url: fullUrl,
    title: '正在获取…',
    status: 'loading', // loading | success | error
    updateDate: null,
    magnets: [],
    copiedHashes: [], // track hashes that have been copied
    fetchedAt: null,
    error: null
  };

  resources.push(resource);
  saveResources();
  urlInput.value = '';
  renderAll();

  fetchResource(resource.id);
}

async function fetchResource(id) {
  const resource = resourceById(id);
  if (!resource) return;

  setResourceStatus(id, 'loading', '正在获取…', null, null, null);

  showStatus(`正在抓取 ${resource.url}`);

  try {
    const html = await fetchWithFallback(resource.url);
    const { title, updateDate, magnets: parsedMagnets } = parseHTML(html, resource.url);

    // Attach resource ID to each magnet link for identification
    const magnets = parsedMagnets.map(m => ({ ...m, resourceId: resource.id }));

    if (magnets.length === 0) throw new Error('未在页面中找到磁力链接');

    setResourceStatus(id, 'success', title || resource.url, updateDate, magnets, null);
  } catch (err) {
    const msg = err.message || '未知错误';
    setResourceStatus(id, 'error', resource.title === '正在获取…' ? resource.url : resource.title, null, [], msg);
  }

  hideStatus();
  renderAll();
}

async function fetchWithFallback(url) {
  let lastError = null;
  for (const proxy of PROXIES) {
    try {
      const endpoint = proxy.build(url);
      const resp = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      let html;
      if (proxy.isRaw) {
        const buffer = await resp.arrayBuffer();
        html = await smartDecode(buffer);
      } else {
        html = await proxy.extract(resp);
        // If it's already a string but we suspect it was GBK, it might still be mangled.
        // allorigins usually handles this poorly if we don't know the charset.
      }

      if (!html || html.length < 200) throw new Error('响应内容过短');
      return html;
    } catch (e) {
      lastError = e;
      console.warn('[MagnetTracker] proxy failed:', proxy.type, e.message);
    }
  }
  throw new Error(`所有代理均失败：${lastError?.message || '网络错误'}`);
}

async function smartDecode(buffer) {
  // 1. Try UTF-8 first
  const utf8Decoder = new TextDecoder('utf-8');
  const tempText = utf8Decoder.decode(buffer);

  // 2. Check for GBK/GB2312 markers in the first 2000 chars
  // Many Chinese sites use <meta charset="gb2312"> or similar
  const headText = tempText.substring(0, 2000);
  const isGBK = /charset=["']?(gb2312|gbk|gb18030)/i.test(headText);

  if (isGBK) {
    try {
      const gbkDecoder = new TextDecoder('gbk');
      return gbkDecoder.decode(buffer);
    } catch (e) {
      console.warn('[MagnetTracker] GBK decoding failed, falling back to UTF-8', e);
      return tempText;
    }
  }

  return tempText;
}

function parseHTML(html, sourceUrl) {
  // Parse with DOMParser (runs in browser sandbox)
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // ── Title ──
  const h1 = doc.querySelector('h1');
  const titleEl = doc.querySelector('title');
  const title = (h1 ? h1.textContent : (titleEl ? titleEl.textContent : ''))
    .trim()
    .replace(/[\r\n]+/g, ' ');

  // ── Update Date ──
  // The page has patterns like "更新：2026-3-7" or "更新: 2026-3-7" in metadata
  const bodyText = doc.body ? doc.body.innerText || doc.body.textContent : html;
  let updateDate = null;

  // Strategy 1: look for 更新：YYYY-M-D pattern
  const updateMatch = bodyText.match(/更新[：:]\s*(\d{4}[-年\.\/]\d{1,2}[-月\.\/]\d{1,2})/);
  if (updateMatch) {
    updateDate = normalizeDate(updateMatch[1]);
  }

  // Strategy 2: look for og:updated_time or article:modified_time meta
  if (!updateDate) {
    const metaTime = doc.querySelector('meta[property="article:modified_time"], meta[name="lastmod"]');
    if (metaTime) {
      updateDate = normalizeDate(metaTime.getAttribute('content'));
    }
  }

  // ── Magnet Links ──
  const anchors = Array.from(doc.querySelectorAll('a[href^="magnet:?"]'));
  const seen = new Set();
  const magnets = [];

  for (const a of anchors) {
    const href = a.getAttribute('href');
    // extract BTIH hash
    const hashMatch = href.match(/btih:([a-fA-F0-9]{40})/i);
    const hash = hashMatch ? hashMatch[1].toUpperCase() : null;
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);

    // extract display name from anchor text or title or dn= param
    const dnMatch = href.match(/[?&]dn=([^&]+)/);
    const dn = dnMatch ? decodeURIComponent(dnMatch[1]).replace(/\+/g, ' ') : null;
    const text = a.textContent.trim() || dn || hash;

    magnets.push({
      href,
      hash,
      name: text,
      dn
    });
  }

  return { title, updateDate, magnets };
}

function normalizeDate(raw) {
  if (!raw) return null;
  // convert Chinese date chars and various separators to YYYY-MM-DD
  const cleaned = raw.trim()
    .replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
    .replace(/[\/\.]/g, '-');
  // pad single-digit months and days
  const parts = cleaned.split('-');
  if (parts.length >= 3) {
    const [y, m, d] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.replace(/[^\d]/g, '').padStart(2, '0')}`;
  }
  // for ISO dates like 2026-03-07T...
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}`;
  return cleaned;
}

// ── Render ─────────────────────────────────────────────

function renderAll() {
  // remove all cards (keep empty state)
  Array.from(cardsGrid.querySelectorAll('.resource-card')).forEach(el => el.remove());

  if (resources.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  resources.forEach((r, i) => {
    const card = buildCard(r, i);
    cardsGrid.appendChild(card);
  });
}

function buildCard(r, index) {
  const card = document.createElement('div');
  card.className = 'resource-card';
  card.id = `card-${r.id}`;
  card.style.animationDelay = `${index * 60}ms`;

  // ── Status dot class ──
  const dotClass = r.status === 'success' ? 'success' : r.status === 'error' ? 'error' : 'loading';

  // ── Date display ──
  const dateHtml = r.updateDate
    ? `<span class="meta-badge updated">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline;vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"></polyline></svg>
        最近更新：${r.updateDate}
       </span>`
    : r.status === 'loading'
      ? `<span class="meta-badge loading">获取中...</span>`
      : r.status === 'error'
        ? `<span class="meta-badge error">获取失败</span>`
        : '';

  const fetchedHtml = r.fetchedAt
    ? `<span class="meta-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${formatTime(r.fetchedAt)}
       </span>`
    : '';

  const magnetCount = r.magnets.length;
  const countHtml = magnetCount > 0
    ? `<span class="meta-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        共 ${magnetCount} 个磁力
       </span>`
    : '';

  // ── Magnet preview rows ──
  const selectedRes = resFilter.value;
  const uncopiedMagnets = r.magnets.filter(m => {
    const isUncopied = !r.copiedHashes?.includes(m.hash);
    if (!isUncopied) return false;
    if (selectedRes === 'all') return true;

    // Check if filename contains the selected resolution (e.g. 1080p, 2160p)
    // Matches patterns like .1080p. or -1080p or 1080p in the string
    const resPattern = new RegExp(`\\b${selectedRes}\\b`, 'i');
    return resPattern.test(m.name);
  });

  const previewMagnets = uncopiedMagnets; // Show ALL new matching links in the preview container

  const magnetRowsHtml = previewMagnets.length > 0
    ? previewMagnets.map(m => buildMagnetRowHtml(m)).join('')
    : r.status === 'success'
      ? `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 12px;opacity:0.6;border:1px dashed var(--border);border-radius:var(--radius-sm)">暂无新磁力链接</p>`
      : r.status === 'error'
        ? `<p style="color:var(--red);font-size:0.85rem;padding:8px 0">${r.error || '获取失败，请重试'}</p>`
        : r.status === 'loading'
          ? buildSkeletonHtml()
          : '';

  const magnetSection = (magnetRowsHtml || previewMagnets.length > 0 || r.status !== 'success')
    ? `<div class="card-magnets">
        <div class="magnets-label">
          ${r.status === 'success' ? '最新磁力链接' : r.status === 'loading' ? '正在获取磁力链接…' : '错误信息'}
        </div>
        ${magnetRowsHtml}
       </div>`
    : '';

  const seeAllBtn = (r.magnets.length > MAX_PREVIEW)
    ? `<div class="card-footer">
        <button class="see-all-btn" onclick="openMagnetModal('${r.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          查看全部 ${r.magnets.length} 个磁力链接
        </button>
       </div>`
    : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-status-dot ${dotClass}"></div>
      <div class="card-info">
        <div class="card-title">${escHtml(r.title)}</div>
        <div class="card-url">${escHtml(r.url)}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-icon" title="刷新" onclick="refreshOne('${r.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <button class="btn btn-icon btn-danger" title="删除" onclick="deleteResource('${r.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
    <div class="card-meta">
      ${dateHtml}
      ${fetchedHtml}
      ${countHtml}
    </div>
    ${magnetSection}
    ${seeAllBtn}
  `;

  return card;
}

function buildMagnetRowHtml(m) {
  const shortHash = m.hash ? m.hash.substring(0, 12) + '…' : '';
  const escapedHref = escHtml(m.href);
  return `
    <div class="magnet-row">
      <div class="magnet-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2">
          <path d="M6 15a6 6 0 1 0 12 0V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11z"/>
          <path d="M6 15h12"/>
        </svg>
      </div>
      <div class="magnet-details">
        <div class="magnet-name">${escHtml(m.name)}</div>
        <div class="magnet-hash">${escHtml(shortHash)}</div>
      </div>
      <button class="magnet-copy-btn" onclick="copyMagnet(this, '${escapedHref.replace(/'/g, "\\'")}', '${m.resourceId}', '${m.hash}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        复制
      </button>
    </div>
  `;
}

function buildSkeletonHtml() {
  return Array(2).fill(0).map(() => `
    <div class="magnet-row" style="opacity:0.5">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--border);flex-shrink:0"></div>
      <div style="flex:1">
        <div style="height:12px;width:60%;background:var(--border);border-radius:4px;margin-bottom:6px"></div>
        <div style="height:10px;width:40%;background:var(--border);border-radius:4px"></div>
      </div>
    </div>
  `).join('');
}

// ── Modal ──────────────────────────────────────────────

function openMagnetModal(id) {
  const r = resourceById(id);
  if (!r) return;
  modalTitle.textContent = `${r.title} — 全部磁力链接 (${r.magnets.length})`;
  modalBody.innerHTML = r.magnets.map(m => buildMagnetRowHtml(m)).join('');
  modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Actions ────────────────────────────────────────────

function refreshOne(id) {
  fetchResource(id);
}

async function refreshAll() {
  if (resources.length === 0) return;
  for (const r of resources) {
    await fetchResource(r.id);
  }
}

async function copyAllLatest() {
  const allNewMagnets = [];
  const selectedRes = resFilter.value;

  resources.forEach(r => {
    if (r.status === 'success') {
      const newMagnets = r.magnets.filter(m => {
        const isUncopied = !r.copiedHashes?.includes(m.hash);
        if (!isUncopied) return false;
        if (selectedRes === 'all') return true;
        const resPattern = new RegExp(`\\b${selectedRes}\\b`, 'i');
        return resPattern.test(m.name);
      });

      newMagnets.forEach(m => {
        allNewMagnets.push(m.href);
        if (!r.copiedHashes) r.copiedHashes = [];
        r.copiedHashes.push(m.hash);
      });
    }
  });

  if (allNewMagnets.length === 0) {
    showError(selectedRes === 'all' ? '没有可复制的新磁力链接' : `没有可复制的 ${selectedRes} 磁力链接`);
    return;
  }

  const textToCopy = allNewMagnets.join('\n');
  try {
    await navigator.clipboard.writeText(textToCopy);
    const originalText = copyAllLatestBtn.innerHTML;
    copyAllLatestBtn.classList.add('copied');
    copyAllLatestBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      已复制 ${allNewMagnets.length} 个新链接
    `;
    saveResources();
    renderAll();
    setTimeout(() => {
      copyAllLatestBtn.classList.remove('copied');
      copyAllLatestBtn.innerHTML = originalText;
    }, 2000);
  } catch (err) {
    showError('复制失败：' + err.message);
  }
}

function deleteResource(id) {
  resources = resources.filter(r => r.id !== id);
  saveResources();
  renderAll();
}

async function copyMagnet(btn, href, id, hash) {
  try {
    await navigator.clipboard.writeText(href);

    // Mark as copied
    const r = resourceById(id);
    if (r) {
      if (!r.copiedHashes) r.copiedHashes = [];
      if (!r.copiedHashes.includes(hash)) {
        r.copiedHashes.push(hash);
        saveResources();
        // Wait a bit before re-rendering so the user sees the button feedback
        setTimeout(renderAll, 1000);
      }
    }

    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      已复制
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        复制
      `;
    }, 2000);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = href;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Status / Errors ────────────────────────────────────

function showStatus(msg) {
  statusText.textContent = msg;
  statusBar.classList.remove('hidden');
}

function hideStatus() {
  statusBar.classList.add('hidden');
}

function showError(msg) {
  errorTextEl.textContent = msg;
  errorToast.classList.remove('hidden');
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => errorToast.classList.add('hidden'), 4000);
}

// ── Resource State Helpers ─────────────────────────────

function setResourceStatus(id, status, title, updateDate, magnets, error) {
  const r = resourceById(id);
  if (!r) return;
  r.status = status;
  if (title) r.title = title;
  if (updateDate !== null) r.updateDate = updateDate;
  if (magnets !== null) r.magnets = magnets;
  if (error !== null) r.error = error;
  if (status !== 'loading') r.fetchedAt = new Date().toISOString();
  saveResources();
}

function resourceById(id) {
  return resources.find(r => r.id === id) || null;
}

// ── Persistence ────────────────────────────────────────

function saveResources() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
}

function loadResources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ── Utilities ──────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '';
  }
}
