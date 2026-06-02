'use strict';

/* ===== Image Compression ===== */
async function compressImage(source) {
  const url = URL.createObjectURL(source instanceof Blob ? source : new Blob([source]));
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const MAX = 1200;
    let { naturalWidth: w, naturalHeight: h } = img;
    if (w > MAX || h > MAX) {
      if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
      else         { w = Math.round(w * MAX / h); h = MAX; }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ===== Storage ===== */
const STORAGE_KEY = 'reading-log';

function loadBooks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ===== Sync ===== */
const SYNC_URL = 'https://reading-proxy.kdw12357.workers.dev/sync';
const SYNC_SECRET_KEY = 'syncSecret';
const SYNC_CONFLICT_NOTICED_KEY = 'syncConflictNoticed';
let syncState = { status: 'idle', lastSyncedAt: null };

function getSyncSecret() {
  return localStorage.getItem(SYNC_SECRET_KEY) || '';
}

function setSyncSecret(secret) {
  localStorage.setItem(SYNC_SECRET_KEY, secret);
}

function clearSyncSecret() {
  localStorage.removeItem(SYNC_SECRET_KEY);
}

function formatSyncTime(ts) {
  if (!ts) return '방금';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return '방금';
  if (diff < 60) return `${diff}분 전`;
  const h = Math.floor(diff / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

function updateSyncStatus(status, ts) {
  syncState.status = status;
  if (ts) syncState.lastSyncedAt = ts;

  const textEl = document.getElementById('sync-status-text');
  const bar = document.getElementById('sync-indicator');
  if (!textEl || !bar) return;

  const map = {
    syncing:  { text: '동기화 중...', cls: 'sync-syncing' },
    synced:   { text: `동기화됨 (${formatSyncTime(syncState.lastSyncedAt)})`, cls: 'sync-ok' },
    offline:  { text: '오프라인 – 캐시 데이터 표시 중', cls: 'sync-offline' },
    failed:   { text: '동기화 실패', cls: 'sync-failed' },
    'no-key': { text: '비밀 키 없음 – 설정에서 입력해주세요', cls: 'sync-nokey' },
  };

  const info = map[status];
  if (!info) { bar.classList.add('hidden'); return; }

  textEl.textContent = info.text;
  bar.className = `sync-indicator ${info.cls}`;
}

async function syncFetch() {
  const res = await fetch(SYNC_URL, {
    headers: { 'X-Sync-Secret': getSyncSecret() },
  });
  if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function syncPush(books) {
  const res = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': getSyncSecret() },
    body: JSON.stringify({ books }),
  });
  if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function startupSync() {
  if (!getSyncSecret()) { updateSyncStatus('no-key'); return; }

  updateSyncStatus('syncing');
  try {
    const data = await syncFetch();
    if (data.updatedAt && Array.isArray(data.books)) {
      saveBooks(data.books);
      updateSyncStatus('synced', data.updatedAt);
      route();
    } else {
      const local = loadBooks();
      if (local.length > 0) {
        const result = await syncPush(local);
        updateSyncStatus('synced', result.updatedAt);
      } else {
        updateSyncStatus('synced', new Date().toISOString());
      }
    }
  } catch (err) {
    if (err.code === 401) {
      updateSyncStatus('failed');
      showToast('동기화 비밀 키가 올바르지 않습니다. 설정에서 확인해주세요.');
      openSettingsModal();
    } else {
      updateSyncStatus('offline');
    }
  }
}

async function manualSync() {
  if (!getSyncSecret()) {
    showToast('동기화 비밀 키가 없습니다. 설정에서 입력해주세요.');
    openSettingsModal();
    return;
  }

  updateSyncStatus('syncing');
  try {
    const data = await syncFetch();
    if (data.updatedAt && Array.isArray(data.books)) {
      saveBooks(data.books);
      updateSyncStatus('synced', data.updatedAt);
      route();
      showToast(`동기화 완료 (${data.books.length}권)`);
    } else {
      const local = loadBooks();
      const result = await syncPush(local);
      updateSyncStatus('synced', result.updatedAt);
      showToast('로컬 데이터를 서버에 업로드했습니다.');
    }
  } catch (err) {
    if (err.code === 401) {
      updateSyncStatus('failed');
      showToast('동기화 실패: 비밀 키를 확인해주세요.');
      openSettingsModal();
    } else {
      updateSyncStatus('offline');
      showToast('동기화 실패: 네트워크를 확인해주세요.');
    }
  }
}

async function saveBooksAndSync(books) {
  saveBooks(books);
  if (!getSyncSecret()) return;
  updateSyncStatus('syncing');
  try {
    const result = await syncPush(books);
    updateSyncStatus('synced', result.updatedAt);
  } catch (err) {
    updateSyncStatus('failed');
    showToast(err.code === 401
      ? '동기화 실패: 비밀 키를 확인해주세요.'
      : '동기화 실패 – 로컬에는 저장됐습니다.');
  }
}

/* ===== Book Detail Modal ===== */
let currentDetailId = null;

function openBookDetailModal(bookId) {
  const book = loadBooks().find(b => b.id === bookId);
  if (!book) return;
  currentDetailId = bookId;

  const coverEl = document.getElementById('book-detail-cover');
  const placeholderEl = document.getElementById('book-detail-cover-placeholder');
  if (book.coverImage) {
    coverEl.src = book.coverImage;
    coverEl.alt = book.title || '';
    coverEl.classList.remove('hidden');
    placeholderEl.classList.add('hidden');
  } else {
    coverEl.classList.add('hidden');
    placeholderEl.classList.remove('hidden');
  }

  document.getElementById('book-detail-title').textContent = book.title || '';
  document.getElementById('book-detail-author').textContent = book.author || '-';
  document.getElementById('book-detail-publisher').textContent = book.publisher || '-';
  document.getElementById('book-detail-genre').textContent = book.genre || '-';
  document.getElementById('book-detail-period').textContent = formatPeriod(book.startDate, book.endDate);
  document.getElementById('book-detail-ownership').textContent = book.ownership || '-';
  document.getElementById('book-detail-book-type').textContent = book.bookType || '-';

  const ratingRow = document.getElementById('book-detail-rating-row');
  const ratingEl = document.getElementById('book-detail-rating');
  if (book.rating) {
    ratingEl.textContent = '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating);
    ratingRow.classList.remove('hidden');
  } else {
    ratingRow.classList.add('hidden');
  }

  document.getElementById('btn-detail-modal-edit').dataset.id = bookId;
  document.getElementById('btn-detail-modal-delete').dataset.id = bookId;

  const reviewSection = document.getElementById('book-detail-review-section');
  const reviewEl = document.getElementById('book-detail-review');
  if (book.review && book.review.trim()) {
    reviewEl.textContent = book.review;
    reviewSection.classList.remove('hidden');
  } else {
    reviewSection.classList.add('hidden');
  }

  document.getElementById('modal-book-detail').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBookDetailModal() {
  document.getElementById('modal-book-detail').classList.add('hidden');
  document.body.style.overflow = '';
  currentDetailId = null;
}

/* ===== Book Preview Modal ===== */
let currentPreviewId = null;

function openBookPreviewModal(bookId) {
  const book = loadBooks().find(b => b.id === bookId);
  if (!book) return;
  currentPreviewId = bookId;

  const coverImg = document.getElementById('preview-cover-img');
  const coverPlaceholder = document.getElementById('preview-cover-placeholder');
  if (book.coverImage) {
    coverImg.src = book.coverImage;
    coverImg.alt = book.title || '';
    coverImg.classList.remove('hidden');
    coverPlaceholder.classList.add('hidden');
  } else {
    coverImg.classList.add('hidden');
    coverPlaceholder.classList.remove('hidden');
  }

  const genreWrap = document.getElementById('preview-genre-wrap');
  if (book.genre) {
    const color = getGenreColor(book.genre);
    genreWrap.innerHTML = `<span class="book-card-genre preview-genre-badge" style="background:${color.bg};color:${color.text};">${escapeHtml(book.genre)}</span>`;
  } else {
    genreWrap.innerHTML = '';
  }

  document.getElementById('preview-title').textContent = book.title || '';

  const authorEl = document.getElementById('preview-author');
  authorEl.textContent = book.author || '';
  authorEl.classList.toggle('hidden', !book.author);

  const publisherEl = document.getElementById('preview-publisher');
  publisherEl.textContent = book.publisher || '';
  publisherEl.classList.toggle('hidden', !book.publisher);

  const ratingEl = document.getElementById('preview-rating');
  if (book.rating) {
    ratingEl.textContent = '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating);
    ratingEl.classList.remove('hidden');
  } else {
    ratingEl.classList.add('hidden');
  }

  const period = formatPeriod(book.startDate, book.endDate);
  const periodEl = document.getElementById('preview-period');
  if (period && period !== '-') {
    periodEl.textContent = period;
    periodEl.classList.remove('hidden');
  } else {
    periodEl.classList.add('hidden');
  }

  document.getElementById('modal-book-preview').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBookPreviewModal() {
  document.getElementById('modal-book-preview').classList.add('hidden');
  document.body.style.overflow = '';
  currentPreviewId = null;
}

function goToPreviewDetail() {
  const id = currentPreviewId;
  closeBookPreviewModal();
  if (id) openBookDetailModal(id);
}

/* ===== Genre Books Modal ===== */
function openGenreBooksModal(year, genre, books) {
  document.getElementById('genre-modal-title').textContent = `${year}년 · ${genre} (${books.length}권)`;
  document.getElementById('genre-books-grid').innerHTML = books.map(book => bookCard(book)).join('');
  document.getElementById('modal-genre-books').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeGenreBooksModal() {
  document.getElementById('modal-genre-books').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ===== Settings Modal ===== */
function openSettingsModal() {
  document.getElementById('input-sync-secret').value = getSyncSecret();
  document.getElementById('input-sync-secret').type = 'password';
  document.getElementById('btn-toggle-secret').textContent = '표시';
  document.getElementById('modal-settings').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
  document.getElementById('modal-settings').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ===== Toast ===== */
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 2400);
}

/* ===== 독서결산 상태 ===== */
let currentSummaryYear = new Date().getFullYear();
let currentTimelineYear = new Date().getFullYear();
let currentTimelineMonth = new Date().getMonth() + 1;
let currentGalleryFilter = 'all';

/* ===== Router ===== */
function route() {
  const hash = location.hash || '#gallery';
  const [path] = hash.split('?');

  if (path === '#gallery' || path === '') {
    setActiveTab('gallery');
    renderGallery();
  } else if (path === '#summary') {
    setActiveTab('summary');
    renderSummary();
  } else if (path.startsWith('#detail/')) {
    const id = path.replace('#detail/', '');
    renderDetail(id);
  } else {
    setActiveTab('gallery');
    renderGallery();
  }
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.classList.add('active');
}

/* ===== 모달 ===== */
function openFormModal(editId) {
  renderForm(editId);
  document.getElementById('modal-form').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFormModal() {
  document.getElementById('modal-form').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ===== Book Status ===== */
function getBookStatus(book) {
  if (book.status) return book.status;
  if (book.startDate && book.endDate) return 'done';
  if (book.startDate) return 'reading';
  return 'want';
}

function migrateBookStatuses() {
  const books = loadBooks();
  let changed = false;
  const updated = books.map(book => {
    if (!book.status) {
      changed = true;
      return { ...book, status: getBookStatus(book) };
    }
    return book;
  });
  if (changed) saveBooks(updated);
}

/* ===== Gallery View ===== */
function getBookYear(book) {
  const d = book.endDate || book.startDate;
  return d ? d.slice(0, 4) : '날짜 미입력';
}

function renderGallery() {
  showView('view-gallery');
  const allBooks = loadBooks();
  const tabsEl = document.getElementById('gallery-filter-tabs');
  const container = document.getElementById('gallery-container');
  const empty = document.getElementById('gallery-empty');

  if (allBooks.length === 0) {
    tabsEl.innerHTML = '';
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  const counts = {
    all: allBooks.length,
    want: allBooks.filter(b => getBookStatus(b) === 'want').length,
    reading: allBooks.filter(b => getBookStatus(b) === 'reading').length,
    done: allBooks.filter(b => getBookStatus(b) === 'done').length,
  };

  renderGalleryFilterTabs(counts);

  const books = currentGalleryFilter === 'all'
    ? allBooks
    : allBooks.filter(b => getBookStatus(b) === currentGalleryFilter);

  if (books.length === 0) {
    const filterLabels = { want: '읽을 책', reading: '읽는 중', done: '읽은 책' };
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📖</div>
        <p class="empty-title">${filterLabels[currentGalleryFilter]} 상태의 책이 없어요</p>
      </div>`;
    return;
  }

  const groups = books.reduce((acc, book) => {
    const year = getBookYear(book);
    if (!acc[year]) acc[year] = [];
    acc[year].push(book);
    return acc;
  }, {});

  const sortedYears = Object.keys(groups).sort((a, b) => {
    if (a === '날짜 미입력') return 1;
    if (b === '날짜 미입력') return -1;
    return Number(b) - Number(a);
  });

  container.innerHTML = sortedYears.map(year => {
    const yearBooks = groups[year];
    const cards = yearBooks.map(book => bookCard(book)).join('');
    const yearLabel = year === '날짜 미입력' ? '날짜 미입력' : `${year}년`;
    return `
      <div class="year-section">
        <h2 class="year-heading">
          ${escapeHtml(yearLabel)}
          <span class="book-count">${yearBooks.length}권</span>
        </h2>
        <div class="book-grid">${cards}</div>
      </div>
    `;
  }).join('');
}

function renderGalleryFilterTabs(counts) {
  const tabsEl = document.getElementById('gallery-filter-tabs');
  if (!tabsEl) return;
  const filters = [
    { key: 'all',     label: '전체' },
    { key: 'want',    label: '읽을 책' },
    { key: 'reading', label: '읽는 중' },
    { key: 'done',    label: '읽은 책' },
  ];
  tabsEl.innerHTML = `
    <div class="gallery-filter-bar">
      <select class="gallery-filter-select" id="gallery-filter-select">
        ${filters.map(({ key, label }) =>
          `<option value="${key}"${currentGalleryFilter === key ? ' selected' : ''}>${label} (${counts[key]})</option>`
        ).join('')}
      </select>
    </div>`;

  document.getElementById('gallery-filter-select').addEventListener('change', (e) => {
    currentGalleryFilter = e.target.value;
    renderGallery();
  });
}

function bookCard(book) {
  const status = getBookStatus(book);
  const statusBadge =
    status === 'reading' ? '<div class="status-badge status-reading">읽는 중</div>' :
    status === 'want'    ? '<div class="status-badge status-want">읽을 책</div>' :
                           '<div class="status-badge status-done">읽은 책</div>';

  const cover = book.coverImage
    ? `<img src="${book.coverImage}" alt="${escapeHtml(book.title)}" loading="lazy" />`
    : `<div class="book-card-cover-placeholder">📗</div>`;

  return `
    <div class="book-card" data-id="${book.id}" role="button" tabindex="0" aria-label="${escapeHtml(book.title)}">
      <div class="book-card-cover">
        ${cover}
        ${statusBadge}
      </div>
      <div class="book-card-info">
        <div class="book-card-title">${escapeHtml(book.title)}</div>
        <div class="book-card-author">${escapeHtml(book.author || '')}</div>
        ${book.genre ? `<span class="book-card-genre">${escapeHtml(book.genre)}</span>` : ''}
        ${book.rating ? `<div class="book-card-rating">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>` : ''}
      </div>
    </div>
  `;
}

/* ===== 독서결산 뷰 ===== */
const GENRE_COLORS = {
  '소설':    { bg: '#e8d4be', text: '#6b4423' },
  '에세이':  { bg: '#c8ddc4', text: '#2e5a28' },
  '자기계발': { bg: '#ede0b0', text: '#6b5a20' },
  '인문':    { bg: '#bccde8', text: '#254a78' },
  '경제경영': { bg: '#e8e4b0', text: '#5a5820' },
  '과학':    { bg: '#b0dedd', text: '#1e5a58' },
  '기타':    { bg: '#dfb0dd', text: '#582058' },
};

function getGenreColor(genre) {
  return GENRE_COLORS[genre] || GENRE_COLORS['기타'];
}

function renderSummary() {
  showView('view-summary');
  const books = loadBooks();
  const container = document.getElementById('summary-container');

  if (books.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p class="empty-title">아직 등록된 책이 없어요</p>
        <p class="empty-desc">책을 등록하면 독서 통계를 확인할 수 있어요.</p>
      </div>`;
    return;
  }

  const allYears = [...new Set(
    books.map(b => getBookYear(b)).filter(y => y !== '날짜 미입력')
  )].sort((a, b) => Number(b) - Number(a));

  if (!allYears.includes(String(currentSummaryYear))) {
    currentSummaryYear = allYears.length > 0 ? Number(allYears[0]) : new Date().getFullYear();
  }

  const yearBooks = books.filter(b => getBookYear(b) === String(currentSummaryYear));

  container.innerHTML =
    renderSummaryStatsHTML(allYears, yearBooks) +
    renderTimelineHTML(books);

  bindSummaryEvents(books);
}

function renderSummaryStatsHTML(allYears, yearBooks) {
  const thisYear = new Date().getFullYear();
  const years = allYears.length > 0 ? allYears : [String(thisYear)];
  const yearOptions = years.map(y =>
    `<option value="${y}" ${Number(y) === currentSummaryYear ? 'selected' : ''}>${y}년</option>`
  ).join('');

  const genreCounts = {};
  yearBooks.forEach(b => {
    const g = b.genre || '기타';
    genreCounts[g] = (genreCounts[g] || 0) + 1;
  });
  const sorted = Object.entries(genreCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const genreCards = sorted.map(([genre, count]) => {
    const color = getGenreColor(genre);
    return `
      <div class="genre-card" data-genre="${escapeHtml(genre)}" role="button" tabindex="0" style="background:${color.bg};color:${color.text};">
        <span class="genre-card-name">${escapeHtml(genre)}</span>
        <span class="genre-card-count">${count}</span>
      </div>`;
  }).join('');

  return `
    <div class="summary-stats-section">
      <div class="summary-section-header">
        <h2 class="summary-section-title">연간 독서 통계</h2>
        <select class="form-input summary-year-select" id="stats-year-select">${yearOptions}</select>
      </div>
      <div class="stats-year-header">${currentSummaryYear}년 · 총 <strong>${yearBooks.length}권</strong> 읽음</div>
      ${sorted.length > 0
        ? `<div class="genre-cards-row">${genreCards}</div>`
        : `<p class="summary-empty-text">이 해에 읽은 책이 없습니다.</p>`}
    </div>`;
}

function renderTimelineHTML(books) {
  const year = currentTimelineYear;
  const month = currentTimelineMonth;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const daysInMonth = monthEnd.getDate();

  const booksInMonth = books.filter(b => {
    if (!b.startDate && !b.endDate) return false;
    const s = b.startDate ? new Date(b.startDate) : new Date(b.endDate);
    const e = b.endDate ? new Date(b.endDate) : new Date(b.startDate);
    return s <= monthEnd && e >= monthStart;
  });

  // 연도·월 선택 옵션
  const allYearsSet = new Set(books.map(b => getBookYear(b)).filter(y => y !== '날짜 미입력'));
  allYearsSet.add(String(year));
  const allYearsSorted = [...allYearsSet].sort((a, b) => Number(a) - Number(b));

  const yearOpts = allYearsSorted.map(y =>
    `<option value="${y}" ${Number(y) === year ? 'selected' : ''}>${y}년</option>`
  ).join('');
  const monthOpts = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return `<option value="${m}" ${m === month ? 'selected' : ''}>${m}월</option>`;
  }).join('');

  // 오늘 날짜
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? today.getDate() : null;

  // 날짜 헤더
  const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const cls = d === todayDay ? 'tl-day-cell tl-today-header' : 'tl-day-cell';
    return `<div class="${cls}">${d}</div>`;
  }).join('');

  // 책 막대
  let barsHtml;
  if (booksInMonth.length === 0) {
    barsHtml = '<div class="tl-empty">이 달에 읽은 책이 없습니다.</div>';
  } else {
    barsHtml = booksInMonth.map(book => {
      const s = book.startDate ? new Date(book.startDate) : new Date(book.endDate);
      const e = book.endDate ? new Date(book.endDate) : new Date(book.startDate);
      const effStart = s < monthStart ? monthStart : s;
      const effEnd = e > monthEnd ? monthEnd : e;
      const startDay = effStart.getDate();
      const endDay = effEnd.getDate();
      const leftPct = ((startDay - 1) / daysInMonth * 100).toFixed(3);
      const widthPct = ((endDay - startDay + 1) / daysInMonth * 100).toFixed(3);
      const color = getGenreColor(book.genre);
      const extraStyle = [
        s < monthStart ? 'border-left:3px dashed rgba(0,0,0,0.15);border-top-left-radius:0;border-bottom-left-radius:0;' : '',
        e > monthEnd  ? 'border-right:3px dashed rgba(0,0,0,0.15);border-top-right-radius:0;border-bottom-right-radius:0;' : '',
      ].join('');

      return `
        <div class="tl-book-row">
          <div class="tl-bar"
            style="left:${leftPct}%;width:${widthPct}%;background:${color.bg};color:${color.text};${extraStyle}"
            data-id="${book.id}"
            title="${escapeHtml(book.title)}"
          >${escapeHtml(book.title)}</div>
        </div>`;
    }).join('');
  }

  const todayLineHtml = todayDay
    ? `<div class="tl-today-line" style="left:${((todayDay - 0.5) / daysInMonth * 100).toFixed(3)}%"></div>`
    : '';

  const dayPct = (100 / daysInMonth).toFixed(4);

  return `
    <div class="summary-timeline-section">
      <div class="summary-section-header">
        <h2 class="summary-section-title">독서 타임라인</h2>
      </div>
      <div class="timeline-nav">
        <button class="btn btn-ghost btn-sm" id="btn-prev-month">◀</button>
        <span class="timeline-month-label">${year}년 ${month}월</span>
        <button class="btn btn-ghost btn-sm" id="btn-next-month">▶</button>
        <div class="timeline-selectors">
          <select class="form-input timeline-sel" id="timeline-year-select">${yearOpts}</select>
          <select class="form-input timeline-sel" id="timeline-month-select">${monthOpts}</select>
        </div>
      </div>
      <div class="timeline-calendar">
        <div class="timeline-inner">
          <div class="tl-day-header" style="grid-template-columns:repeat(${daysInMonth},1fr)">
            ${dayHeaders}
          </div>
          <div class="tl-body" style="background-size:${dayPct}% 100%">
            ${todayLineHtml}
            ${barsHtml}
          </div>
        </div>
      </div>
    </div>`;
}

function bindSummaryEvents(books) {
  document.getElementById('stats-year-select')?.addEventListener('change', e => {
    currentSummaryYear = Number(e.target.value);
    renderSummary();
  });

  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    currentTimelineMonth--;
    if (currentTimelineMonth < 1) { currentTimelineMonth = 12; currentTimelineYear--; }
    renderSummary();
  });

  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    currentTimelineMonth++;
    if (currentTimelineMonth > 12) { currentTimelineMonth = 1; currentTimelineYear++; }
    renderSummary();
  });

  document.getElementById('timeline-year-select')?.addEventListener('change', e => {
    currentTimelineYear = Number(e.target.value);
    renderSummary();
  });

  document.getElementById('timeline-month-select')?.addEventListener('change', e => {
    currentTimelineMonth = Number(e.target.value);
    renderSummary();
  });

  document.querySelector('.tl-body')?.addEventListener('click', e => {
    const bar = e.target.closest('.tl-bar');
    if (bar) openBookPreviewModal(bar.dataset.id);
  });

  document.querySelector('.genre-cards-row')?.addEventListener('click', e => {
    const card = e.target.closest('[data-genre]');
    if (!card) return;
    const genre = card.dataset.genre;
    const books = loadBooks().filter(b =>
      getBookYear(b) === String(currentSummaryYear) && (b.genre || '기타') === genre
    );
    openGenreBooksModal(currentSummaryYear, genre, books);
  });

  document.querySelector('.genre-cards-row')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-genre]');
    if (!card) return;
    const genre = card.dataset.genre;
    const books = loadBooks().filter(b =>
      getBookYear(b) === String(currentSummaryYear) && (b.genre || '기타') === genre
    );
    openGenreBooksModal(currentSummaryYear, genre, books);
  });
}

