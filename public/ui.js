// Shared UI state and helpers

const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const chatEmpty = document.getElementById('chat-empty');
const documentsList = document.getElementById('documents');
const noDocs = document.getElementById('no-docs');
const uploadSpinner = document.getElementById('upload-spinner');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const fileInput = document.getElementById('file-input');
const toast = document.getElementById('toast');

export function setStatus(ready, message) {
  statusIndicator.className = ready ? 'status-ready' : 'status-loading';
  statusText.textContent = message;
}

export function setChatEnabled(enabled) {
  chatInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  if (enabled) {
    chatInput.placeholder = '输入问题...';
  }
}

export function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.className = isError ? 'error' : '';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

export function addUserMessage(text) {
  chatEmpty.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'message user';
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function createAssistantMessage() {
  chatEmpty.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'message assistant typing-cursor';
  chatMessages.appendChild(el);
  return el;
}

export function finalizeAssistantMessage(el, sources) {
  el.classList.remove('typing-cursor');

  if (sources.length > 0) {
    const srcDiv = document.createElement('div');
    srcDiv.className = 'sources';

    const summary = document.createElement('summary');
    summary.textContent = `引用来源 (${sources.length})`;

    const details = document.createElement('details');
    details.appendChild(summary);

    for (const s of sources) {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.innerHTML = `
        <div class="source-name">${escapeHtml(s.docName)} · 段落 ${s.chunkIndex + 1}</div>
        <div class="source-text">${escapeHtml(s.text.slice(0, 300))}${s.text.length > 300 ? '...' : ''}</div>
      `;
      details.appendChild(item);
    }

    srcDiv.appendChild(details);
    el.appendChild(srcDiv);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function setUploadProgress(pct, text) {
  uploadProgress.classList.remove('hidden');
  progressFill.style.width = `${pct}%`;
  progressText.textContent = text;
}

export function hideUploadProgress() {
  uploadProgress.classList.add('hidden');
  progressFill.style.width = '0';
}

export function setUploadSpinner(show) {
  uploadSpinner.classList.toggle('hidden', !show);
}

let onDeleteDoc = null;

export function setOnDeleteDoc(fn) {
  onDeleteDoc = fn;
}

export function updateDocuments(docs) {
  documentsList.innerHTML = '';
  if (docs.length === 0) {
    noDocs.classList.remove('hidden');
    setChatEnabled(false);
    return;
  }
  noDocs.classList.add('hidden');
  setChatEnabled(true);
  for (const doc of docs) {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);word-break:break-all';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${doc.docName} (${doc.chunkCount} 片段)`;
    nameSpan.style.cssText = 'flex:1;min-width:0';
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.style.cssText = 'flex-shrink:0;margin-left:8px;width:22px;height:22px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text-secondary);cursor:pointer;font-size:14px;line-height:0;padding:0;display:flex;align-items:center;justify-content:center';
    delBtn.title = '删除文档';
    delBtn.addEventListener('click', () => {
      if (confirm(`确定删除 ${doc.docName} 吗？`)) {
        onDeleteDoc?.(doc.docId);
      }
    });
    li.appendChild(nameSpan);
    li.appendChild(delBtn);
    documentsList.appendChild(li);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getChatMessagesEl() { return chatMessages; }
export function getSendBtn() { return sendBtn; }
export { chatInput, sendBtn, fileInput };
