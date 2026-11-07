const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);

const NAMES = { auto: '自动', zh: '中文', en: '英文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西文', ru: '俄文' };

function setStatus(kind, text) {
  const dot = $('#status .dot');
  dot.className = 'dot' + (kind ? ' ' + kind : '');
  $('#status span').textContent = text;
}

async function checkHealth() {
  const r = await send({ type: 'health' });
  if (!r || !r.ok) {
    setStatus('err', '服务未启动');
    $('#setup').classList.add('hidden');
    $('#tips').textContent = '请先双击项目里的 server/run.bat 启动本机服务，再点这里重试。';
    $('#tips').style.cursor = 'pointer';
    $('#tips').onclick = () => location.reload();
    return;
  }
  const pairs = r.data.pairs || 0;
  setStatus('ok', `服务已连接 · ${pairs} 个语言对`);
  if (pairs === 0) {
    $('#setup').classList.remove('hidden');
    $('#setupText').textContent = '还没有安装翻译模型，先下载一个。';
  } else {
    $('#setup').classList.add('hidden');
  }
}

async function doTranslate() {
  const text = $('#input').value.trim();
  if (!text) { $('#input').focus(); return; }
  const to = $('#target').value;
  $('#go').disabled = true;
  $('#go').textContent = '翻译中…';
  $('#result').classList.remove('hidden');
  $('#out').className = '';
  $('#out').textContent = '正在调用本机模型…';
  $('#langs').textContent = '';
  $('#ms').textContent = '';

  const r = await send({ type: 'translate', text, from: 'auto', to });
  $('#go').disabled = false;
  $('#go').textContent = '翻译';

  if (!r || !r.ok) {
    $('#out').className = 'error';
    $('#out').textContent = (r && r.error) || '翻译失败';
    if (r && r.code === 'MODEL_MISSING') {
      $('#setup').classList.remove('hidden');
      $('#setupText').textContent = r.error;
    }
    return;
  }
  const d = r.data;
  $('#langs').textContent = `${NAMES[d.from] || d.from} → ${NAMES[d.to] || d.to}`;
  $('#ms').textContent = `${d.ms} ms${d.cached ? ' · 命中缓存' : ''}`;
  $('#out').textContent = d.text;
  $('#copy').disabled = false;
}

async function installModels() {
  const btn = $('#install');
  const jobs = [{ from: 'en', to: 'zh' }, { from: 'zh', to: 'en' }];
  btn.disabled = true;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    btn.textContent = `下载中 ${i + 1}/${jobs.length}：${NAMES[j.from]} → ${NAMES[j.to]}…`;
    const r = await send({ type: 'install', from: j.from, to: j.to });
    if (!r || !r.ok) {
      btn.textContent = '下载失败，点击重试';
      btn.disabled = false;
      $('#setupText').textContent = (r && r.error) || '下载失败';
      return;
    }
  }
  btn.textContent = '模型已就绪';
  $('#setupText').textContent = '模型安装完成，可以开始翻译了。';
  setTimeout(() => { $('#setup').classList.add('hidden'); }, 900);
  checkHealth();
}

async function copyOut() {
  const t = $('#out').textContent;
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const b = $('#copy');
  b.textContent = '已复制';
  setTimeout(() => { b.textContent = '复制'; }, 1100);
}

document.addEventListener('DOMContentLoaded', async () => {
  const s = await send({ type: 'settings:get' });
  if (s && s.ok) $('#target').value = s.data.target;

  $('#target').addEventListener('change', async (e) => {
    await send({ type: 'settings:set', patch: { target: e.target.value } });
  });

  $('#go').addEventListener('click', doTranslate);
  $('#copy').addEventListener('click', copyOut);
  $('#install').addEventListener('click', installModels);

  $('#input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doTranslate(); }
  });

  // 打开即聚焦，方便直接粘贴
  $('#input').focus();
  checkHealth();
});