/* ===== Form View ===== */
let currentCoverBase64 = null;
let currentRating = null;

function updateRatingDisplay(hoverVal) {
  const val = hoverVal !== undefined ? hoverVal : (currentRating || 0);
  document.querySelectorAll('#rating-input .star-btn').forEach(star => {
    star.classList.toggle('filled', Number(star.dataset.value) <= val);
  });
}

function renderForm(editId) {
  currentCoverBase64 = null;

  const titleEl = document.getElementById('form-title');
  const form = document.getElementById('book-form');

  form.reset();
  document.getElementById('book-id').value = '';
  hideCoverPreview();
  resetModalSearch();
  currentRating = null;
  updateRatingDisplay();
  updateFormFieldVisibility('done');

  if (editId) {
    const books = loadBooks();
    const book = books.find(b => b.id === editId);
    if (!book) {
      location.hash = '#gallery';
      return;
    }
    titleEl.textContent = '책 수정';
    document.getElementById('btn-submit-form').textContent = '수정하기';
    document.getElementById('book-id').value = book.id;
    document.getElementById('input-title').value = book.title || '';
    document.getElementById('input-author').value = book.author || '';
    document.getElementById('input-publisher').value = book.publisher || '';
    document.getElementById('input-genre').value = book.genre || '소설';
    document.getElementById('input-start-date').value = book.startDate || '';
    document.getElementById('input-end-date').value = book.endDate || '';
    document.getElementById('input-review').value = book.review || '';

    form.querySelector(`input[name="ownership"][value="${book.ownership}"]`).checked = true;
    form.querySelector(`input[name="bookType"][value="${book.bookType}"]`).checked = true;

    currentRating = book.rating || null;
    updateRatingDisplay();

    const bookStatus = book.status || getBookStatus(book);
    const statusRadio = form.querySelector(`input[name="status"][value="${bookStatus}"]`);
    if (statusRadio) statusRadio.checked = true;
    updateFormFieldVisibility(bookStatus);

    if (book.coverImage) {
      currentCoverBase64 = book.coverImage;
      showCoverPreview(book.coverImage);
    }
  } else {
    titleEl.textContent = '새 책 등록';
    document.getElementById('btn-submit-form').textContent = '등록하기';
  }
}

