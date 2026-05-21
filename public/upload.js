import {
  fileInput, showToast, setUploadProgress, hideUploadProgress,
  setUploadSpinner, updateDocuments, setOnDeleteDoc,
} from './ui.js';

// Poll health status
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const { setStatus } = await import('./ui.js');
    if (data.status === 'ready') {
      setStatus(true, '模型就绪');
      fetchDocuments();
    } else if (data.status === 'error') {
      setStatus(false, `错误: ${data.message}`);
    } else {
      setStatus(false, data.message || '正在加载模型...');
    }
  } catch {
    // Server not ready yet
  }
}

let healthInterval;

export function startHealthCheck() {
  checkHealth();
  healthInterval = setInterval(checkHealth, 3000);
}

async function fetchDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    updateDocuments(data.documents || []);
  } catch {
    // Ignore errors
  }
}

// File upload — label[for] 已自动触发 fileInput.click()，无需 JS 再触发
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  uploadFile(file);
});

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  setUploadSpinner(true);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      setUploadProgress(pct, `上传中 ${pct}%`);
    }
  });

  xhr.addEventListener('load', () => {
    setUploadSpinner(false);
    hideUploadProgress();

    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      showToast(`已添加: ${data.docName} (${data.chunkCount} 片段)`);
      fetchDocuments();
    } else {
      try {
        const err = JSON.parse(xhr.responseText);
        showToast(err.error || '上传失败', true);
      } catch {
        showToast('上传失败', true);
      }
    }
  });

  xhr.addEventListener('error', () => {
    setUploadSpinner(false);
    hideUploadProgress();
    showToast('上传失败，请检查网络', true);
  });

  xhr.send(formData);
  fileInput.value = '';
}

async function deleteDocument(docId) {
  try {
    const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('已删除');
      fetchDocuments();
    } else {
      const err = await res.json();
      showToast(err.error || '删除失败', true);
    }
  } catch {
    showToast('删除失败', true);
  }
}

setOnDeleteDoc(deleteDocument);
startHealthCheck();
