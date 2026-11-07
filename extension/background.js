// 后台服务：所有对本机服务的请求都走这里（service worker 有 host_permissions，不受页面 CORS 限制）
const DEFAULTS = { target: 'zh', port: 8765, autoPopup: true };

async function getSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

function base(port) {
  return `http://127.0.0.1:${port}`;
}

async function api(path, body) {
  const { port } = await getSettings();
  const res = await fetch(base(port) + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* 空响应 */ }
  if (!res.ok || (data && data.ok === false)) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = data && data.code;
    throw err;
  }
  return data;
}

const OFFLINE_HINT = '本机翻译服务没连上。请先双击项目里的 server/run.bat 启动服务，再重试。';

async function translate(text, from = 'auto', to = null) {
  const { target } = await getSettings();
  try {
    return await api('/translate', { q: text, from, to: to || target });
  } catch (e) {
    if (e instanceof TypeError) throw new Error(OFFLINE_HINT);
    throw e;
  }
}

// ---------- 右键菜单 ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ot-translate',
    title: '离线翻译「%s」',
    contexts: ['selection'],
  });
  chrome.storage.local.get(DEFAULTS).then((cur) => {
    chrome.storage.local.set({ ...DEFAULTS, ...cur });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'ot-translate' || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: 'do-translate',
    text: info.selectionText || '',
  }).catch(() => {});
});

// ---------- 快捷键 ----------
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'translate-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'do-translate' }).catch(() => {});
  }
});

// ---------- 消息路由 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'translate':
          sendResponse({ ok: true, data: await translate(msg.text, msg.from, msg.to) });
          break;
        case 'health':
          sendResponse({ ok: true, data: await api('/health') });
          break;
        case 'langs':
          sendResponse({ ok: true, data: await api('/langs') });
          break;
        case 'install': {
          const d = await api('/install', { from: msg.from, to: msg.to });
          sendResponse({ ok: true, data: d });
          break;
        }
        case 'settings:get':
          sendResponse({ ok: true, data: await getSettings() });
          break;
        case 'settings:set':
          await chrome.storage.local.set(msg.patch || {});
          sendResponse({ ok: true, data: await getSettings() });
          break;
        default:
          sendResponse({ ok: false, error: '未知消息类型' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message, code: e.code });
    }
  })();
  return true; // 保持异步通道
});