function showCoverPreview(src) {
  const preview = document.getElementById('cover-preview');
  const placeholder = document.getElementById('cover-placeholder');
  const removeBtn = document.getElementById('btn-remove-cover');
  preview.src = src;
  preview.classList.remove('hidden');
  placeholder.classList.add('hidden');
  removeBtn.classList.remove('hidden');
}

function hideCoverPreview() {
  const preview = document.getElementById('cover-preview');
  const placeholder = document.getElementById('cover-placeholder');
  const removeBtn = document.getElementById('btn-remove-cover');
  preview.src = '';
  preview.classList.add('hidden');
  placeholder.classList.remove('hidden');
  removeBtn.classList.add('hidden');
  currentCoverBase64 = null;
}

function updateFormFieldVisibility(status) {
  const datesSection = document.getElementById('dates-section');
  const endDateGroup = document.getElementById('end-date-group');
  const ratingSection = document.getElementById('rating-section');

  if (status === 'want') {
    datesSection.classList.add('hidden');
    ratingSection.classList.add('hidden');
  } else if (status === 'reading') {
    datesSection.classList.remove('hidden');
    endDateGroup.classList.add('hidden');
    ratingSection.classList.add('hidden');
  } else {
    datesSection.classList.remove('hidden');
    endDateGroup.classList.remove('hidden');
    ratingSection.classList.remove('hidden');
  }
}

