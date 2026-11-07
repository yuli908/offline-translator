// 划词翻译：选中文字 → 浮出按钮 → 点开卡片看结果。全部渲染在 Shadow DOM 里，不污染页面样式。
(() => {
  if (window.__otInjected) return;
  window.__otInjected = true;

  const NAMES = { auto: '自动', zh: '中文', en: '英文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西文', ru: '俄文', it: '意文', pt: '葡文', ar: '阿拉伯文' };
  const nameOf = (c) => NAMES[c] || c;

  let host = null, shadow = null, bubble = null, card = null;
  let lastText = '';
  let pending = false;

  function ensureUI() {
    if (host) return;
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .wrap { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
        .btn {
          position: fixed; display: none; align-items: center; gap: 4px;
          padding: 5px 9px; border-radius: 8px; cursor: pointer; user-select: none;
          background: #1f2937; color: #fff; font-size: 12px; line-height: 1.2;
          box-shadow: 0 4px 14px rgba(0,0,0,.22); border: none;
          transition: transform .12s ease, background .12s ease;
        }
        .btn:hover { background: #111827; transform: translateY(-1px); }
        .btn .k { opacity: .55; font-size: 10px; }

        .card {
          position: fixed; display: none; width: 348px; max-width: calc(100vw - 24px);
          background: #fff; color: #111827; border-radius: 12px; overflow: hidden;
          box-shadow: 0 12px 40px rgba(15,23,42,.20), 0 2px 8px rgba(15,23,42,.10);
          border: 1px solid #e5e7eb;
        }
        .hd {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; background: #f9fafb; border-bottom: 1px solid #eef0f3;
        }
        .lang { font-size: 11px; color: #6b7280; letter-spacing: .2px; }
        .grow { flex: 1; }
        .ico {
          width: 24px; height: 24px; display: grid; place-items: center; border: none;
          background: transparent; border-radius: 6px; cursor: pointer; color: #6b7280; font-size: 13px;
        }
        .ico:hover { background: #eef1f5; color: #111827; }
        .bd {
          padding: 12px 14px; font-size: 14px; line-height: 1.65; max-height: 320px;
          overflow-y: auto; white-space: pre-wrap; word-break: break-word;
        }
        .bd.loading { color: #9ca3af; font-size: 13px; }
        .bd.error { color: #b42318; font-size: 13px; }
        .ft { padding: 6px 12px; font-size: 10px; color: #9ca3af; border-top: 1px solid #f2f4f7; display: flex; gap: 8px; }
        .ft .tag { background: #eef2ff; color: #4338ca; border-radius: 4px; padding: 1px 5px; }
      </style>
      <div class="wrap">
        <button class="btn" part="btn">译<span class="k">Alt+T</span></button>
        <div class="card">
          <div class="hd">
            <span class="lang"></span>
            <span class="grow"></span>
            <button class="ico js-copy" title="复制译文">⧉</button>
            <button class="ico js-close" title="关闭 (Esc)">✕</button>
          </div>
          <div class="bd"></div>
          <div class="ft"><span class="tag">离线</span><span class="ms"></span></div>
        </div>
      </div>`;
    (document.body || document.documentElement).appendChild(host);

    bubble = shadow.querySelector('.btn');
    card = shadow.querySelector('.card');

    bubble.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    bubble.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      hideBubble();
      runTranslate(lastText);
    });
    shadow.querySelector('.js-close').addEventListener('click', hideCard);
    shadow.querySelector('.js-copy').addEventListener('click', copyResult);
  }

  function hideBubble() { if (bubble) bubble.style.display = 'none'; }
  function hideCard() { if (card) card.style.display = 'none'; }
  function hideAll() { hideBubble(); hideCard(); }

  function place(el, rect, gap = 8) {
    el.style.display = 'flex';
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(rect.left, window.innerWidth - w - 12);
    left = Math.max(12, left);
    let top = rect.top - h - gap;
    if (top < 12) top = Math.min(rect.bottom + gap, window.innerHeight - h - 12);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function placeCard(el, rect) {
    el.style.display = 'block';
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = rect.left;
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    left = Math.max(12, left);
    let top = rect.bottom + 10;
    if (top + h > window.innerHeight - 12) top = Math.max(12, rect.top - h - 10);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function currentSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return r;
  }

  function isEditable(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return false;
    return /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable;
  }

  document.addEventListener('mouseup', (e) => {
    if (host && e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 1 || text.length > 4000 || isEditable(sel.anchorNode)) {
        hideBubble();
        return;
      }
      lastText = text;
      ensureUI();
      const rect = currentSelectionRect();
      if (!rect) return;
      bubble.innerHTML = `译<span class="k">Alt+T</span>`;
      place(bubble, rect);
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (host && e.composedPath().includes(host)) return;
    hideAll();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAll();
  });

  window.addEventListener('scroll', hideBubble, { passive: true });
  window.addEventListener('resize', hideAll, { passive: true });

  async function copyResult() {
    const bd = shadow.querySelector('.bd');
    const t = bd.dataset.raw || bd.textContent || '';
    try {
      await navigator.clipboard.writeText(t);
      flashCopy('已复制');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      flashCopy('已复制');
    }
  }

  function flashCopy(msg) {
    const btn = shadow.querySelector('.js-copy');
    const old = btn.textContent;
    btn.textContent = '✓';
    btn.title = msg;
    setTimeout(() => { btn.textContent = old; }, 1200);
  }

  async function runTranslate(text) {
    const t = (text || lastText || '').trim();
    if (!t) return;
    lastText = t;
    ensureUI();
    const rect = currentSelectionRect() || { left: 40, top: 40, bottom: 60, width: 0 };
    const bd = shadow.querySelector('.bd');
    const lang = shadow.querySelector('.lang');
    const ms = shadow.querySelector('.ms');

    lang.textContent = '翻译中…';
    ms.textContent = '';
    bd.className = 'bd loading';
    bd.textContent = '正在调用本机模型…';
    bd.dataset.raw = '';
    placeCard(card, rect);

    if (pending) return;
    pending = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'translate', text: t, from: 'auto' });
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || '翻译失败');
      const d = resp.data;
      lang.textContent = `${nameOf(d.from)} → ${nameOf(d.to)}`;
      bd.className = 'bd';
      bd.textContent = d.text;
      bd.dataset.raw = d.text;
      ms.textContent = `${d.ms} ms${d.cached ? ' · 缓存' : ''}`;
      placeCard(card, rect);
    } catch (e) {
      lang.textContent = '出错了';
      bd.className = 'bd error';
      bd.textContent = e.message;
      placeCard(card, rect);
    } finally {
      pending = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === 'do-translate') {
      const text = (msg.text || window.getSelection()?.toString() || '').trim();
      if (text) runTranslate(text);
      sendResponse({ ok: true });
    }
  });
})();
