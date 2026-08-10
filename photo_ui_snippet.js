// ============================================================
// 사진 업로드 UI — app.js 의 상품 상세 모달 부분에 통합하세요
// ============================================================

// ── 1. 사진 목록 로드 ────────────────────────────────────────
async function loadPhotos(orderId) {
  const res = await fetch(`/api/photos/${orderId}`);
  const photos = await res.json();
  renderPhotos(photos);
}

function renderPhotos(photos) {
  const container = document.getElementById('photo-grid');
  container.innerHTML = '';

  if (photos.length === 0) {
    container.innerHTML = '<p class="no-photos">아직 사진이 없습니다.</p>';
    return;
  }

  photos.forEach(photo => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-item';
    wrap.innerHTML = `
      <img src="${photo.url}" alt="${photo.filename || '상품 사진'}" loading="lazy" />
      <button class="photo-delete-btn" data-id="${photo.id}" title="삭제">×</button>
      ${photo.uploaded_by ? `<span class="photo-uploader">${photo.uploaded_by}</span>` : ''}
    `;
    wrap.querySelector('.photo-delete-btn').addEventListener('click', () => deletePhoto(photo.id, orderId));
    container.appendChild(wrap);
  });
}

// ── 2. 사진 업로드 ───────────────────────────────────────────
async function uploadPhotos(orderId, files, uploadedBy) {
  const results = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    if (uploadedBy) formData.append('uploaded_by', uploadedBy);

    const res = await fetch(`/api/photos/${orderId}`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      alert(`업로드 실패: ${err.detail}`);
      continue;
    }
    results.push(await res.json());
  }
  return results;
}

// ── 3. 사진 삭제 ─────────────────────────────────────────────
async function deletePhoto(photoId, orderId) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
  await loadPhotos(orderId);
}

// ── 4. 이벤트 바인딩 (모달 열릴 때 호출) ─────────────────────
function initPhotoSection(orderId) {
  loadPhotos(orderId);

  const input = document.getElementById('photo-file-input');
  const uploadBtn = document.getElementById('photo-upload-btn');

  uploadBtn.addEventListener('click', async () => {
    const files = Array.from(input.files);
    if (!files.length) return;

    const uploadedBy = document.getElementById('photo-uploader-name')?.value || '';
    uploadBtn.disabled = true;
    uploadBtn.textContent = '업로드 중...';

    await uploadPhotos(orderId, files, uploadedBy);
    input.value = '';
    uploadBtn.disabled = false;
    uploadBtn.textContent = '업로드';
    await loadPhotos(orderId);
  });
}


// ============================================================
// index.html 상세 모달 내 추가할 HTML 섹션
// ============================================================
/*
<div class="photo-section">
  <h4>사진</h4>
  <div id="photo-grid" class="photo-grid"></div>

  <div class="photo-upload-row">
    <input type="file" id="photo-file-input" accept="image/*" multiple />
    <input type="text" id="photo-uploader-name" placeholder="이름 (선택)" style="width:100px" />
    <button id="photo-upload-btn">업로드</button>
  </div>
</div>
*/