/* ===== Detail View ===== */
function renderDetail(id) {
  showView('view-detail');
  const books = loadBooks();
  const book = books.find(b => b.id === id);

  if (!book) {
    location.hash = '#gallery';
    return;
  }

  document.getElementById('detail-title').textContent = book.title || '';
  document.getElementById('detail-author').textContent = book.author || '-';
  document.getElementById('detail-publisher').textContent = book.publisher || '-';
  document.getElementById('detail-genre').textContent = book.genre || '-';
  document.getElementById('detail-ownership').textContent = book.ownership || '-';
  document.getElementById('detail-book-type').textContent = book.bookType || '-';

  const period = formatPeriod(book.startDate, book.endDate);
  document.getElementById('detail-period').textContent = period;

  const coverEl = document.getElementById('detail-cover');
  const placeholderEl = document.getElementById('detail-cover-placeholder');
  if (book.coverImage) {
    coverEl.src = book.coverImage;
    coverEl.alt = book.title;
    coverEl.classList.remove('hidden');
    placeholderEl.classList.add('hidden');
  } else {
    coverEl.classList.add('hidden');
    placeholderEl.classList.remove('hidden');
  }

  const reviewSection = document.getElementById('detail-review-section');
  const reviewEl = document.getElementById('detail-review');
  if (book.review && book.review.trim()) {
    reviewEl.textContent = book.review;
    reviewSection.classList.remove('hidden');
  } else {
    reviewSection.classList.add('hidden');
  }

  const ratingRow = document.getElementById('detail-rating-row');
  const ratingEl = document.getElementById('detail-rating');
  if (book.rating) {
    ratingEl.textContent = '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating);
    ratingRow.classList.remove('hidden');
  } else {
    ratingRow.classList.add('hidden');
  }

  document.getElementById('btn-edit').dataset.id = id;
  document.getElementById('btn-delete').dataset.id = id;
}

