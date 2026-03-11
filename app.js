/* =====================================================
   MagnetTracker — App Logic
   Uses a CORS proxy (allorigins) to bypass site restrictions,
   then parses magnet links + update dates from the page HTML.
   ===================================================== */

// ── Constants ──────────────────────────────────────────
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
  'https://www.dmhy.org/topics/list?keyword=%E8%91%AC%E9%80%81%E7%9A%84%E8%8A%99%E8%8E%89%E8%93%AE&sort_id=0&team_id=767&order=date-desc',
  'https://www.xl720.com/thunder/60931.html'
];
const STORAGE_KEY_LOCAL = 'magnettracker_resources';
const STORAGE_KEY_SYNC = 'magnettracker_sync';
const STORAGE_KEY_AUTO_REFRESH = 'magnettracker_last_auto_refresh';
const AUTO_REFRESH_SLOTS = [7, 12, 18]; // 7:00, 12:00, 18:00
const MAX_PREVIEW = 3; // max magnet rows shown on card

// ── Environment Helper ──
const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

// ── State ──────────────────────────────────────────────
let resources = [];

// ── DOM Refs ───────────────────────────────────────────
const urlInput = document.getElementById('urlInput');
const addUrlBtn = document.getElementById('addUrlBtn');
const refreshAllBtn = document.getElementById('refreshAllBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const copyAllLatestBtn = document.getElementById('copyAllLatestBtn');
const openInTabBtn = document.getElementById('openInTabBtn');
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

// ── Init Theme ─────────────────────────────────────────
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(mode) {
  const theme = mode === 'auto' ? getSystemTheme() : mode;
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(mode);
}

function initTheme() {
  const savedMode = localStorage.getItem('magnettracker_theme') || 'auto';
  applyTheme(savedMode);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentMode = localStorage.getItem('magnettracker_theme') || 'auto';
      // Cycle: auto -> light -> dark -> auto
      let nextMode = 'auto';
      if (currentMode === 'auto') nextMode = 'light';
      else if (currentMode === 'light') nextMode = 'dark';

      localStorage.setItem('magnettracker_theme', nextMode);
      applyTheme(nextMode);
    });
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('magnettracker_theme') || 'auto') === 'auto') {
      applyTheme('auto');
    }
  });
}

function updateThemeIcon(mode) {
  if (!themeToggleBtn || !themeIcon) return;
  if (mode === 'light') {
    // Sun icon
    themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
    themeToggleBtn.title = "当前: 白天模式 (点击切换为夜间)";
  } else if (mode === 'dark') {
    // Moon icon
    themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
    themeToggleBtn.title = "当前: 夜间模式 (点击切换为跟随系统)";
  } else {
    // Auto (Monitor) icon
    themeIcon.innerHTML = `<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>`;
    themeToggleBtn.title = "当前: 跟随系统 (点击切换为白天)";
  }
}
initTheme();

// ── Init ───────────────────────────────────────────────
document.getElementById('example1').addEventListener('click', () => addUrl(EXAMPLE_URLS[0]));
document.getElementById('example2').addEventListener('click', () => addUrl(EXAMPLE_URLS[1]));
addUrlBtn.addEventListener('click', () => addUrl(urlInput.value.trim()));
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(urlInput.value.trim()); });
refreshAllBtn.addEventListener('click', refreshAll);
copyAllLatestBtn.addEventListener('click', copyAllLatest);
if (openInTabBtn) openInTabBtn.addEventListener('click', () => { chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }); });
resFilter.addEventListener('change', renderAll);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// Add event delegation for dynamic buttons
cardsGrid.addEventListener('click', handleAction);
modalBody.addEventListener('click', handleAction);

function handleAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'delete') deleteResource(id);
  else if (action === 'refresh-one') refreshOne(id);
  else if (action === 'open-modal') openMagnetModal(id);
  else if (action === 'copy-magnet') {
    const href = btn.dataset.href;
    const hash = btn.dataset.hash;
    copyMagnet(btn, href, id, hash);
  }
}

async function init() {
  resources = await loadResources();
  renderAll();
  checkAutoRefresh();

  // If any resource was restored from sync without magnets, trigger a refresh
  if (resources.some(r => r._needsRefresh)) {
    console.log('[MagnetTracker] Restored tracked items from sync, performing initial fetch...');
    refreshAll();
  }
}
init();

