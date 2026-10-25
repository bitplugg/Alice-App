/* ═══════════════════════════════════════════════════════════
   Alice-App · интерфейс панели управления Станцией Лайт
   Material Web (локально) + CGI API колонки
   ═══════════════════════════════════════════════════════════ */

import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/chips/filter-chip.js';
import '@material/web/tabs/tabs.js';
import '@material/web/tabs/primary-tab.js';
import '@material/web/switch/switch.js';
import '@material/web/slider/slider.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/dialog/dialog.js';
import '@material/web/iconbutton/outlined-icon-button.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';

/* ─── утилиты ─── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get: (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const state = {
  base: '',            // '' = тот же источник (интерфейс отдан колонкой)
  ip: '',
  token: '',
  needSetup: false,
  zones: [],
  page: 'p-led',
  pendingLog: 'dmesg',
};

/* ─── тост и диалог ─── */
let toastT;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

function confirmDlg(title, text) {
  return new Promise(res => {
    const d = $('#dlg');
    $('#dlg_title').textContent = title;
    $('#dlg_text').textContent = text;
    const yes = $('#dlg_yes'), no = $('#dlg_no');
    const done = v => { yes.onclick = no.onclick = null; d.close(); res(v); };
    yes.onclick = () => done(true);
    no.onclick  = () => done(false);
    d.addEventListener('close', () => res(false), { once: true });
    d.show();
  });
}

/* ─── API ─── */
async function api(action, params = {}, timeout = 20000) {
  const u = new URL(state.base + '/cgi-bin/api.sh', location.href);
  u.searchParams.set('a', action);
  if (state.token) u.searchParams.set('t', state.token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    const j = await r.json();
    if (j.ok === 0 && j.error === 'unauthorized') {
      state.token = '';
      store.set('tok:' + state.ip, '');
      showScreen('s-pin');
      setPinMode(false);
      throw new Error('Сессия истекла — введите PIN заново');
    }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Колонка не отвечает');
    throw e;
  } finally { clearTimeout(timer); }
}

const ping = () => api('ping', {}, 6000);

/* ─── экраны ─── */
function showScreen(id) {
  $$('.screen').forEach(s => s.hidden = (s.id !== id));
}

function setPinMode(setup) {
  state.needSetup = setup;
  $('#pin_title').textContent = setup ? 'Придумайте PIN-код' : 'Введите PIN-код';
  $('#pin_sub').textContent = setup
    ? 'Первый запуск — задайте код для входа в панель'
    : 'Защита от посторонних в вашей сети';
  $('#pin2').hidden = !setup;
  $('#btn_pin').textContent = setup ? 'Создать' : 'Войти';
  $('#pin_err').textContent = '';
  $('#pin').value = '';
  $('#pin2').value = '';
}

async function submitPin() {
  const a = $('#pin').value.trim(), b = $('#pin2').value.trim();
  if (state.needSetup) {
    if (a.length < 4) return void ($('#pin_err').textContent = 'Минимум 4 символа');
    if (a !== b)      return void ($('#pin_err').textContent = 'PIN-коды не совпадают');
  } else if (!a) return void ($('#pin_err').textContent = 'Введите PIN');

  const j = await api(state.needSetup ? 'setup' : 'auth', { pin: a }, 10000)
    .catch(e => ({ ok: 0, error: e.message }));
  if (j.ok !== 1) return void ($('#pin_err').textContent = j.error || 'Ошибка входа');

  state.token = j.token;
  store.set('tok:' + state.ip, state.token);
  enterApp();
}

/* ─── подключение ─── */
function guessSubnet() {
  const saved = store.get('ip');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(saved)) return saved.split('.').slice(0, 3).join('.');
  const h = location.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return h.split('.').slice(0, 3).join('.');
  return '';
}