function formatPeriod(start, end) {
  if (!start && !end) return '-';
  if (start && end) return `${formatDate(start)} ~ ${formatDate(end)}`;
  if (start) return `${formatDate(start)} 시작`;
  return `~ ${formatDate(end)}`;
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${y}.${m}.${day}`;
}

/* ===== Export / Import ===== */
function exportJSON() {
  const books = loadBooks();
  if (books.length === 0) {
    showToast('내보낼 데이터가 없습니다.');
    return;
  }
  const json = JSON.stringify(books, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reading-log-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON 파일로 내보냈습니다.');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('형식 오류');
      const existing = loadBooks();
      const msg = existing.length > 0
        ? `현재 데이터(${existing.length}권)를 덮어쓰고 가져온 데이터(${data.length}권)로 교체할까요?`
        : `데이터 ${data.length}권을 가져올까요?`;
      if (!confirm(msg)) return;
      saveBooksAndSync(data);
      showToast(`${data.length}권을 가져왔습니다.`);
      location.hash = '#gallery';
      renderGallery();
    } catch {
      showToast('올바른 JSON 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
}

function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/* ===== 책 검색 (네이버 프록시) ===== */
const SEARCH_PROXY = 'https://reading-proxy.kdw12357.workers.dev/';

function stripHtml(str) {
  return str ? str.replace(/<[^>]*>/g, '') : '';
}

function formatAuthor(str) {
  return str ? str.replace(/\^/g, ', ') : '';
}

async function searchBooks() {
  const keyword = document.getElementById('modal-search-input').value.trim();
  if (!keyword) {
    showToast('검색어를 입력해주세요.');
    return;
  }

  const statusEl = document.getElementById('modal-search-status');
  const resultsEl = document.getElementById('modal-search-results');

  statusEl.textContent = '검색 중...';
  statusEl.classList.remove('hidden');
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';

  try {
    const res = await fetch(`${SEARCH_PROXY}?query=${encodeURIComponent(keyword)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      statusEl.textContent = '검색 결과가 없습니다.';
      return;
    }

    statusEl.classList.add('hidden');
    renderSearchResults(items);
  } catch (err) {
    statusEl.textContent = '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
}