async function checkAutoRefresh() {
  const now = new Date();
  const currentHour = now.getHours();
  // Use local date string instead of ISO to ensure day-to-day consistency in any timezone
  const todayStr = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD in Swedish locale is reliable

  // Find the active slot (the most recent scheduled hour that has passed)
  // Slots: [7, 12, 18]
  let activeSlot = null;
  for (const slot of AUTO_REFRESH_SLOTS) {
    if (currentHour >= slot) {
      activeSlot = slot;
    }
  }

  if (activeSlot === null) return;

  const lastRefresh = await getStorageItem(STORAGE_KEY_AUTO_REFRESH) || {};

  // If we haven't refreshed for this slot today, do it now
  if (lastRefresh.date !== todayStr || lastRefresh.slot !== activeSlot) {
    console.log(`[MagnetTracker] Auto-refresh triggered for slot: ${activeSlot}:00`);
    showStatus(`正在自动刷新 (${activeSlot}:00 档期)...`);
    
    await refreshAll();
    
    // Save that we've done this slot today
    await setStorageItem(STORAGE_KEY_AUTO_REFRESH, { date: todayStr, slot: activeSlot });
    
    hideStatus();
  }
}

// ── Storage Change Listener ──────────────────────────────
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      resources = changes[STORAGE_KEY].newValue ?? [];
      renderAll();
    }
  });
}

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

  // 1. Try Direct Fetch if in Extension (privileged)
  if (isExtension) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const html = await smartDecode(buffer);
        if (html && html.length > 200) return html;
      }
    } catch (e) {
      console.warn('[MagnetTracker] Direct fetch failed, falling back to proxies:', e.message);
    }
  }

  // 2. Try Proxies
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
      }

      if (!html || html.length < 200) throw new Error('响应内容过短');
      return html;
    } catch (e) {
      lastError = e;
      console.warn('[MagnetTracker] Proxy failed:', proxy.type, e.message);
    }
  }
  throw new Error(`所有获取方式均失败：${lastError?.message || '网络错误'}`);
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
  const isDmhy = sourceUrl.includes('dmhy.org');

  // ── Title ──
  let title = '';
  if (isDmhy) {
    // Try to get keyword from input or title
    const kwInput = doc.querySelector('#keyword');
    const titleMatch = doc.title.match(/^(.+?)\s+-\s+动漫花园/);
    title = (kwInput && kwInput.value.trim()) ? kwInput.value.trim() : (titleMatch ? titleMatch[1] : doc.title);
    if (title) title = `[动漫花园] ${title}`;
  } else {
    const h1 = doc.querySelector('h1');
    const titleEl = doc.querySelector('title');
    title = (h1 ? h1.textContent : (titleEl ? titleEl.textContent : ''))
      .trim();
  }
  title = title.replace(/[\r\n]+/g, ' ');

  // ── Update Date ──
  // The page has patterns like "更新：2026-3-7" or "更新: 2026-3-7" in metadata
  let updateDate = null;

  if (isDmhy) {
    // Strategy for DMHY: look for the absolute date in the hidden span, fallback to td text
    const firstDateTd = doc.querySelector('#topic_list tbody tr td:nth-child(1)');
    if (firstDateTd) {
      const span = firstDateTd.querySelector('span');
      updateDate = normalizeDate((span || firstDateTd).textContent);
    }
  }

  if (!updateDate) {
    const bodyText = doc.body ? doc.body.innerText || doc.body.textContent : html;
    // Strategy 1: look for 更新：YYYY-M-D pattern
    const updateMatch = bodyText.match(/更新[：:]\s*(\d{4}[-年\.\/]\d{1,2}[-月\.\/]\d{1,2})/);
    if (updateMatch) {
      updateDate = normalizeDate(updateMatch[1]);
    }
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
    const hashMatch = href.match(/btih:([a-zA-Z0-9]{32,40})/i);
    const hash = hashMatch ? hashMatch[1].toUpperCase() : null;
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);

    // extract display name from anchor text or title or dn= param
    const dnMatch = href.match(/[?&]dn=([^&]+)/);
    const dn = dnMatch ? decodeURIComponent(dnMatch[1]).replace(/\+/g, ' ') : null;

    // For DMHY, the magnet link is often in an icon, so we look for sibling text or nearby link text
    let text = a.textContent.trim();
    if (isDmhy && !text) {
      // Look for the title link in the same row
      const row = a.closest('tr');
      const titleLink = row ? row.querySelector('.title a[target="_blank"]') : null;
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

  return { title, updateDate, magnets };
}

