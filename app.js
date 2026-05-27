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
  const [path, query] = hash.split('?');

  updateNavActive(path);

  if (path === '#gallery') {
    renderGallery();
  } else if (path === '#form') {
    const params = new URLSearchParams(query);
    renderForm(params.get('id'));
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

function updateNavActive(path) {
  document.getElementById('nav-gallery').classList.toggle('active', path === '#gallery');
  document.getElementById('nav-form').classList.toggle('active', path === '#form');
}

/* ===== Gallery View ===== */
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
    return `
      <div class="year-section">
        <h2 class="year-heading">
          ${escapeHtml(year)}년
          <span class="book-count">${yearBooks.length}권</span>
        </h2>
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
      </div>
    </div>
  `;
}

/* ===== Form View ===== */
let currentCoverBase64 = null;

function renderForm(editId) {
  showView('view-form');
  currentCoverBase64 = null;

  const titleEl = document.getElementById('form-title');
  const form = document.getElementById('book-form');

  // 폼 초기화
  form.reset();
  document.getElementById('book-id').value = '';
  hideCoverPreview();

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
    };

    if (editId) {
      const idx = books.findIndex(b => b.id === editId);
      if (idx !== -1) {
        books[idx] = { ...books[idx], ...bookData };
        saveBooks(books);
        showToast('수정했습니다.');
        location.hash = `#detail/${editId}`;
      }
    } else {
      const newBook = { id: generateId(), createdAt: new Date().toISOString(), ...bookData };
      books.push(newBook);
      saveBooks(books);
      showToast('등록했습니다!');
      location.hash = '#gallery';
    }
  });

  // 초기화
  document.getElementById('btn-reset-form').addEventListener('click', () => {
    document.getElementById('book-form').reset();
    hideCoverPreview();
  });

  // 취소
  document.getElementById('btn-cancel').addEventListener('click', () => {
    history.back();
  });

  // 수정 버튼 (상세 페이지)
  document.getElementById('btn-edit').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    location.hash = `#form?id=${id}`;
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
