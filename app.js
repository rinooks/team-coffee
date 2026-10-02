const CAFES = ['메가커피', '컴포즈커피', '바나프레소'];
const CATEGORIES = ['커피', '라떼', '티·에이드', '스무디·프라페'];
const CATEGORY_EMOJI = { '커피': '☕', '라떼': '🥛', '티·에이드': '🍋', '스무디·프라페': '🍓' };
const TAGLINES = [
  '오늘 커피는 누가 쏘나? 🤔',
  '카페인 충전 시간이에요 ⚡',
  '마감 임박! 서두르세요 ☕',
  '한 잔의 여유, 같이 마셔요 🧋',
  '아아냐 뜨아냐, 그것이 문제로다 🧊🔥',
];
const LS_NAME = 'teamCoffee.name';
const LS_TOKENS = 'teamCoffee.tokens';
const POLL_MS = 15000;

const state = {
  date: kstToday(),
  menu: null,
  cafe: CAFES[0],
  closed: false,
  orders: [],
  selected: null,
  temp: null,
  submitting: false,
};

const $ = (sel) => document.querySelector(sel);
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

// ---------- 유틸 ----------

function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDateLabel() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${days[d.getUTCDay()]}요일`;
}

function shortDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function randomToken() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(LS_TOKENS)) || {};
  } catch {
    return {};
  }
}

function saveTokens(tokens) {
  localStorage.setItem(LS_TOKENS, JSON.stringify(tokens));
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// ---------- 메뉴 / 표기 ----------

function findItem(cafe, name) {
  return state.menu?.[cafe]?.find((item) => item.name === name);
}

function priceFor(item, temp) {
  if (item.price != null) return item.price;
  return temp === 'HOT' ? item.price_hot : item.price_ice;
}

function priceText(item) {
  if (item.price != null) return won(item.price);
  return `${won(item.price_hot)}~`;
}

// ICE → "아이스 ○○", HOT → "○○(HOT)". 아이스 전용 메뉴(에이드 등)는 접두어 생략.
function drinkLabel(order) {
  if (order.temp === 'HOT') return `${order.menu}(HOT)`;
  if (order.temp === 'ICE') {
    const item = findItem(order.cafe, order.menu);
    const iceOnly = item && item.temps.length === 1 && item.temps[0] === 'ICE';
    return iceOnly ? order.menu : `아이스 ${order.menu}`;
  }
  return order.menu;
}

// 같은 사람의 같은 주문(카페·메뉴·온도·요청사항)은 하나로 묶어 수량으로 표시
function groupOrders(orders) {
  const people = new Map();
  for (const o of orders) {
    if (!people.has(o.name)) people.set(o.name, new Map());
    const items = people.get(o.name);
    const key = [o.cafe, o.menu, o.temp, o.note || ''].join('|');
    if (!items.has(key)) items.set(key, { ...o, ids: [], count: 0 });
    const g = items.get(key);
    g.ids.push(o.id);
    g.count += 1;
  }
  return [...people].map(([name, items]) => ({ name, items: [...items.values()] }));
}

// ---------- 렌더링 ----------

function renderHeader() {
  $('#today-label').textContent = kstDateLabel();
  $('#closed-banner').hidden = !state.closed;
  const closeBtn = $('#close-btn');
  closeBtn.textContent = state.closed ? '마감 해제 🔓' : '마감하기 🔒';
  closeBtn.classList.toggle('is-closed', state.closed);
  updateSubmitButton();
}

function renderCafes() {
  $('#cafe-pills').innerHTML = CAFES.map((cafe) => `
    <button type="button" class="pill" role="radio" aria-checked="${cafe === state.cafe}" data-cafe="${esc(cafe)}">${esc(cafe)}</button>
  `).join('');
}

function renderMenu() {
  const items = state.menu?.[state.cafe] ?? [];
  const cats = CATEGORIES.filter((c) => items.some((i) => i.category === c));
  $('#cat-tabs').innerHTML = cats.map((c, idx) => `
    <button type="button" class="cat-tab" data-target="cat-${idx}">${CATEGORY_EMOJI[c]} ${esc(c)}</button>
  `).join('');

  if (!items.length) {
    $('#menu-list').innerHTML = `<p class="empty">${state.menu ? '메뉴가 없어요 😢' : '메뉴 불러오는 중… ☕'}</p>`;
    return;
  }

  $('#menu-list').innerHTML = cats.map((c, idx) => `
    <div class="category" id="cat-${idx}">
      <h3 class="category-title">${CATEGORY_EMOJI[c]} ${esc(c)}</h3>
      <div class="menu-grid">
        ${items.filter((i) => i.category === c).map((i) => `
          <button type="button" class="menu-card" data-id="${esc(i.id)}">
            <span class="temps">${i.temps.map((t) => `<span class="tag ${t.toLowerCase()}">${t}</span>`).join('')}</span>
            <span class="emoji">${CATEGORY_EMOJI[c]}</span>
            <span class="name">${esc(i.name)}</span>
            <span class="price">${priceText(i)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderBoard() {
  const { orders } = state;
  const total = orders.reduce((sum, o) => sum + o.price, 0);
  $('#summary').innerHTML = `<span>총 ${orders.length}잔</span><span class="dot">·</span><span>합계 ${won(total)}</span>`;

  if (!orders.length) {
    $('#chips').innerHTML = '';
    $('#people').innerHTML = '<p class="empty">아직 주문이 없어요. 첫 잔의 주인공이 되어주세요! 🥐</p>';
    return;
  }

  const multiCafe = new Set(orders.map((o) => o.cafe)).size > 1;
  const counts = new Map();
  for (const o of orders) {
    const label = (multiCafe ? `[${o.cafe}] ` : '') + drinkLabel(o);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  $('#chips').innerHTML = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `<span class="chip">${esc(label)} <b>×${n}</b></span>`)
    .join('');

  const tokens = loadTokens();
  $('#people').innerHTML = groupOrders(orders).map(({ name, items }) => {
    const mine = items.some((g) => g.ids.some((id) => tokens[id]));
    return `
      <div class="person${mine ? ' mine' : ''}">
        <p class="person-name">${esc(name)}${mine ? '<span class="me-badge">나</span>' : ''}</p>
        ${items.map((g) => {
          const ownedId = [...g.ids].reverse().find((id) => tokens[id]);
          return `
            <div class="order-row">
              <div class="order-main">
                <div class="order-menu">
                  <span class="cafe-badge c${CAFES.indexOf(g.cafe)}">${esc(g.cafe)}</span>${esc(drinkLabel(g))}<span class="qty">×${g.count}</span>
                </div>
                ${g.note ? `<div class="order-note">${esc(g.note)}</div>` : ''}
              </div>
              ${ownedId ? `<button type="button" class="del-btn" data-id="${esc(ownedId)}">삭제</button>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function renderAll() {
  renderHeader();
  renderCafes();
  renderMenu();
  renderBoard();
}

// ---------- 바텀시트 ----------

function openSheet(item) {
  state.selected = item;
  state.temp = item.temps.includes('ICE') ? 'ICE' : item.temps[0];
  $('#sheet-cafe').textContent = state.cafe;
  $('#sheet-title').textContent = item.name;
  $('#note-input').value = '';
  $('#name-input').value = localStorage.getItem(LS_NAME) || '';
  for (const btn of document.querySelectorAll('.temp-btn')) {
    btn.disabled = !item.temps.includes(btn.dataset.temp);
  }
  updateSheet();
  $('#sheet-backdrop').hidden = false;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => ($('#name-input').value ? $('#note-input') : $('#name-input')).focus({ preventScroll: true }), 50);
}

function closeSheet() {
  $('#sheet-backdrop').hidden = true;
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
  state.selected = null;
}

function updateSheet() {
  const item = state.selected;
  if (!item) return;
  for (const btn of document.querySelectorAll('.temp-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.temp === state.temp));
  }
  $('#sheet-price').textContent = won(priceFor(item, state.temp));
  updateSubmitButton();
}

function updateSubmitButton() {
  const btn = $('#submit-btn');
  btn.disabled = state.closed || state.submitting;
  btn.textContent = state.closed ? '오늘 주문 마감! ☕' : state.submitting ? '담는 중… ☕' : '주문 담기 🧋';
}

async function submitOrder(event) {
  event.preventDefault();
  const item = state.selected;
  if (!item || state.closed || state.submitting) return;

  const name = $('#name-input').value.trim();
  const note = $('#note-input').value.trim();
  if (!name) {
    toast('이름을 알려주세요! ✍️', true);
    $('#name-input').focus();
    return;
  }

  const token = randomToken();
  state.submitting = true;
  updateSubmitButton();
  try {
    const { order } = await api('/api/orders', {
      method: 'POST',
      body: {
        name,
        cafe: state.cafe,
        menu: item.name,
        price: priceFor(item, state.temp),
        temp: state.temp,
        note,
        token,
      },
    });
    const tokens = loadTokens();
    tokens[order.id] = token;
    saveTokens(tokens);
    localStorage.setItem(LS_NAME, name);
    closeSheet();
    toast(`${drinkLabel(order)} 담았어요! 🧋`);
    await refresh();
  } catch (err) {
    toast(err.message, true);
    if (/마감/.test(err.message)) refresh();
  } finally {
    state.submitting = false;
    updateSubmitButton();
  }
}

// ---------- 액션 ----------

async function changeCafe(cafe) {
  if (cafe === state.cafe) return;
  const prev = state.cafe;
  state.cafe = cafe;
  renderCafes();
  renderMenu();
  try {
    await api('/api/settings', { method: 'PUT', body: { today_cafe: cafe } });
    toast(`오늘은 ${cafe}로 가요! ☕`);
  } catch (err) {
    state.cafe = prev;
    renderCafes();
    renderMenu();
    toast(err.message, true);
  }
}

async function deleteOrder(id) {
  const tokens = loadTokens();
  if (!tokens[id]) return;
  if (!confirm('이 주문을 뺄까요?')) return;
  try {
    await api(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE', body: { token: tokens[id] } });
    delete tokens[id];
    saveTokens(tokens);
    toast('주문을 뺐어요 👋');
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
}

function buildOrderSheet() {
  const byCafe = new Map();
  for (const o of state.orders) {
    if (!byCafe.has(o.cafe)) byCafe.set(o.cafe, []);
    byCafe.get(o.cafe).push(o);
  }
  const blocks = [...byCafe].map(([cafe, orders]) => {
    const lines = [`[${shortDate(state.date)} 커피 주문 - ${cafe}]`];
    for (const { name, items } of groupOrders(orders)) {
      for (const g of items) {
        lines.push(`- ${name}: ${drinkLabel(g)} ${g.count}잔${g.note ? ` (${g.note})` : ''}`);
      }
    }
    const total = orders.reduce((sum, o) => sum + o.price, 0);
    lines.push(`총 ${orders.length}잔 / ${total.toLocaleString('ko-KR')}원`);
    return lines.join('\n');
  });
  if (byCafe.size > 1) {
    const total = state.orders.reduce((sum, o) => sum + o.price, 0);
    blocks.push(`전체 합계: ${state.orders.length}잔 / ${total.toLocaleString('ko-KR')}원`);
  }
  return blocks.join('\n\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // http 환경 등 Clipboard API를 못 쓰면 textarea로 대체
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('복사에 실패했어요 😢');
}

async function copyOrders() {
  if (!state.orders.length) {
    toast('아직 복사할 주문이 없어요 🥲', true);
    return;
  }
  try {
    await copyText(buildOrderSheet());
    toast('주문서를 복사했어요! 📋');
  } catch (err) {
    toast(err.message, true);
  }
}

async function toggleClosed() {
  const next = !state.closed;
  try {
    const settings = await api('/api/settings', { method: 'PUT', body: { is_closed: next } });
    applySettings(settings);
    renderHeader();
    toast(next ? '오늘 주문 마감! 🔒' : '주문을 다시 받아요! 🔓');
  } catch (err) {
    toast(err.message, true);
  }
}

async function resetOrders() {
  if (!confirm(`${shortDate(state.date)} 주문을 전부 지울까요?\n되돌릴 수 없어요! 🗑️`)) return;
  try {
    const { deleted } = await api('/api/reset', { method: 'POST', body: { date: state.date } });
    toast(`주문 ${deleted}건을 지웠어요 🧹`);
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- 데이터 로딩 ----------

function applySettings(settings) {
  if (CAFES.includes(settings.today_cafe)) state.cafe = settings.today_cafe;
  state.closed = Boolean(settings.is_closed);
}

async function refresh() {
  state.date = kstToday();
  const [settings, data] = await Promise.all([
    api('/api/settings'),
    api(`/api/orders?date=${state.date}`),
  ]);
  const cafeChanged = settings.today_cafe !== state.cafe;
  applySettings(settings);
  state.orders = data.orders;
  renderHeader();
  if (cafeChanged) {
    renderCafes();
    renderMenu();
  }
  renderBoard();
}

async function init() {
  $('.tagline').textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
  renderAll();

  try {
    const res = await fetch('/menu.json');
    if (!res.ok) throw new Error();
    state.menu = await res.json();
    renderMenu();
  } catch {
    toast('메뉴를 불러오지 못했어요 😢', true);
  }

  try {
    await refresh();
  } catch (err) {
    toast(`서버 연결에 실패했어요: ${err.message}`, true);
  }

  setInterval(() => {
    if (!document.hidden && !state.submitting) refresh().catch(() => {});
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh().catch(() => {});
  });
}

// ---------- 이벤트 ----------

$('#cafe-pills').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cafe]');
  if (btn) changeCafe(btn.dataset.cafe);
});

$('#cat-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-target]');
  if (btn) document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#menu-list').addEventListener('click', (e) => {
  const card = e.target.closest('.menu-card');
  if (!card) return;
  const item = state.menu?.[state.cafe]?.find((i) => i.id === card.dataset.id);
  if (item) openSheet(item);
});

$('#people').addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (btn) deleteOrder(btn.dataset.id);
});

$('#temp-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.temp-btn');
  if (!btn || btn.disabled) return;
  state.temp = btn.dataset.temp;
  updateSheet();
});

$('#order-form').addEventListener('submit', submitOrder);
$('#sheet-close').addEventListener('click', closeSheet);
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});

$('#copy-btn').addEventListener('click', copyOrders);
$('#close-btn').addEventListener('click', toggleClosed);
$('#reset-btn').addEventListener('click', resetOrders);

init();