async function connect(ip) {
  ip = (ip || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { toast('Неверный формат IP', true); return false; }
  const prevBase = state.base;
  state.base = 'http://' + ip + ':8080';
  try {
    const p = await ping();
    state.ip = ip;
    store.set('ip', ip);
    state.token = store.get('tok:' + ip);
    logFind(`✓ ${ip} → ${p.host} (${p.model})`);
    return true;
  } catch (e) {
    state.base = prevBase;
    logFind(`✗ ${ip}: ${e.message}`);
    return false;
  }
}

function logFind(s) {
  const el = $('#find_log');
  el.textContent += (el.textContent ? '\n' : '') + s;
  el.scrollTop = el.scrollHeight;
}

/* автопоиск: пробегаем по /24 с ограниченной параллельностью */
async function discover() {
  const ip = ($('#ip').value || '').trim();
  const net = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip.split('.').slice(0, 3).join('.')
             : guessSubnet();
  if (!net) { toast('Введите любой IP колонки, чтобы узнать подсеть', true); return; }

  $('#find_log').textContent = '';
  const btn = $('#btn_find');
  btn.disabled = true;
  let found = null, done = 0, active = 0;
  const targets = [];
  for (let i = 1; i <= 254; i++) targets.push(`${net}.${i}`);
  logFind(`ищу ${net}.0/24 …`);

  await new Promise(resolve => {
    const next = () => {
      while (active < 40 && targets.length && !found) {
        const host = targets.shift();
        active++;
        fetch(`http://${host}:8080/cgi-bin/api.sh?a=ping`, { signal: AbortSignal.timeout(1200) })
          .then(r => r.json())
          .then(j => { if (j.ok === 1 && j.host) found = host; })
          .catch(() => {})
          .finally(() => {
            active--; done++;
            if (done % 50 === 0) logFind(`… проверено ${done}/254`);
            if (found || (!targets.length && !active)) { resolve(); return; }
            next();
          });
      }
      if (!targets.length && !active) resolve();
    };
    next();
  });

  btn.disabled = false;
  if (found) {
    $('#ip').value = found;
    logFind(`✓ найдена колонка: ${found}`);
    if (await connect(found)) afterConnect();
  } else {
    logFind('колонка не найдена — проверьте IP и сеть');
  }
}

async function afterConnect() {
  const p = await ping();
  setPinMode(!p.pin_set);
  showScreen('s-pin');
}

async function enterApp() {
  $('#h_ip').textContent = `${state.ip} · Alice-App`;
  showScreen('s-app');
  showPage(state.page || 'p-led');
  syncShizuku();
}

/* статус моста телефона (APK + Shizuku) */
function syncShizuku() {
  const el = $('#h_shz');
  const nd = nativeApp();
  if (!nd) { el.hidden = true; return; }
  let ok = false;
  try { ok = !!nd.shizukuReady(); } catch { ok = false; }
  el.hidden = false;
  el.textContent = ok ? 'shizuku ✓' : 'shizuku ✗';
  el.style.background = ok ? '' : '#3b1417';
  el.style.color = ok ? '' : 'var(--error)';
}

/* ─── перекраска темы из LED ─── */
function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
const hsl = (h, s, l) => `hsl(${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`;

function applyTheme(hex) {
  const { h, s, l } = hexToHsl(hex);
  const st = document.documentElement.style;
  const sat = Math.max(s, 55);
  st.setProperty('--primary', hsl(h, sat, Math.min(Math.max(l, 50), 62)));
  st.setProperty('--on-primary', hsl(h, Math.min(sat, 25), 10));
  st.setProperty('--primary-container', hsl(h, sat, Math.max(Math.min(l, 30), 14)));
  st.setProperty('--on-primary-container', hsl(h, Math.min(sat, 75), 88));
}

/* ─── LED ─── */
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, '0')).join('');
const hexToRgb = hex => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

async function ledGet() {
  const j = await api('led.get');
  state.zones = j.zones || [];
  paintLed();
}

function paintLed() {
  $$('#rings .ring').forEach(el => {
    const z = state.zones.find(x => x.zone === +el.dataset.z);
    if (!z) return;
    const c = rgbToHex(z.r, z.g, z.b);
    el.querySelector('i').style.borderColor = c;
    el.style.boxShadow = z.r + z.g + z.b > 0
      ? `0 0 26px ${c}66` : 'none';
  });
  buildPalette();
}