function normalizeDate(raw) {
  if (!raw) return null;
  let text = raw.trim();

  // Handle relative dates common in Chinese sites (like dmhy)
  const now = new Date();
  if (text.includes('今天')) {
    text = text.replace('今天', formatDate(now));
  } else if (text.includes('昨天')) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    text = text.replace('昨天', formatDate(yesterday));
  } else if (text.includes('前天')) {
    const beforeYesterday = new Date(now);
    beforeYesterday.setDate(now.getDate() - 2);
    text = text.replace('前天', formatDate(beforeYesterday));
  }

  // convert Chinese date chars and various separators to YYYY-MM-DD
  const cleaned = text
    .replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
    .replace(/[\/\.]/g, '-');

  // pad single-digit months and days
  const parts = cleaned.split('-');
  if (parts.length >= 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].replace(/[^\d]/g, '').slice(0, 2).padStart(2, '0');
    const timeMatch = cleaned.match(/(\d{2}:\d{2})/);
    return `${y}-${m}-${d}${timeMatch ? ' ' + timeMatch[1] : ''}`;
  }

  // for ISO dates like 2026-03-07T...
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}`;

  return text;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
        <button class="see-all-btn" data-action="open-modal" data-id="${r.id}">
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
        <button class="btn btn-icon" title="刷新" data-action="refresh-one" data-id="${r.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
        <button class="btn btn-icon btn-danger" title="删除" data-action="delete" data-id="${r.id}">
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
      <button class="magnet-copy-btn" data-action="copy-magnet" data-href="${escapedHref}" data-id="${m.resourceId}" data-hash="${m.hash}">
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

// ── Persistence ────────────────────────────────────────

async function getStorageItem(key) {
  if (isExtension) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }
  const val = localStorage.getItem(key);
  try { return val ? JSON.parse(val) : undefined; } catch { return val; }
}

async function setStorageItem(key, value) {
  if (isExtension) {
    return chrome.storage.local.set({ [key]: value });
  }
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

async function saveResources() {
  // Sync Data: Only metadata for across-device persistence (100KB limit)
  const syncData = resources.map(r => ({
    id: r.id,
    url: r.url,
    title: r.title,
    copiedHashes: r.copiedHashes || []
  }));

  try {
    if (isExtension) {
      // Chrome Sync: persists even if uninstalled
      await chrome.storage.sync.set({ [STORAGE_KEY_SYNC]: syncData });
      // Chrome Local: full detail cache
      await chrome.storage.local.set({ [STORAGE_KEY_LOCAL]: resources });
    } else {
      localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(resources));
    }
  } catch (err) {
    console.error('[MagnetTracker] Storage error:', err);
    if (err.message?.includes('QUOTA_BYTES')) {
      showError('同步空间(100KB)已满，仅保存于本地。');
    }
  }
}

async function loadResources() {
  if (isExtension) {
    try {
      const syncRes = await chrome.storage.sync.get(STORAGE_KEY_SYNC);
      const syncData = syncRes[STORAGE_KEY_SYNC] || [];
      
      const localRes = await chrome.storage.local.get(STORAGE_KEY_LOCAL);
      const localData = localRes[STORAGE_KEY_LOCAL] || [];
      
      // Case 1: Fresh install or local cleared - recover from sync
      if (syncData.length > 0 && localData.length === 0) {
        return syncData.map(s => ({
          ...s,
          magnets: [],
          lastUpdate: null,
          _needsRefresh: true
        }));
      }
      
      // Case 2: Merge synced copy status and catch new background additions
      const merged = syncData.map(s => {
        const local = localData.find(l => l.url === s.url);
        if (local) {
          // Exists locally: merge state
          return {
            ...local,
            copiedHashes: s.copiedHashes || [],
            title: s.title || local.title
          };
        } else {
          // New background addition: mark for refresh
          return {
            ...s,
            magnets: [],
            lastUpdate: null,
            _needsRefresh: true
          };
        }
      });

      return merged;
    } catch (err) {
      console.error('[MagnetTracker] Load error:', err);
      return [];
    }
  }
  const val = localStorage.getItem(STORAGE_KEY_LOCAL);
  try { return val ? (JSON.parse(val) || []) : []; } catch { return []; }
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
