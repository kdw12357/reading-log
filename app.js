'use strict';

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

/* ===== Router ===== */
function route() {
  const hash = location.hash || '#gallery';
  const [path] = hash.split('?');

  if (path === '#gallery' || path === '') {
    renderGallery();
  } else if (path.startsWith('#detail/')) {
    const id = path.replace('#detail/', '');
    renderDetail(id);
  } else {
    renderGallery();
  }
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

/* ===== Gallery View ===== */
function renderYearStats(books) {
  const genreCounts = {};
  books.forEach(book => {
    const g = book.genre || '기타';
    genreCounts[g] = (genreCounts[g] || 0) + 1;
  });
  const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  const bars = sorted.map(([genre, count]) => {
    const pct = Math.round((count / max) * 100);
    return `
      <div class="stat-genre-row">
        <span class="stat-genre-label">${escapeHtml(genre)}</span>
        <div class="stat-bar-wrap"><div class="stat-bar" style="width:${pct}%"></div></div>
        <span class="stat-genre-count">${count}권</span>
      </div>`;
  }).join('');
  return `<div class="year-stats"><div class="stat-genres">${bars}</div></div>`;
}

function getBookYear(book) {
  const d = book.endDate || book.startDate;
  return d ? d.slice(0, 4) : '날짜 미입력';
}

function renderGallery() {
  showView('view-gallery');
  const books = loadBooks();
  const container = document.getElementById('gallery-container');
  const empty = document.getElementById('gallery-empty');

  if (books.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  // 연도별 그룹핑 (최신 연도 우선)
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
    const statsHtml = year !== '날짜 미입력' ? renderYearStats(yearBooks) : '';
    return `
      <div class="year-section">
        <h2 class="year-heading">
          ${escapeHtml(year)}년
          <span class="book-count">${yearBooks.length}권</span>
        </h2>
        ${statsHtml}
        <div class="book-grid">${cards}</div>
      </div>
    `;
  }).join('');
}

function bookCard(book) {
  const cover = book.coverImage
    ? `<img src="${book.coverImage}" alt="${escapeHtml(book.title)}" loading="lazy" />`
    : `<div class="book-card-cover-placeholder">📗</div>`;

  return `
    <div class="book-card" data-id="${book.id}" role="button" tabindex="0" aria-label="${escapeHtml(book.title)}">
      <div class="book-card-cover">${cover}</div>
      <div class="book-card-info">
        <div class="book-card-title">${escapeHtml(book.title)}</div>
        <div class="book-card-author">${escapeHtml(book.author || '')}</div>
        ${book.genre ? `<span class="book-card-genre">${escapeHtml(book.genre)}</span>` : ''}
        ${book.rating ? `<div class="book-card-rating">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>` : ''}
      </div>
    </div>
  `;
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

  // 폼 초기화
  form.reset();
  document.getElementById('book-id').value = '';
  hideCoverPreview();
  resetModalSearch();
  currentRating = null;
  updateRatingDisplay();

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
      saveBooks(data);
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
    try {
      const res = await fetch(item.image);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        currentCoverBase64 = e.target.result;
        showCoverPreview(currentCoverBase64);
      };
      reader.readAsDataURL(blob);
    } catch {
      currentCoverBase64 = item.image;
      showCoverPreview(item.image);
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
  // 라우팅
  window.addEventListener('hashchange', route);

  // 갤러리 카드 클릭
  document.getElementById('gallery-container').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if (card) location.hash = `#detail/${card.dataset.id}`;
  });

  document.getElementById('gallery-container').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.book-card');
      if (card) location.hash = `#detail/${card.dataset.id}`;
    }
  });

  // 표지 이미지 업로드
  const coverArea = document.getElementById('cover-upload-area');
  const coverInput = document.getElementById('cover-input');

  coverArea.addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      currentCoverBase64 = ev.target.result;
      showCoverPreview(currentCoverBase64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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

    const bookData = {
      title,
      author: document.getElementById('input-author').value.trim(),
      publisher: document.getElementById('input-publisher').value.trim(),
      genre: document.getElementById('input-genre').value,
      startDate: document.getElementById('input-start-date').value,
      endDate: document.getElementById('input-end-date').value,
      ownership: document.querySelector('input[name="ownership"]:checked').value,
      bookType: document.querySelector('input[name="bookType"]:checked').value,
      review: document.getElementById('input-review').value,
      coverImage: currentCoverBase64 || null,
      rating: currentRating || null,
    };

    if (editId) {
      const idx = books.findIndex(b => b.id === editId);
      if (idx !== -1) {
        books[idx] = { ...books[idx], ...bookData };
        saveBooks(books);
        showToast('수정했습니다.');
        closeFormModal();
        renderDetail(editId);
      }
    } else {
      const newBook = { id: generateId(), createdAt: new Date().toISOString(), ...bookData };
      books.push(newBook);
      saveBooks(books);
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
  });

  // 모달 닫기 (✕ 버튼, 취소 버튼, 배경 클릭)
  document.getElementById('btn-modal-close').addEventListener('click', closeFormModal);
  document.getElementById('btn-cancel').addEventListener('click', closeFormModal);
  document.getElementById('modal-form').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFormModal();
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
    saveBooks(updated);
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
  bindEvents();
  route();
}

document.addEventListener('DOMContentLoaded', init);