function buildPalette() {
  const box = $('#palette');
  box.innerHTML = '';
  const colors = [];
  state.zones.forEach(z => {
    const hex = rgbToHex(z.r, z.g, z.b);
    if (!colors.includes(hex)) colors.push(hex);
  });
  // тональные варианты текущего цвета + базовые акценты
  const src = colors[0] || $('#led_color').value;
  const { h, s, l } = hexToHsl(src);
  [l, l - 18, l + 20, l - 32].forEach(v => colors.push(hsl(h, s, v)));
  ['#ffffff', '#ff3b30', '#ffd60a', '#30d158', '#64d2ff'].forEach(c => colors.push(c));

  colors.forEach(c => {
    const b = document.createElement('div');
    b.className = 'sw';
    b.style.background = c;
    b.onclick = () => { $('#led_color').value = normalizeHex(c); selectSwatch(b); };
    box.appendChild(b);
  });
  selectSwatch(box.firstElementChild);
}

const normalizeHex = c => {
  if (c.startsWith('#')) return c;
  const m = c.match(/hsl\(\s*(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!m) return '#ffffff';
  const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  const f = n => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

function selectSwatch(el) {
  $$('.sw').forEach(s => s.classList.remove('sel'));
  if (el) el.classList.add('sel');
}

const chosenZone = () => ($('#zones md-filter-chip[selected]') || {}).dataset?.z || 'all';

async function ledApply() {
  const hex = $('#led_color').value;
  const bri = +$('#led_bri').value || 100;
  const [r, g, b] = hexToRgb(hex);
  const k = bri / 100;
  const j = await api('led.set', {
    zone: chosenZone(),
    r: Math.round(r * k), g: Math.round(g * k), b: Math.round(b * k),
  }).catch(e => ({ ok: 0, error: e.message }));
  if (j.ok !== 1) return toast(j.error, true);
  applyTheme(hex);
  await ledGet();
  toast('Цвет применён');
}

/* ─── анимации прошивки (.led) ─── */
async function ledPatterns() {
  const sel = $('#led_pat');
  if (sel.dataset.loaded) return;
  const j = await api('led.patterns', {}, 15000).catch(() => null);
  if (!j || j.ok !== 1 || !Array.isArray(j.patterns) || !j.patterns.length) return;
  sel.innerHTML = j.patterns.map((p, i) =>
    `<md-select-option value="${p}"${i ? '' : ' selected'}><div slot="headline">${p}</div></md-select-option>`).join('');
  sel.dataset.loaded = '1';
  sel.dataset.first = j.patterns[0];
  // options поднимаются асинхронно — ставим значение после slotchange
  setTimeout(() => { try { sel.value = j.patterns[0]; } catch {} }, 0);
}

async function ledPatPlay() {
  const b = $('#led_pat_play');
  const sel = $('#led_pat');
  const opt = sel.querySelector('md-select-option[selected]') || sel.querySelector('md-select-option');
  const p = sel.value || (opt && opt.value) || sel.dataset.first || '';
  if (!p) return toast('Выберите анимацию', true);
  b.disabled = true;
  const j = await api('led.play', { p }, 30000).catch(e => ({ ok: 0, error: e.message }));
  b.disabled = false;
  if (j.ok !== 1) {
    const m = j.error === 'no_frames' ? 'Эта анимация на gradient — не поддерживается' : (j.error || 'Не запустилось');
    return toast(m, true);
  }
  toast(`«${p}» играет · ${j.frames} кадров`);
}

async function ledPatStop() {
  const j = await api('led.stop').catch(e => ({ ok: 0, error: e.message }));
  if (j.error) return toast(j.error, true);
  toast(j.stopped ? 'Анимация остановлена' : 'Ничего не играло');
}

/* ─── пакеты ─── */
function linesToItems(out) {
  return (out || '').split('\n').map(s => s.trim()).filter(Boolean);
}

async function pkgInstalled() {
  const j = await api('yse.list', {}, 40000).catch(e => ({ out: '', rc: 1 }));
  const box = $('#pkg_list');
  box.innerHTML = '';
  const items = linesToItems(j.out);
  if (!items.length) { box.innerHTML = '<div class="empty">ничего не установлено</div>'; return; }
  items.forEach(line => {
    const [name, ...rest] = line.split(' - ');
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="nm"><b></b><small></small></div>
      <div class="act"><button class="mini danger">удалить</button></div>`;
    el.querySelector('b').textContent = name;
    el.querySelector('small').textContent = rest.join(' · ');
    el.querySelector('button').onclick = async () => {
      if (!(await confirmDlg('Удалить пакет?', name))) return;
      await api('yse.remove', { p: name }, 10000);
      toast(`Удаляю ${name}…`);
      setTimeout(pkgInstalled, 1500);
      setTimeout(yseLog, 2500);
    };
    box.appendChild(el);
  });
}

async function pkgSearch() {
  const q = $('#q').value.trim();
  if (!q) return;
  $('.spin', $('#p-pkg')).hidden = false;
  $('#q_res').innerHTML = '';
  const j = await api('yse.search', { q }, 40000).catch(e => ({ out: '' }));
  $('.spin', $('#p-pkg')).hidden = true;
  const items = linesToItems(j.out);
  if (!items.length) { $('#q_res').innerHTML = '<div class="empty">ничего не найдено</div>'; return; }
  items.forEach(line => {
    const parts = line.split(' - ');
    const name = parts[0], desc = parts.slice(2).join(' - ');
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="nm"><b></b><small></small></div>
      <div class="act"><button class="mini go">установить</button></div>`;
    el.querySelector('b').textContent = `${name} ${parts[1] ? '· ' + parts[1] : ''}`;
    el.querySelector('small').textContent = desc;
    el.querySelector('button').onclick = async () => {
      await api('yse.install', { p: name }, 10000);
      toast(`Ставлю ${name}…`);
      setTimeout(() => { yseLog(); pkgInstalled(); }, 2500);
      setTimeout(() => { yseLog(); pkgInstalled(); }, 7000);
    };
    $('#q_res').appendChild(el);
  });
}

async function yseLog() {
  const j = await api('yse.log', {}, 15000).catch(e => ({ out: 'нет журнала' }));
  $('#yse_log').textContent = linesToItems(j.out).join('\n') || '—';
}

/* ─── звук ─── */
async function sndList() {
  const j = await api('sound.list').catch(() => ({ files: [] }));
  const box = $('#snd_list');
  box.innerHTML = '';
  (j.files || []).forEach(f => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="nm"><b></b><small>/data/sounds</small></div>
      <div class="act"><button class="mini go">играть</button><button class="mini">стоп</button></div>`;
    el.querySelector('b').textContent = f;
    const [play, stop] = el.querySelectorAll('button');
    play.onclick = async () => { await api('sound.play', { f }); toast('Играет: ' + f); };
    stop.onclick = async () => { await api('sound.stop').catch(() => {}); toast('Остановлено'); };
    box.appendChild(el);
  });
  if (!box.children.length) box.innerHTML = '<div class="empty">файлов нет</div>';
}

async function chimeSync(on) {
  const j = await api('chime.set', { on: on ? 1 : 0 }, 12000).catch(e => ({ ok: 0, error: e.message }));
  if (j.ok !== 1) { $('#chime').selected = !on; return toast(j.error, true); }
  toast(on ? 'Чайм при включении: включён' : 'Чайм: выключен');
}

/* ─── USB ─── */
async function usbStatus() {
  const j = await api('usb.status', {}, 15000).catch(() => ({ usb: [], disks: [], cards: '' }));
  const box = $('#usb_list');
  box.innerHTML = '';
  const all = [...(j.usb || []), ...(j.disks || []).map(d => 'диск: ' + d)];
  if (!all.length) box.innerHTML = '<div class="empty">устройств нет</div>';
  all.forEach(u => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="nm"><b></b><small>usb</small></div>`;
    el.querySelector('b').textContent = u;
    box.appendChild(el);
  });
  $('#usb_cards').textContent = (j.cards || '').trim() || '—';
}

/* статус USB Host */
async function otgStatus() {
  const j = await api('otg.status', {}, 15000).catch(() => null);
  const pill = $('#otg_pill');
  if (!j || j.ok !== 1) { pill.textContent = 'OTG: не установлено'; pill.classList.add('err'); return; }
  pill.classList.remove('err');
  pill.textContent = j.host ? 'Host-режим ✓' : 'Host-режим ✗';
  pill.classList.toggle('err', !j.host);
  const d = $('#otg_disks');
  d.hidden = !j.disks;
  d.textContent = `${j.disks} диск${j.disks === 1 ? '' : (j.disks > 1 && j.disks < 5 ? 'а' : 'ов')}`;
  $('#otg_auto md-filter-chip[data-auto="1"]').selected = !!j.auto;
  $('#otg_auto md-filter-chip[data-auto="0"]').selected = !j.auto;
  if (j.log) { $('#otg_out').textContent = j.log; }
}

/* ─── система ─── */
async function sysInfo() {
  const j = await api('sys.info', {}, 15000).catch(e => ({ ok: 0 }));
  const g = $('#sys_grid');
  g.innerHTML = '';
  if (j.ok !== 1) { g.innerHTML = '<div class="empty">нет ответа</div>'; return; }
  const up = Math.round(j.uptime);
  const hh = Math.floor(up / 3600), mm = Math.floor((up % 3600) / 60);
  const cells = [
    ['Аптайм', `${hh}ч ${mm}м`, ''],
    ['Загрузка', j.load, +j.load.split(' ')[0] > 2 ? 'warn' : 'ok'],
    ['Память', ((((j.mem.match(/MemAvailable=(\d+)/) || [0, 0])[1]) / 1024) | 0) + ' МБ свободно', 'ok'],
    ['Диск /data', ((j.disk.match(/(\d+)%\s+\/bkupgrade/) || [0, '—'])[1]) + '% занято', ''],
    ['Root', j.root === '0' ? 'uid=0 ✅' : 'нет', 'ok'],
    ['Shell', j.shell, ''],
    ['ADB :5555', j.adb ? 'открыт' : 'закрыт', j.adb ? 'ok' : 'warn'],
    ['SSH :2222', j.ssh ? 'запущен' : 'нет', j.ssh ? 'ok' : 'warn'],
    ['OTA', j.ota_off ? 'отключена ✅' : 'активна', j.ota_off ? 'ok' : 'warn'],
  ];
  cells.forEach(([k, v, cls]) => {
    const d = document.createElement('div');
    d.className = 'cell ' + cls;
    d.innerHTML = '<span></span><b></b>';
    d.querySelector('span').textContent = k;
    d.querySelector('b').textContent = v;
    g.appendChild(d);
  });
}

async function sysLog() {
  const kind = state.pendingLog;
  const j = kind === 'dmesg'
    ? await api('log.dmesg', {}, 15000).catch(() => ({ out: '' }))
    : await api('log.tail', { f: kind }, 15000).catch(() => ({ out: '' }));
  $('#sys_log').textContent = linesToItems(j.out).slice(-80).join('\n') || '—';
}

/* ─── консоль ─── */
const shHist = [];
let shIdx = -1;
const nativeApp = () => (window.Android || null);
const shTarget = () =>
  ($('#sh_target md-filter-chip[selected]') || { dataset: { t: 'speaker' } }).dataset.t || 'speaker';

async function shRun() {
  const inp = $('#sh_cmd');
  const cmd = inp.value.trim();
  if (!cmd) return;
  inp.value = '';
  shHist.push(cmd); shIdx = shHist.length;
  const out = $('#sh_out');
  const where = shTarget() === 'phone' && nativeApp() ? (state.ip || 'телефон') : state.ip;
  out.innerHTML += `<span class="u">${escapeHtml(where)} $</span> ${escapeHtml(cmd)}\n`;

  // запасной канал: локальная консоль телефона через Shizuku (uid shell)
  if (shTarget() === 'phone') {
    const nd = nativeApp();
    if (!nd) return void (out.innerHTML += '<span class="e">нет моста: это APK с Shizuku</span>\n\n');
    if (!nd.shizukuReady())
      return void (out.innerHTML += '<span class="e">shizuku: нет доступа (откройте приложение заново)</span>\n\n');
    const t0 = Date.now();
    const res = nd.exec(cmd) || '';
    out.innerHTML += escapeHtml(res.trim()) + '\n';
    out.innerHTML += `<span class="e">[локально, ${Date.now() - t0} мс]</span>\n\n`;
    out.scrollTop = out.scrollHeight;
    return;
  }

  const j = await api('shell', { c: cmd }, 60000).catch(e => ({ ok: 0, out: e.message }));
  out.innerHTML += escapeHtml((j.out || '').trim()) + '\n';
  if (j.rc) out.innerHTML += `<span class="e">[код ${j.rc}]</span>\n`;
  out.innerHTML += '\n';
  out.scrollTop = out.scrollHeight;
}
const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ─── вкладки / обновление страниц ─── */
function showPage(id) {
  state.page = id;
  $$('.page').forEach(p => p.hidden = p.id !== id);
  refreshPage();
}

const loaders = {
  'p-led':  () => { ledGet().catch(() => {}); ledPatterns().catch(() => {}); },
  'p-pkg':  () => { pkgInstalled(); yseLog(); },
  'p-snd':  () => { sndList(); api('chime.get').then(j => { $('#chime').selected = !!j.on; }).catch(() => {}); },
  'p-usb':  () => { usbStatus().catch(() => {}); otgStatus().catch(() => {}); },
  'p-sys':  () => { sysInfo(); sysLog(); },
  'p-shell':() => {},
};

function refreshPage() { const f = loaders[state.page]; if (f) f(); }

function bindTabs() {
  const nav = $('#nav');
  const pick = () => {
    const i = nav.selectedIndex ?? 0;
    const tab = $$('#nav md-primary-tab')[i];
    if (tab && tab.dataset.page) showPage(tab.dataset.page);
  };
  nav.addEventListener('change', pick);
  nav.addEventListener('click', () => setTimeout(pick, 0));
}

/* ─── привязка событий ─── */
function bind() {
  $('#btn_connect').onclick = async () => {
    const b = $('#btn_connect'); b.disabled = true;
    if (await connect($('#ip').value)) await afterConnect();
    b.disabled = false;
  };
  $('#btn_find').onclick = discover;
  $('#btn_pin').onclick = submitPin;
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

  $('#led_apply').onclick = ledApply;
  $('#led_pat_play').onclick = ledPatPlay;
  $('#led_pat_stop').onclick = ledPatStop;
  $('#led_off').onclick = async () => {
    await api('led.off');
    await ledGet();
    toast('Подсветка погашена');
  };
  $('#led_color').oninput = e => applyTheme(e.target.value);
  $('#zones').addEventListener('change', () => {});
  $('#palette').addEventListener('click', () => {
    $('#led_color').value = normalizeHex(($('#palette .sw.sel') || {}).style?.background || '#fff');
  });

  $('#q_go').onclick = pkgSearch;
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') pkgSearch(); });
  $('#pkg_reload').onclick = pkgInstalled;
  $('#yse_log_up').onclick = yseLog;

  $('#snd_play_url').onclick = async () => {
    const u = $('#snd_url').value.trim();
    if (!u) return toast('Укажите ссылку', true);
    await api('sound.play', { u });
    toast('Играет поток');
  };
  $('#snd_stop').onclick = async () => { await api('sound.stop').catch(() => {}); toast('Остановлено'); };
  $('#vol').addEventListener('change', async e => {
    const j = await api('sound.vol', { v: e.target.value }).catch(x => ({ rc: 1 }));
    toast(j.rc ? 'Громкость: команда отклонена колонкой' : 'Громкость: ' + e.target.value + '%', !!j.rc);
  });
  $('#chime').addEventListener('change', e => chimeSync(e.target.selected));

  $('#usb_mount').onclick  = async () => { const j = await api('usb.mount').catch(e => ({ error: e.message })); toast(j.error || 'Смонтировано', !!j.error); };
  $('#usb_umount').onclick = async () => { const j = await api('usb.umount').catch(e => ({ error: e.message })); toast(j.error || 'Отмонтировано', !!j.error); };
  $('#route').addEventListener('change', async () => {
    const to = ($('#route md-filter-chip[selected]') || {}).dataset?.to || 'speaker';
    const j = await api('usb.route', { to }).catch(e => ({ error: e.message }));
    toast(j.error || ('Маршрут: ' + to), !!j.error);
  });

  $('#otg_start').onclick = async () => {
    const b = $('#otg_start'); b.disabled = true;
    toast('Переключаю порт в Host…');
    const j = await api('otg.start', {}, 90000).catch(e => ({ error: e.message }));
    b.disabled = false;
    if (j.ok !== 1 || j.rc) {
      const o = $('#otg_out'); o.hidden = false; o.textContent = j.out || j.error || ('rc=' + j.rc);
      toast(j.error || ('Ошибка, rc=' + j.rc), true);
      return;
    }
    const o = $('#otg_out'); o.hidden = false; o.textContent = j.out || '—';
    toast('Host-режим включён ✅');
    otgStatus(); usbStatus().catch(() => {});
  };
  $('#otg_log').onclick = async () => {
    const j = await api('otg.log').catch(e => ({ error: e.message }));
    const o = $('#otg_out'); o.hidden = false; o.textContent = j.out || j.error || '—';
  };
  $('#otg_auto').addEventListener('change', async () => {
    const auto = ($('#otg_auto md-filter-chip[selected]') || {}).dataset?.auto || '1';
    const j = await api('otg.auto', { auto }).catch(e => ({ error: e.message }));
    toast(j.error || (auto === '1' ? 'Автозапуск включён' : 'Автозапуск выключен'), !!j.error);
    otgStatus();
  });

  $('#reboot').onclick = async () => {
    if (!(await confirmDlg('Перезагрузка', 'Колонка перезагрузится за ~30 секунд. Продолжить?'))) return;
    await api('sys.reboot').catch(() => {});
    toast('Перезагружаю…');
    setTimeout(async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (await ping().then(() => true).catch(() => false)) break;
      }
      refreshPage();
      toast('Колонка снова в сети');
    }, 5000);
  };
  $('#sys_ports').onclick = async () => {
    const j = await api('sys.ports').catch(() => ({ out: '' }));
    $('#sys_log').textContent = j.out || '—';
  };
  $('#logs').addEventListener('change', () => {
    state.pendingLog = ($('#logs md-filter-chip[selected]') || {}).dataset?.log || 'dmesg';
    sysLog();
  });

  $('#sh_go').onclick = shRun;
  $('#sh_clear').onclick = () => { $('#sh_out').innerHTML = ''; };
  $('#sh_cmd').addEventListener('keydown', e => {
    if (e.key === 'Enter') shRun();
    if (e.key === 'ArrowUp')   { if (shIdx > 0) { shIdx--; $('#sh_cmd').value = shHist[shIdx]; } e.preventDefault(); }
    if (e.key === 'ArrowDown') { if (shIdx < shHist.length - 1) { shIdx++; $('#sh_cmd').value = shHist[shIdx]; }
                                 else { shIdx = shHist.length; $('#sh_cmd').value = ''; } e.preventDefault(); }
  });

  $('#btn_refresh').onclick = refreshPage;
}

