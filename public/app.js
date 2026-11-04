const page = document.getElementById('page');
const topbarDate = document.getElementById('topbarDate');
const statusDot = document.getElementById('statusDot');
const statusCountdown = document.getElementById('statusCountdown');

const searchToggle = document.getElementById('searchToggle');
const searchPanel = document.getElementById('searchPanel');
const searchInput = document.getElementById('searchInput');
const menuToggle = document.getElementById('menuToggle');
const menuPanel = document.getElementById('menuPanel');
const refreshBtn = document.getElementById('refreshBtn');
const refreshSelect = document.getElementById('refreshInterval');
const timeRangeSelect = document.getElementById('timeRange');
const specificDate = document.getElementById('specificDate');
const clearDateBtn = document.getElementById('clearDate');

const categoryChips = document.getElementById('categoryChips');
const languageSection = document.getElementById('languageSection');
const languageChips = document.getElementById('languageChips');
const providerNote = document.getElementById('providerNote');

const readerPanel = document.getElementById('readerPanel');
const readerFrame = document.getElementById('readerFrame');
const readerSource = document.getElementById('readerSource');
const readerOpenNewTab = document.getElementById('readerOpenNewTab');
const readerClose = document.getElementById('readerClose');

const state = {
  category: 'general',
  query: '',
  range: 'today',
  date: '',
  lang: 'en',
  knownUrls: new Set(),
  timer: null,
  nextRefreshAt: null,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function relTime(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function sourceOf(article) {
  if (article.source) return article.source;
  try {
    return new URL(article.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function signalClass(signal) {
  if (signal.isSatire) return 'satire';
  if (signal.score >= 78) return 'strong';
  if (signal.score >= 50) return 'mixed';
  return 'weak';
}

function signalTagHTML(signal) {
  const cls = signalClass(signal);
  const reasons = escapeHtml((signal.reasons || []).join('; '));
  return `<span class="tag tag-signal-${cls}" title="${reasons}">${escapeHtml(signal.label)}</span>`;
}

// ---------------------------------------------------------------------------
// Rendering — every article gets the exact same row treatment (thumbnail,
// title, description, source/date/signal), stacked in one straight list in
// the order the API returned them. No article is singled out as a "hero."
// ---------------------------------------------------------------------------

function articleRowHTML(a) {
  const href = escapeHtml(a.url);
  const src = escapeHtml(sourceOf(a));
  return `
  <a class="article-row" href="${href}" data-source="${src}">
    <span class="article-thumb">
      ${a.image ? `<img src="${escapeHtml(a.image)}" alt="" loading="lazy" />` : '<span class="tile-noimg"></span>'}
    </span>
    <span class="article-body">
      <span class="article-title">${escapeHtml(a.title)}</span>
      ${a.description ? `<span class="article-desc">${escapeHtml(a.description)}</span>` : ''}
      <span class="article-meta">
        <span class="tag">${src}</span>
        ${signalTagHTML(a.signal)}
        <time datetime="${a.publishedAt}">${formatDate(a.publishedAt)}</time>
        <span class="dot" aria-hidden="true">·</span>
        <span class="card-time" data-datetime="${a.publishedAt}">${relTime(a.publishedAt)}</span>
      </span>
    </span>
  </a>`;
}

function emptyStateHTML() {
  return `<div class="empty">No stories matched. Try another category, search term, or time range.</div>`;
}

function errorStateHTML(message) {
  return `<div class="empty empty-error">
    <strong>Couldn't load the wire.</strong>
    <p>${escapeHtml(message)}</p>
    <p class="empty-hint">First run? Copy .env.example to .env, add at least one of NEWSAPI_KEY / GNEWS_KEY / NEWSDATA_KEY, and restart the server.</p>
  </div>`;
}

function renderPage(articles) {
  if (!articles.length) {
    page.innerHTML = emptyStateHTML();
    return;
  }
  page.innerHTML = `<div class="article-list">${articles.map(articleRowHTML).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function resetCountdown() {
  const ms = Number(refreshSelect.value);
  state.nextRefreshAt = ms > 0 ? Date.now() + ms : null;
}

function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function loadNews({ force } = {}) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  else params.set('category', state.category);
  params.set('lang', state.lang);
  params.set('range', state.range);
  if (state.date) params.set('date', state.date);
  if (force) params.set('force', '1');

  try {
    const res = await fetch(`/api/news?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');

    const incoming = data.articles || [];
    incoming.forEach((a) => state.knownUrls.add(a.url));

    renderPage(incoming);
    page.setAttribute('aria-busy', 'false');
    statusDot.classList.add('live');
    resetCountdown();
    flashRefreshed();
  } catch (err) {
    statusDot.classList.remove('live');
    page.innerHTML = errorStateHTML(err.message);
    page.setAttribute('aria-busy', 'false');
  }
}

// Visible confirmation that a refresh actually completed, even when the
// content looks identical (e.g. the server's own cache, or the source
// genuinely hasn't published anything new since the last check).
let flashTimer;
function flashRefreshed() {
  clearTimeout(flashTimer);
  statusDot.classList.add('flash');
  flashTimer = setTimeout(() => statusDot.classList.remove('flash'), 700);
}

function resetFeed() {
  page.setAttribute('aria-busy', 'true');
  page.innerHTML = `<div class="empty">Tuning in…</div>`;
  loadNews();
}

function scheduleAutoRefresh() {
  if (state.timer) clearInterval(state.timer);
  const ms = Number(refreshSelect.value);
  if (ms > 0) state.timer = setInterval(loadNews, ms);
  resetCountdown();
}

async function loadMeta() {
  try {
    const res = await fetch('/api/meta');
    const data = await res.json();
    if (data.languages && data.languages.length > 1) {
      languageChips.innerHTML = data.languages
        .map((l, i) => `<button class="chip${i === 0 ? ' active' : ''}" data-lang="${l.code}" type="button">${escapeHtml(l.label)}</button>`)
        .join('');
      languageSection.hidden = false;
      if (data.note) {
        providerNote.textContent = data.note;
        providerNote.hidden = false;
      }
    }
    if (data.historySupported) {
      timeRangeSelect.insertAdjacentHTML('beforeend', '<option value="week">Past week</option><option value="month">Past month</option>');
    }
  } catch {
    // Meta is a nice-to-have; if it fails, the app just stays on English/Today.
  }
}

// ---------------------------------------------------------------------------
// Reader panel — opens as a side panel that shrinks the page rather than
// covering it, so the rest of the feed stays visible and scrollable.
// ---------------------------------------------------------------------------

function openReader(url, sourceLabel) {
  readerSource.textContent = sourceLabel || '';
  readerOpenNewTab.href = url;
  readerFrame.src = url;
  readerPanel.classList.add('open');
  readerPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('reader-open');
}

function closeReader() {
  readerPanel.classList.remove('open');
  readerPanel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('reader-open');
  readerFrame.src = 'about:blank';
}

page.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link || !page.contains(link)) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openReader(link.href, link.dataset.source || '');
});

readerClose.addEventListener('click', closeReader);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (readerPanel.classList.contains('open')) { closeReader(); return; }
  if (!searchPanel.hidden) closeDropdown(searchPanel, searchToggle);
  if (!menuPanel.hidden) closeDropdown(menuPanel, menuToggle);
});