function renderSearchResults(items) {
  const resultsEl = document.getElementById('modal-search-results');
  resultsEl.innerHTML = items.map((item, idx) => {
    const title = escapeHtml(stripHtml(item.title));
    const author = escapeHtml(formatAuthor(stripHtml(item.author)));
    const publisher = escapeHtml(item.publisher || '');
    const imgSrc = escapeHtml(item.image || '');
    return `
      <div class="search-result-item" data-idx="${idx}" role="button" tabindex="0">
        <div class="result-cover-wrap">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${title}" class="result-cover" />`
            : `<div class="result-cover-placeholder">📗</div>`}
        </div>
        <div class="result-info">
          <div class="result-title">${title}</div>
          <div class="result-author">${author}</div>
          <div class="result-publisher">${publisher}</div>
        </div>
      </div>
    `;
  }).join('');

  resultsEl._items = items;
  resultsEl.classList.remove('hidden');
}

async function selectSearchResult(item) {
  document.getElementById('input-title').value = stripHtml(item.title);
  document.getElementById('input-author').value = formatAuthor(stripHtml(item.author));
  document.getElementById('input-publisher').value = item.publisher || '';

  const statusEl = document.getElementById('modal-search-status');
  const resultsEl = document.getElementById('modal-search-results');
  statusEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';
  document.getElementById('modal-search-input').value = '';

  if (item.image) {
    const statusEl = document.getElementById('modal-search-status');
    statusEl.textContent = '이미지 처리 중...';
    statusEl.classList.remove('hidden');
    try {
      const res = await fetch(item.image);
      const blob = await res.blob();
      currentCoverBase64 = await compressImage(blob);
      showCoverPreview(currentCoverBase64);
    } catch {
      currentCoverBase64 = item.image;
      showCoverPreview(item.image);
    } finally {
      statusEl.classList.add('hidden');
    }
  }
}

function resetModalSearch() {
  document.getElementById('modal-search-input').value = '';
  const statusEl = document.getElementById('modal-search-status');
  const resultsEl = document.getElementById('modal-search-results');
  statusEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';
}

/* ===== 유틸 ===== */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ===== 이벤트 바인딩 ===== */
function bindEvents() {
  // 탭 전환
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = `#${btn.dataset.tab}`;
    });
  });

  // 라우팅
  window.addEventListener('hashchange', route);

  // 갤러리 카드 클릭
  document.getElementById('gallery-container').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if (card) openBookDetailModal(card.dataset.id);
  });

  document.getElementById('gallery-container').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.book-card');
      if (card) openBookDetailModal(card.dataset.id);
    }
  });

  // 표지 이미지 업로드
  const coverArea = document.getElementById('cover-upload-area');
  const coverInput = document.getElementById('cover-input');

  coverArea.addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const placeholder = document.getElementById('cover-placeholder');
    const origText = placeholder.querySelector('.upload-text')?.textContent;
    if (placeholder.querySelector('.upload-text')) {
      placeholder.querySelector('.upload-text').textContent = '이미지 처리 중...';
    }

    try {
      currentCoverBase64 = await compressImage(file);
      showCoverPreview(currentCoverBase64);
    } catch {
      showToast('이미지를 처리하지 못했습니다.');
    } finally {
      if (placeholder.querySelector('.upload-text') && origText) {
        placeholder.querySelector('.upload-text').textContent = origText;
      }
    }
  });

  document.getElementById('btn-remove-cover').addEventListener('click', () => {
    hideCoverPreview();
  });

  // 폼 제출
  document.getElementById('book-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('input-title').value.trim();
    if (!title) {
      showToast('책 이름은 필수입니다.');
      document.getElementById('input-title').focus();
      return;
    }

    const books = loadBooks();
    const editId = document.getElementById('book-id').value;

    const selectedStatus = document.querySelector('input[name="status"]:checked')?.value || 'done';
    const bookData = {
      title,
      author: document.getElementById('input-author').value.trim(),
      publisher: document.getElementById('input-publisher').value.trim(),
      genre: document.getElementById('input-genre').value,
      status: selectedStatus,
      startDate: selectedStatus !== 'want' ? document.getElementById('input-start-date').value : '',
      endDate: selectedStatus === 'done' ? document.getElementById('input-end-date').value : '',
      ownership: document.querySelector('input[name="ownership"]:checked').value,
      bookType: document.querySelector('input[name="bookType"]:checked').value,
      review: document.getElementById('input-review').value,
      coverImage: currentCoverBase64 || null,
      rating: selectedStatus === 'done' ? (currentRating || null) : null,
    };

    if (editId) {
      const idx = books.findIndex(b => b.id === editId);
      if (idx !== -1) {
        books[idx] = { ...books[idx], ...bookData };
        saveBooksAndSync(books);
        showToast('수정했습니다.');
        closeFormModal();
        openBookDetailModal(editId);
      }
    } else {
      const newBook = { id: generateId(), createdAt: new Date().toISOString(), ...bookData };
      books.push(newBook);
      saveBooksAndSync(books);
      showToast('등록했습니다!');
      closeFormModal();
      location.hash = '#gallery';
      renderGallery();
    }
  });

  // 초기화
  document.getElementById('btn-reset-form').addEventListener('click', () => {
    document.getElementById('book-form').reset();
    hideCoverPreview();
    currentRating = null;
    updateRatingDisplay();
    updateFormFieldVisibility('done');
  });

  // 독서 상태 라디오 변경
  document.querySelectorAll('input[name="status"]').forEach(radio => {
    radio.addEventListener('change', () => updateFormFieldVisibility(radio.value));
  });

  // 모달 닫기 (✕ 버튼, 취소 버튼, 배경 클릭)
  document.getElementById('btn-modal-close').addEventListener('click', closeFormModal);
  document.getElementById('btn-cancel').addEventListener('click', closeFormModal);
  document.getElementById('modal-form').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFormModal();
  });

  // 햄버거 메뉴 드롭다운
  const moreMenu = document.getElementById('btn-more-menu');
  const moreDropdown = document.getElementById('more-dropdown');

  moreMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !moreDropdown.classList.contains('hidden');
    moreDropdown.classList.toggle('hidden', isOpen);
    moreMenu.setAttribute('aria-expanded', String(!isOpen));
  });

  moreDropdown.addEventListener('click', () => {
    moreDropdown.classList.add('hidden');
    moreMenu.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', () => {
    moreDropdown.classList.add('hidden');
    moreMenu.setAttribute('aria-expanded', 'false');
  });

  // + 책 등록 버튼 (헤더), 빈 상태 버튼
  document.getElementById('btn-add-book').addEventListener('click', () => openFormModal());
  document.getElementById('btn-empty-add').addEventListener('click', () => openFormModal());

  // 수정 버튼 (상세 페이지)
  document.getElementById('btn-edit').addEventListener('click', (e) => {
    openFormModal(e.currentTarget.dataset.id);
  });

  // 삭제 버튼 (상세 페이지)
  document.getElementById('btn-delete').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const books = loadBooks();
    const book = books.find(b => b.id === id);
    if (!book) return;
    if (!confirm(`"${book.title}"을(를) 삭제할까요?`)) return;
    const updated = books.filter(b => b.id !== id);
    saveBooksAndSync(updated);
    showToast('삭제했습니다.');
    location.hash = '#gallery';
  });

  // 뒤로 가기
  document.getElementById('btn-back').addEventListener('click', () => {
    location.hash = '#gallery';
  });

  // 별점 입력
  const ratingInput = document.getElementById('rating-input');
  ratingInput.addEventListener('mouseover', (e) => {
    const star = e.target.closest('.star-btn');
    if (star) updateRatingDisplay(Number(star.dataset.value));
  });
  ratingInput.addEventListener('mouseleave', () => updateRatingDisplay());
  ratingInput.addEventListener('click', (e) => {
    const star = e.target.closest('.star-btn');
    if (!star) return;
    const val = Number(star.dataset.value);
    currentRating = currentRating === val ? null : val;
    updateRatingDisplay();
  });
  document.getElementById('btn-clear-rating').addEventListener('click', () => {
    currentRating = null;
    updateRatingDisplay();
  });

  // 모달 내 책 검색
  document.getElementById('btn-modal-search').addEventListener('click', searchBooks);
  document.getElementById('modal-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchBooks(); }
  });
  document.getElementById('modal-search-results').addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    const idx = Number(item.dataset.idx);
    const items = document.getElementById('modal-search-results')._items;
    if (items && items[idx]) selectSearchResult(items[idx]);
  });
  document.getElementById('modal-search-results').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.search-result-item');
      if (!item) return;
      const idx = Number(item.dataset.idx);
      const items = document.getElementById('modal-search-results')._items;
      if (items && items[idx]) selectSearchResult(items[idx]);
    }
  });

  // 교보문고 검색
  document.getElementById('btn-kyobo-search').addEventListener('click', kyoboSearch);
  document.getElementById('kyobo-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') kyoboSearch();
  });

  // JSON 내보내기
  document.getElementById('btn-export').addEventListener('click', exportJSON);

  // JSON 가져오기
  document.getElementById('btn-import-trigger').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importJSON(file);
    e.target.value = '';
  });

  // 책 상세 모달
  document.getElementById('btn-detail-modal-close').addEventListener('click', closeBookDetailModal);
  document.getElementById('modal-book-detail').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBookDetailModal();
  });
  document.getElementById('btn-detail-modal-edit').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    closeBookDetailModal();
    openFormModal(id);
  });
  document.getElementById('btn-detail-modal-delete').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const books = loadBooks();
    const book = books.find(b => b.id === id);
    if (!book) return;
    if (!confirm(`"${book.title}"을(를) 삭제할까요?`)) return;
    const updated = books.filter(b => b.id !== id);
    saveBooksAndSync(updated);
    showToast('삭제했습니다.');
    closeBookDetailModal();
    location.hash = '#gallery';
  });

  // 책 미리보기 모달
  document.getElementById('btn-preview-close').addEventListener('click', closeBookPreviewModal);
  document.getElementById('modal-book-preview').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBookPreviewModal();
  });
  document.getElementById('btn-preview-detail').addEventListener('click', goToPreviewDetail);
  document.getElementById('preview-cover-wrap').addEventListener('click', goToPreviewDetail);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('modal-book-detail').classList.contains('hidden')) closeBookDetailModal();
    if (!document.getElementById('modal-book-preview').classList.contains('hidden')) closeBookPreviewModal();
  });

  // 장르 모달 닫기
  document.getElementById('btn-genre-modal-close').addEventListener('click', closeGenreBooksModal);
  document.getElementById('modal-genre-books').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeGenreBooksModal();
  });
  document.getElementById('genre-books-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if (card) {
      closeGenreBooksModal();
      openBookDetailModal(card.dataset.id);
    }
  });

  // 동기화 버튼
  document.getElementById('btn-sync').addEventListener('click', manualSync);

  // 설정 버튼 및 모달
  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-settings-close').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-settings-cancel').addEventListener('click', closeSettingsModal);
  document.getElementById('modal-settings').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettingsModal();
  });

  document.getElementById('btn-save-secret').addEventListener('click', () => {
    const secret = document.getElementById('input-sync-secret').value.trim();
    if (!secret) { showToast('비밀 키를 입력해주세요.'); return; }
    setSyncSecret(secret);
    closeSettingsModal();
    if (!localStorage.getItem(SYNC_CONFLICT_NOTICED_KEY)) {
      localStorage.setItem(SYNC_CONFLICT_NOTICED_KEY, '1');
      showToast('저장됨. PC와 폰에서 동시에 편집하면 마지막 저장이 이깁니다.');
    } else {
      showToast('비밀 키를 저장했습니다.');
    }
    startupSync();
  });

  document.getElementById('btn-clear-secret').addEventListener('click', () => {
    if (!confirm('동기화 비밀 키를 삭제할까요?')) return;
    clearSyncSecret();
    closeSettingsModal();
    updateSyncStatus('no-key');
    showToast('비밀 키를 삭제했습니다.');
  });

  document.getElementById('btn-toggle-secret').addEventListener('click', () => {
    const inp = document.getElementById('input-sync-secret');
    const btn = document.getElementById('btn-toggle-secret');
    if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '숨기기'; }
    else { inp.type = 'password'; btn.textContent = '표시'; }
  });
}

function kyoboSearch() {
  const keyword = document.getElementById('kyobo-search-input').value.trim();
  if (!keyword) {
    showToast('검색어를 입력해주세요.');
    return;
  }
  window.open(`https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(keyword)}`, '_blank', 'noopener');
}

/* ===== 초기화 ===== */
function init() {
  migrateBookStatuses();
  bindEvents();
  route();
  startupSync();
}

document.addEventListener('DOMContentLoaded', init);