/* ─── старт ─── */
async function boot() {
  bindTabs();
  bind();
  logFind('загрузка… источник: ' + location.protocol);

  // deep-link: ?t=токен[&ip=...][&page=p-led] — быстрый вход и отладка
  const qs = new URLSearchParams(location.search);
  if (qs.get('noanim')) document.body.classList.add('noanim');
  if (qs.get('t')) {
    state.token = qs.get('t');
    state.ip = qs.get('ip') || location.hostname;
    if (qs.has('base')) state.base = qs.get('base') || '';
    store.set('tok:' + state.ip, state.token);
    await enterApp();
    if (qs.get('page')) showPage(qs.get('page'));
    return;
  }

  // 1) интерфейс отдан самой колонкой → работаем с того же источника
  if (location.protocol.startsWith('http')) {
    try {
      const p = await ping();
      state.ip = location.hostname || p.ip;
      state.token = store.get('tok:' + state.ip);
      setPinMode(!p.pin_set);
      return showScreen(state.token ? 's-app' : 's-pin'), state.token ? enterApp() : void 0;
    } catch { /* панель отдана не колонкой — идём в ручной ввод */ }
  }

  // 2) приложение (file://) → вспоминаем IP и пробуем соединиться
  const saved = store.get('ip');
  $('#ip').value = saved || guessIpHint();
  if (saved && await connect(saved)) return afterConnect();

  if (location.protocol.startsWith('http')) {
    $('#ip').value = location.hostname || '';
    logFind('панель не на колонке — введите её IP');
  }
  showScreen('s-conn');
}

const guessIpHint = () => (guessSubnet() ? guessSubnet() + '.20' : '192.168.1.20');

boot()
  .then(() => { window.__appStarted = true; })
  .catch(e => { showScreen('s-conn'); logFind('ошибка: ' + e.message); window.__showErrs && window.__showErrs(); });