// ---------------------------------------------------------------------------
// Nav, search, and menu controls
// ---------------------------------------------------------------------------

categoryChips.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-link');
  if (!btn) return;
  [...categoryChips.children].forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  state.category = btn.dataset.cat;
  state.query = '';
  searchInput.value = '';
  closeDropdown(searchPanel, searchToggle);
  resetFeed();
});

languageChips.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  [...languageChips.children].forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  state.lang = btn.dataset.lang;
  resetFeed();
});

timeRangeSelect.addEventListener('change', () => {
  state.range = timeRangeSelect.value;
  state.date = '';
  specificDate.value = '';
  clearDateBtn.hidden = true;
  resetFeed();
});

specificDate.addEventListener('change', () => {
  if (!specificDate.value) return;
  state.date = specificDate.value;
  state.range = 'today'; // irrelevant once a date is set, but keeps the select's meaning consistent if cleared later
  clearDateBtn.hidden = false;
  resetFeed();
});

clearDateBtn.addEventListener('click', () => {
  state.date = '';
  specificDate.value = '';
  clearDateBtn.hidden = true;
  resetFeed();
});

let searchDebounce;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.query = e.target.value.trim();
    resetFeed();
  }, 500);
});

refreshBtn.addEventListener('click', () => loadNews({ force: true }));
refreshSelect.addEventListener('change', scheduleAutoRefresh);

function closeDropdown(panel, btn) {
  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function toggleDropdown(panel, btn, otherPanel, otherBtn) {
  const willOpen = panel.hidden;
  closeDropdown(otherPanel, otherBtn);
  panel.hidden = !willOpen;
  btn.setAttribute('aria-expanded', String(willOpen));
  if (willOpen && panel === searchPanel) searchInput.focus();
}

searchToggle.addEventListener('click', () => toggleDropdown(searchPanel, searchToggle, menuPanel, menuToggle));
menuToggle.addEventListener('click', () => toggleDropdown(menuPanel, menuToggle, searchPanel, searchToggle));

document.addEventListener('click', (e) => {
  if (!searchPanel.hidden && !searchPanel.contains(e.target) && !searchToggle.contains(e.target)) {
    closeDropdown(searchPanel, searchToggle);
  }
  if (!menuPanel.hidden && !menuPanel.contains(e.target) && !menuToggle.contains(e.target)) {
    closeDropdown(menuPanel, menuToggle);
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function updateTopbarDate() {
  topbarDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

setInterval(() => {
  document.querySelectorAll('.card-time').forEach((el) => {
    el.textContent = relTime(el.dataset.datetime);
  });
}, 15000);

setInterval(() => {
  if (state.nextRefreshAt == null) {
    statusCountdown.textContent = 'auto-refresh off';
    return;
  }
  const remaining = Math.max(0, Math.round((state.nextRefreshAt - Date.now()) / 1000));
  statusCountdown.textContent = `next update in ${formatCountdown(remaining)}`;
}, 1000);

function toYMD(d) {
  return d.toISOString().slice(0, 10);
}

function setDateBounds() {
  const today = new Date();
  specificDate.max = toYMD(today);
  // Soft guidance only — matches the "past month" safety margin server-side.
  // A provider may still reject a date near this edge; the server surfaces
  // that as a clear error rather than the date input silently refusing it.
  const earliest = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
  specificDate.min = toYMD(earliest);
}

updateTopbarDate();
setDateBounds();
loadNews();
loadMeta();
scheduleAutoRefresh();
