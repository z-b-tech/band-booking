/* ============================================================
 * 排练室预约 — 前端逻辑
 * 两种后端：Supabase（正式）/ localStorage（演示）
 * ============================================================ */
(() => {
'use strict';

// ---------------- 常量 ----------------
const CFG = window.APP_CONFIG || {};
const HAS_SB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const WINDOWS = [
  { label: '10:00 – 14:00', start: 600,  end: 840  },
  { label: '17:30 – 21:00', start: 1050, end: 1260 },
];
const SLOT = 30;
const SLOT_PX = 44;
const MAX_DAYS = 10;
const LS_MINE = 'bb_mine_v1';
const LS_DEMO = 'bb_demo_v1';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const DOW = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});
const tok = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

// ---------------- 状态 ----------------
const today = new Date(); today.setHours(0, 0, 0, 0);
const state = {
  view: 'booking',
  date: ymd(today),
  bookings: [],
  equipment: [],
  borrows: [],
  adminBookings: [],
  adminBorrows: [],
  session: null,
  sel: null,
  loading: false,
};

// ---------------- 后端：Supabase ----------------
function supabaseApi() {
  const client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const fail = e => { throw new Error(e && e.message ? e.message : String(e)); };

  return {
    mode: 'supabase',
    async listBookings(from, to) {
      const { data, error } = await client.from('bookings_public').select('*')
        .gte('booking_date', from).lte('booking_date', to).order('booking_date').order('start_time');
      if (error) fail(error); return data || [];
    },
    async createBooking(p) {
      const { data, error } = await client.rpc('create_booking', {
        p_band: p.band_name, p_leader: p.leader_name,
        p_contact_type: p.contact_type, p_contact: p.contact,
        p_date: p.booking_date, p_start: p.start_time, p_end: p.end_time,
        p_double: p.needs_double_pedal, p_note: p.note, p_token: p.cancel_token,
      });
      if (error) fail(error); return data;
    },
    async cancelBooking(id, token) {
      const { data, error } = await client.rpc('cancel_booking', { p_id: id, p_token: token });
      if (error) fail(error); return data;
    },
    async listEquipment() {
      const { data, error } = await client.from('equipment_public').select('*').order('sort_order');
      if (error) fail(error); return data || [];
    },
    async listBorrows(from, to) {
      const { data, error } = await client.from('borrows_public').select('*')
        .gte('borrow_date', from).lte('borrow_date', to).order('borrow_date').order('start_time');
      if (error) fail(error); return data || [];
    },
    async createBorrow(p) {
      const { data, error } = await client.rpc('create_borrow', {
        p_equipment_id: p.equipment_id, p_item_name: p.item_name, p_qty: p.qty,
        p_borrower: p.borrower_name, p_contact_type: p.contact_type, p_contact: p.contact,
        p_date: p.borrow_date, p_start: p.start_time, p_end: p.end_time,
        p_note: p.note, p_token: p.cancel_token,
      });
      if (error) fail(error); return data;
    },
    async cancelBorrow(id, token) {
      const { data, error } = await client.rpc('cancel_borrow', { p_id: id, p_token: token });
      if (error) fail(error); return data;
    },
    // 管理员
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) fail(error); return data.session;
    },
    async signOut() { await client.auth.signOut(); },
    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session || null;
    },
    async adminBookings() {
      const { data, error } = await client.from('bookings').select('*')
        .order('booking_date', { ascending: true }).order('start_time', { ascending: true }).limit(500);
      if (error) fail(error); return data || [];
    },
    async adminBorrows() {
      const { data, error } = await client.from('borrows').select('*')
        .order('created_at', { ascending: false }).limit(500);
      if (error) fail(error); return data || [];
    },
    async deleteBooking(id) {
      const { error } = await client.from('bookings').delete().eq('id', id);
      if (error) fail(error);
    },
    async deleteBorrow(id) {
      const { error } = await client.from('borrows').delete().eq('id', id);
      if (error) fail(error);
    },
    async setBorrowStatus(id, status) {
      const { error } = await client.from('borrows').update({ status }).eq('id', id);
      if (error) fail(error);
    },
    async addEquipment(name, qty) {
      const { error } = await client.from('equipment')
        .insert({ name, total_qty: Number(qty) || 1, sort_order: 100 });
      if (error) fail(error);
    },
    async deleteEquipment(id) {
      const { error } = await client.from('equipment').delete().eq('id', id);
      if (error) fail(error);
    },
  };
}

// ---------------- 后端：演示（localStorage） ----------------
function demoApi() {
  const read = () => {
    try {
      const raw = localStorage.getItem(LS_DEMO);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const seed = {
      bookings: [
        { id: uid(), band_name: '示例 · 夏日回声', leader_name: '林同学', contact_type: 'wechat',
          contact: 'lin_demo_wx', booking_date: ymd(today), start_time: '18:00', end_time: '19:00',
          needs_double_pedal: false, note: '', cancel_token: tok(), created_at: new Date().toISOString() },
        { id: uid(), band_name: '示例 · 夜航', leader_name: '陈同学', contact_type: 'qq',
          contact: '123456789', booking_date: ymd(today), start_time: '18:30', end_time: '19:30',
          needs_double_pedal: true, note: '需要 2 支麦', cancel_token: tok(), created_at: new Date().toISOString() },
        { id: uid(), band_name: '示例 · 汽水', leader_name: '周同学', contact_type: 'phone',
          contact: '13800000000', booking_date: ymd(new Date(today.getTime() + 86400000)),
          start_time: '10:00', end_time: '11:30', needs_double_pedal: false, note: '',
          cancel_token: tok(), created_at: new Date().toISOString() },
      ],
      equipment: [
        { id: uid(), name: '音箱（一体式）', total_qty: 2, note: '含电源线、喇叭线', sort_order: 10 },
        { id: uid(), name: '鼓组（爵士鼓）', total_qty: 1, note: '不含镲片', sort_order: 20 },
        { id: uid(), name: '贝斯音箱',       total_qty: 1, note: '', sort_order: 30 },
        { id: uid(), name: '麦克风',         total_qty: 4, note: '含支架', sort_order: 40 },
        { id: uid(), name: 'DI 盒',          total_qty: 2, note: '', sort_order: 50 },
      ],
      borrows: [
        { id: uid(), equipment_id: null, item_name: '麦克风', qty: 2, borrower_name: '王同学',
          contact_type: 'wechat', contact: 'wang_demo', borrow_date: ymd(today),
          start_time: '10:00', end_time: '14:00', note: '', status: 'pending',
          cancel_token: tok(), created_at: new Date().toISOString() },
      ],
    };
    localStorage.setItem(LS_DEMO, JSON.stringify(seed));
    return seed;
  };
  const write = d => localStorage.setItem(LS_DEMO, JSON.stringify(d));
  const inRange = (d, from, to) => d >= from && d <= to;

  return {
    mode: 'demo',
    async listBookings(from, to) {
      return read().bookings.filter(b => inRange(b.booking_date, from, to))
        .sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time));
    },
    async createBooking(p) {
      const d = read();
      if (p.booking_date < ymd(new Date())) throw new Error('不能预约过去的日期');
      const last = new Date(); last.setDate(last.getDate() + MAX_DAYS);
      if (p.booking_date > ymd(last)) throw new Error('最多只能预约 10 天内');
      const id = uid();
      d.bookings.push({ id, ...p, created_at: new Date().toISOString() });
      write(d); return id;
    },
    async cancelBooking(id, token) {
      const d = read();
      const i = d.bookings.findIndex(b => b.id === id && b.cancel_token === token);
      if (i < 0) throw new Error('取消失败：记录不存在');
      d.bookings.splice(i, 1); write(d); return true;
    },
    async listEquipment() { return read().equipment.slice().sort((a, b) => a.sort_order - b.sort_order); },
    async listBorrows(from, to) {
      return read().borrows.filter(b => inRange(b.borrow_date, from, to))
        .sort((a, b) => (a.borrow_date + a.start_time).localeCompare(b.borrow_date + b.start_time));
    },
    async createBorrow(p) {
      const d = read(); const id = uid();
      d.borrows.push({ id, ...p, status: 'pending', created_at: new Date().toISOString() });
      write(d); return id;
    },
    async cancelBorrow(id, token) {
      const d = read();
      const i = d.borrows.findIndex(b => b.id === id && b.cancel_token === token);
      if (i < 0) throw new Error('取消失败：记录不存在');
      d.borrows.splice(i, 1); write(d); return true;
    },
    async signIn(email, password) {
      if (email.trim() !== 'admin' || password !== 'admin123') throw new Error('演示模式账号：admin / admin123');
      return { user: { email: 'admin' } };
    },
    async signOut() {},
    async getSession() { return state.session; },
    async adminBookings() { return read().bookings.slice().sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time)); },
    async adminBorrows() { return read().borrows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); },
    async deleteBooking(id) { const d = read(); d.bookings = d.bookings.filter(b => b.id !== id); write(d); },
    async deleteBorrow(id) { const d = read(); d.borrows = d.borrows.filter(b => b.id !== id); write(d); },
    async setBorrowStatus(id, status) { const d = read(); const b = d.borrows.find(x => x.id === id); if (b) b.status = status; write(d); },
    async addEquipment(name, qty) { const d = read(); d.equipment.push({ id: uid(), name, total_qty: Number(qty) || 1, note: '', sort_order: 100 }); write(d); },
    async deleteEquipment(id) { const d = read(); d.equipment = d.equipment.filter(e => e.id !== id); write(d); },
  };
}

const api = HAS_SB ? supabaseApi() : demoApi();

// ---------------- 小工具 ----------------
function toast(msg, type) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast ' + (type || ''); }, 2600);
}
function overlapPairs(list) {
  const badge = new Map();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.booking_date !== b.booking_date) continue;
      const as = toMin(a.start_time), ae = toMin(a.end_time);
      const bs = toMin(b.start_time), be = toMin(b.end_time);
      if (as < be && bs < ae) {
        badge.set(a.id, (badge.get(a.id) || 0) + 1);
        badge.set(b.id, (badge.get(b.id) || 0) + 1);
      }
    }
  }
  return badge;
}
function contactLabel(type) { return { wechat: '微信', qq: 'QQ', phone: '手机' }[type] || '联系'; }

// 联系方式长度：数据库里有 3–60 的约束，这里提前拦，别让用户看到英文报错
function checkContact(c) {
  const s = String(c || '').trim();
  if (s.length < 3) throw new Error('联系方式太短：请填完整的微信号 / QQ 号 / 手机号（至少 3 位）');
  if (s.length > 60) throw new Error('联系方式太长（最多 60 个字符）');
}

// 把数据库的技术错误翻译成人话
function friendlyError(msg) {
  const m = String(msg || '');
  if (m.includes('bookings_contact_check')) return '联系方式太短：请填完整的微信号 / QQ 号 / 手机号（至少 3 位）';
  if (m.includes('booking_in_window')) return '这个时间不在开放时段内（10:00–14:00 / 17:30–21:00）';
  if (m.includes('booking_time_order')) return '结束时间必须晚于开始时间';
  if (m.includes('borrow_time_order')) return '归还时间必须晚于开始时间';
  if (m.includes('contact') && m.includes('check')) return '联系方式格式不对，请检查一下';
  return m;
}
function statusBadge(s) {
  const map = {
    pending:  ['待审批', 'warn'],
    approved: ['已批准', 'ok'],
    rejected: ['已拒绝', 'danger'],
    returned: ['已归还', 'mute'],
  };
  const [t, c] = map[s] || [s, 'mute'];
  return `<span class="badge ${c}">${t}</span>`;
}

// ---------------- 我的登记（本机） ----------------
function mineAll() {
  try { return JSON.parse(localStorage.getItem(LS_MINE) || '[]'); } catch (e) { return []; }
}
function mineSave(list) { localStorage.setItem(LS_MINE, JSON.stringify(list)); }
function mineAdd(item) { const l = mineAll(); l.unshift(item); mineSave(l); }
function mineRemove(id) { mineSave(mineAll().filter(x => x.id !== id)); }

// ---------------- 渲染：日期条 ----------------
function renderDates() {
  const strip = $('#dateStrip');
  const html = [];
  for (let i = 0; i <= MAX_DAYS; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const key = ymd(d);
    html.push(`<button class="date-chip ${key === state.date ? 'active' : ''}" data-date="${key}">
      <span class="dow">${i === 0 ? '今天' : i === 1 ? '明天' : DOW[d.getDay()]}</span>
      <span class="day">${d.getDate()}</span>
      <span class="mon">${d.getMonth() + 1}月</span>
    </button>`);
  }
  strip.innerHTML = html.join('');
  $$('.date-chip', strip).forEach(el => {
    el.onclick = () => { state.date = el.dataset.date; state.sel = null; state.selWarned = false; renderDates(); renderTimeline(); renderDayList(); renderBorrowTab(); };
  });
}

// 把同一窗口里重叠的预约分配到不同“车道”，避免互相遮挡
function layoutBookings(list) {
  const sorted = [...list].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const out = new Map();
  let cluster = [], clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [], assigned = [];
    for (const b of cluster) {
      const s = toMin(b.start_time), e = toMin(b.end_time);
      let li = laneEnds.findIndex(x => x <= s);
      if (li < 0) { li = laneEnds.length; laneEnds.push(e); }
      else laneEnds[li] = e;
      assigned.push([b, li]);
    }
    const n = laneEnds.length;
    for (const [b, li] of assigned) out.set(b.id, { lane: li, lanes: n });
    cluster = []; clusterEnd = -1;
  };

  for (const b of sorted) {
    const s = toMin(b.start_time), e = toMin(b.end_time);
    if (cluster.length && s >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}

// ---------------- 通用确认框 ----------------
function askConfirm(title, html, okText) {
  return new Promise(resolve => {
    const modal = $('#modalConfirm');
    $('#confirmTitle').textContent = title;
    $('#confirmBody').innerHTML = html;
    $('#confirmYes').textContent = okText || '确认';
    modal.classList.remove('hidden');
    const done = (v) => {
      modal.classList.add('hidden');
      $('#confirmYes').onclick = null;
      $('#confirmNo').onclick = null;
      modal.onclick = null;
      resolve(v);
    };
    $('#confirmYes').onclick = () => done(true);
    $('#confirmNo').onclick = () => done(false);
    modal.onclick = (ev) => { if (ev.target.id === 'modalConfirm') done(false); };
  });
}

// 当前选中时段里的冲突（排练 + 设备）
function currentConflicts(sel) {
  const s = sel || state.sel;
  if (!s) return { bookings: [], borrows: [] };
  const day = state.date;
  const bookings = state.bookings.filter(b => b.booking_date === day &&
    toMin(b.start_time) < s.end && toMin(b.end_time) > s.start);
  const borrows = state.borrows.filter(b => b.borrow_date === day &&
    (b.status === 'pending' || b.status === 'approved') &&
    toMin(b.start_time) < s.end && toMin(b.end_time) > s.start);
  return { bookings, borrows };
}

// 选完时段后：有冲突就弹窗确认
async function warnIfConflict(prev) {
  if (!state.sel) { state.selWarned = false; return; }
  const { bookings, borrows } = currentConflicts();
  if (!bookings.length && !borrows.length) { state.selWarned = false; return; }

  const lines = [];
  if (bookings.length) {
    const names = bookings.map(b =>
      `${esc(b.band_name)}（${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}，${esc(b.leader_name)}）`).join('<br>');
    lines.push(`<p class="cf-line"><span class="badge danger">已被预约</span></p><p class="cf-list">${names}</p>`);
  }
  if (borrows.length) {
    const names = borrows.map(b =>
      `${esc(b.item_name)} × ${b.qty}（${String(b.start_time).slice(0, 5)}–${String(b.end_time).slice(0, 5)}，${esc(b.borrower_name)}${b.status === 'pending' ? '，待审批' : ''}）`).join('<br>');
    lines.push(`<p class="cf-line"><span class="badge warn">设备将被外借</span></p><p class="cf-list">${names}</p>`);
  }
  const html = lines.join('') + '<p class="cf-ask">仍要预约这个时间吗？</p>';

  const ok = await askConfirm('这个时段有冲突', html, '仍然预约');
  if (!ok) {
    state.sel = prev || null;
    state.selWarned = false;
    renderTimeline();
    return;
  }
  state.selWarned = true;
  renderTimeline();
}

// ---------------- 渲染：时间轴 ----------------
function renderTimeline() {
  const dayBookings = state.bookings.filter(b => b.booking_date === state.date);
  // 当天仍占用设备的借出记录（待审批 / 已批准；已拒绝、已归还不显示）
  const dayBorrows = state.borrows.filter(b =>
    b.borrow_date === state.date && (b.status === 'pending' || b.status === 'approved'));
  const badge = overlapPairs(dayBookings);
  const now = new Date();
  const isToday = state.date === ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const d = parseYmd(state.date);
  $('#dayTitle').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${DOW[d.getDay()]}`;

  const parts = WINDOWS.map((w, wi) => {
    const slots = (w.end - w.start) / SLOT;
    const height = slots * SLOT_PX;
    const lines = [];
    const labels = [];
    for (let m = w.start; m <= w.end; m += SLOT) {
      const top = (m - w.start) / SLOT * SLOT_PX;
      const isHour = m % 60 === 0;
      lines.push(`<div class="grid-line ${isHour ? 'half' : ''}" style="top:${top}px"></div>`);
      if (isHour) labels.push(`<div class="hour-label" style="top:${top}px">${hhmm(m)}</div>`);
    }
    const winList = dayBookings.filter(b => toMin(b.start_time) >= w.start && toMin(b.end_time) <= w.end);
    const lanes = layoutBookings(winList);

    // —— 设备外借：裁到本窗口内 ——
    const winBorrows = dayBorrows.map(b => {
      const s = Math.max(toMin(b.start_time), w.start);
      const e = Math.min(toMin(b.end_time), w.end);
      return e > s ? Object.assign({}, b, { _s: s, _e: e }) : null;
    }).filter(Boolean).sort((a, b) => a._s - b._s);

    // 某条借出是否和排练撞在同一时段
    const clashBorrow = new Set();
    const clashBooking = new Set();
    winBorrows.forEach(eb => {
      const hit = winList.some(bk => toMin(bk.start_time) < eb._e && toMin(bk.end_time) > eb._s);
      if (hit) clashBorrow.add(eb.id);
    });
    winList.forEach(bk => {
      const hit = winBorrows.some(eb => toMin(bk.start_time) < eb._e && toMin(bk.end_time) > eb._s);
      if (hit) clashBooking.add(bk.id);
    });

    const blocks = winList.map(b => {
      const lay = lanes.get(b.id) || { lane: 0, lanes: 1 };
      const top = (toMin(b.start_time) - w.start) / SLOT * SLOT_PX;
      const h = (toMin(b.end_time) - toMin(b.start_time)) / SLOT * SLOT_PX;
      const bad = badge.get(b.id);
      const eqClash = clashBooking.has(b.id);
      const wPct = 100 / lay.lanes;
      return `<div class="booking-block ${bad ? 'conflict' : ''} ${eqClash ? 'equip-clash' : ''}"
                 style="top:${top}px;height:${Math.max(h - 3, 18)}px;left:${lay.lane * wPct}%;width:calc(${wPct}% - 4px)"
                 title="${esc(b.band_name)} ${b.start_time}-${b.end_time}${eqClash ? ' · 设备被借走' : ''}">
          <div class="b-name">${esc(b.band_name)}${bad ? ' · 重叠' : ''}</div>
          <div class="b-meta">${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)} · ${esc(b.leader_name)}${b.needs_double_pedal ? ' · 双踩' : ''}${eqClash ? ' · 设备冲突' : ''}</div>
        </div>`;
    }).join('');

    // —— 横贯时间轴的设备色带（在排练块下方）——
    const equipBands = winBorrows.map(eb => {
      const top = (eb._s - w.start) / SLOT * SLOT_PX;
      const h = Math.max((eb._e - eb._s) / SLOT * SLOT_PX - 2, 6);
      const clash = clashBorrow.has(eb.id);
      return `<div class="equip-band ${clash ? 'clash' : ''}" style="top:${top}px;height:${h}px"></div>`;
    }).join('');

    // —— 右侧设备竖条 ——
    const equipBars = winBorrows.map(eb => {
      const top = (eb._s - w.start) / SLOT * SLOT_PX;
      const h = Math.max((eb._e - eb._s) / SLOT * SLOT_PX - 2, 6);
      const clash = clashBorrow.has(eb.id);
      const pend = eb.status === 'pending';
      const tip = `${eb.item_name} ×${eb.qty}  ${String(eb.start_time).slice(0, 5)}–${String(eb.end_time).slice(0, 5)}  ${eb.borrower_name}${pend ? '（待审批）' : ''}${clash ? ' · 与排练冲突' : ''}`;
      return `<div class="equip-bar ${clash ? 'clash' : ''} ${pend ? 'pending' : ''}"
                   style="top:${top}px;height:${h}px" title="${esc(tip)}"></div>`;
    }).join('');

    let sel = '';
    if (state.sel && state.sel.start >= w.start && state.sel.start < w.end) {
      const top = (state.sel.start - w.start) / SLOT * SLOT_PX;
      const h = (state.sel.end - state.sel.start) / SLOT * SLOT_PX;
      sel = `<div class="selection" style="top:${top}px;height:${Math.max(h - 3, 18)}px"></div>`;
    }

    const past = (isToday && nowMin > w.start)
      ? `<div class="past-mask" style="height:${Math.min((nowMin - w.start) / SLOT * SLOT_PX, height)}px"></div>`
      : '';

    const nowLine = (isToday && nowMin > w.start && nowMin < w.end)
      ? `<div class="now-line" style="top:${(nowMin - w.start) / SLOT * SLOT_PX}px"></div>`
      : '';

    const conflicts = winList.filter(b => badge.get(b.id)).length;

    return `<div class="window" data-win="${wi}">
      <div class="window-head"><span>${w.label}</span>
        <span class="head-badges">
          ${conflicts ? `<span class="badge danger">${conflicts} 队时段重叠</span>` : ''}
          ${clashBorrow.size ? `<span class="badge danger">设备冲突</span>`
            : (winBorrows.length ? `<span class="badge warn">设备借出 ${winBorrows.length}</span>` : '')}
          ${!conflicts && !winBorrows.length ? '<span class="badge mute">空闲</span>' : ''}
        </span>
      </div>
      <div class="track" data-win="${wi}" style="height:${height}px">
        ${lines.join('')}${labels.join('')}
        ${equipBands}
        <div class="blocks">${blocks}${sel}</div>
        <div class="equip-gutter" title="设备外借时段">${equipBars}</div>
        ${past}${nowLine}
      </div>
    </div>`;
  });

  $('#timeline').innerHTML = parts.join('');
  $$('#timeline .track').forEach(track => {
    track.onclick = ev => {
      const el = ev.currentTarget;               // 用实时元素，避免重绘后引用失效
      const wi = Number(el.dataset.win);
      const w = WINDOWS[wi];
      const rect = el.getBoundingClientRect();
      let m = w.start + Math.floor((ev.clientY - rect.top) / SLOT_PX) * SLOT;
      if (m >= w.end) m = w.end - SLOT;
      if (m < w.start) m = w.start;
      pickSlot(m, w);
    };
  });
  renderSelBox();
}

async function pickSlot(m, w) {
  const prev = state.sel ? { start: state.sel.start, end: state.sel.end } : null;
  // 今天已经过去的格子不给选
  const now = new Date();
  if (state.date === ymd(now)) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (m + SLOT <= nowMin) { toast('这个时段已经过去了', 'err'); return; }
  }
  const s = state.sel;
  // 换了另一个开放窗口 → 重新开始选
  if (s && (s.start < w.start || s.start >= w.end)) {
    state.sel = { start: m, end: Math.min(m + SLOT, w.end) };
    renderTimeline();
    await warnIfConflict(prev);
    return;
  }
  if (!s || m < s.start || m >= s.end) {
    if (!s || m < s.start) state.sel = { start: m, end: Math.min(m + SLOT, w.end) };
    else if (m === s.start) state.sel = null;
    else state.sel = { start: s.start, end: Math.min(m + SLOT, w.end) };
  } else {
    state.sel = null;
  }
  if (state.sel) {
    const cur = WINDOWS.find(x => state.sel.start >= x.start && state.sel.start < x.end);
    if (cur) state.sel.end = Math.min(state.sel.end, cur.end);
  }
  renderTimeline();
  await warnIfConflict(prev);
}

function renderSelBox() {
  const box = $('#selSummary');
  if (!state.sel) {
    box.className = 'sel-box empty';
    box.textContent = '还没有选择时段';
    return;
  }
  const dur = state.sel.end - state.sel.start;
  const d = parseYmd(state.date);
  box.className = 'sel-box';
  box.textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${DOW[d.getDay()]} · ${hhmm(state.sel.start)} – ${hhmm(state.sel.end)}（${dur} 分钟）`;
}

// ---------------- 渲染：当日安排 ----------------
function renderDayList() {
  const list = state.bookings.filter(b => b.booking_date === state.date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const borrows = state.borrows.filter(b => b.borrow_date === state.date &&
      (b.status === 'pending' || b.status === 'approved'))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  const badge = overlapPairs(list);
  const el = $('#dayList');
  if (!list.length && !borrows.length) {
    el.innerHTML = '<div class="empty">这一天还没有人预约，先到先得</div>';
    return;
  }
  const bookingHtml = list.map(b => {
    const bad = badge.get(b.id);
    const eqClash = borrows.some(eb => toMin(eb.start_time) < toMin(b.end_time) && toMin(eb.end_time) > toMin(b.start_time));
    return `<div class="item ${bad ? 'conflict' : ''} ${eqClash ? 'equip-clash' : ''}">
      <div class="time">${b.start_time.slice(0, 5)}<br><span style="font-size:10px;color:var(--dim)">${b.end_time.slice(0, 5)}</span></div>
      <div class="main">
        <div class="title">${esc(b.band_name)} ${bad ? `<span class="badge danger">重叠</span>` : ''} ${eqClash ? `<span class="badge danger">设备冲突</span>` : ''} ${b.needs_double_pedal ? '<span class="badge warn">双踩</span>' : ''}</div>
        <div class="sub">负责人 ${esc(b.leader_name)}${b.note ? ' · ' + esc(b.note) : ''}</div>
      </div>
    </div>`;
  }).join('');
  const borrowHtml = borrows.map(eb => `
    <div class="item equip-item">
      <div class="time">${String(eb.start_time).slice(0, 5)}<br><span style="font-size:10px;color:var(--dim)">${String(eb.end_time).slice(0, 5)}</span></div>
      <div class="main">
        <div class="title">${esc(eb.item_name)} × ${eb.qty}
          <span class="badge warn">设备外借</span>
          ${eb.status === 'pending' ? '<span class="badge mute">待审批</span>' : '<span class="badge ok">已批准</span>'}
        </div>
        <div class="sub">借用人 ${esc(eb.borrower_name)}${eb.note ? ' · ' + esc(eb.note) : ''}</div>
      </div>
    </div>`).join('');
  el.innerHTML = bookingHtml + borrowHtml;
}

// ---------------- 渲染：设备 ----------------
function renderBorrowTab() {
  const dateEl = $('#borrowDate');
  if (dateEl && !dateEl.value) dateEl.value = state.date;
  const day = (dateEl && dateEl.value) || state.date;
  $('#borrowDayLabel').textContent = `${day}`;

  const list = state.borrows.filter(b => b.borrow_date === day && b.status !== 'rejected');
  const used = {};
  list.forEach(b => {
    if (b.status === 'returned') return;
    used[b.item_name] = (used[b.item_name] || 0) + Number(b.qty || 0);
  });

  $('#equipGrid').innerHTML = state.equipment.map(e => {
    const u = used[e.name] || 0;
    const left = Math.max((e.total_qty || 0) - u, 0);
    return `<div class="equip">
      <div class="name">${esc(e.name)}</div>
      <div class="meta">共 ${e.total_qty}${e.note ? ' · ' + esc(e.note) : ''}</div>
      <div class="num">${left}<small> / ${e.total_qty} 可用</small></div>
    </div>`;
  }).join('') || '<div class="empty">还没有配置设备</div>';

  const sel = $('#equipSelect');
  const cur = sel.value;
  sel.innerHTML = state.equipment.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  if (cur) sel.value = cur;

  const rows = state.borrows.filter(b => b.borrow_date === day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  $('#borrowList').innerHTML = rows.length ? rows.map(b => `
    <div class="item">
      <div class="time">${b.start_time.slice(0, 5)}<br><span style="font-size:10px;color:var(--dim)">${b.end_time.slice(0, 5)}</span></div>
      <div class="main">
        <div class="title">${esc(b.item_name)} × ${b.qty} ${statusBadge(b.status)}</div>
        <div class="sub">${esc(b.borrower_name)}${b.note ? ' · ' + esc(b.note) : ''}</div>
      </div>
    </div>`).join('') : '<div class="empty">这一天还没有外借记录</div>';
}

// ---------------- 渲染：我的 ----------------
function renderMine() {
  const mine = mineAll();
  const el = $('#mineList');
  if (!mine.length) { el.innerHTML = '<div class="empty">还没有登记记录</div>'; return; }
  el.innerHTML = mine.map(m => {
    let alive = false, live = null;
    if (m.kind === 'booking') { live = state.bookings.find(b => b.id === m.id); alive = !!live; }
    else { live = state.borrows.find(b => b.id === m.id); alive = !!live; }
    return `<div class="item">
      <div class="time">${m.dateLabel}<br><span style="font-size:10px;color:var(--dim)">${m.timeLabel}</span></div>
      <div class="main">
        <div class="title">${esc(m.title)} ${alive ? '<span class="badge ok">有效</span>' : '<span class="badge mute">已取消/已过期</span>'}</div>
        <div class="sub">${m.kind === 'booking' ? '排练预约' : '设备外借'} · 提交于 ${m.at}</div>
      </div>
      <div class="actions">
        <button class="btn danger small" data-cancel="${m.id}" data-kind="${m.kind}" ${alive ? '' : 'disabled'}>取消</button>
      </div>
    </div>`;
  }).join('');
  $$('#mineList [data-cancel]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.cancel, kind = btn.dataset.kind;
      const m = mineAll().find(x => x.id === id);
      if (!m) return;
      btn.disabled = true;
      try {
        if (kind === 'booking') await api.cancelBooking(id, m.token);
        else await api.cancelBorrow(id, m.token);
        mineRemove(id);
        toast('已取消', 'ok');
        await refreshAll();
      } catch (e) {
        toast('取消失败：' + e.message, 'err');
        btn.disabled = false;
      }
    };
  });
}

// ---------------- 提交：预约 ----------------
$('#bookingForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!state.sel) { toast('先在时间轴上选一个时段', 'err'); return; }
  const f = ev.target;
  const data = Object.fromEntries(new FormData(f).entries());
  const btn = $('#btnSubmitBooking');
  btn.disabled = true; btn.textContent = '提交中…';
  try {
    const payload = {
      band_name: data.band_name.trim(),
      leader_name: data.leader_name.trim(),
      contact_type: data.contact_type,
      contact: data.contact.trim(),
      booking_date: state.date,
      start_time: hhmm(state.sel.start),
      end_time: hhmm(state.sel.end),
      needs_double_pedal: !!data.needs_double_pedal,
      note: (data.note || '').trim(),
      cancel_token: tok(),
    };
    if (!payload.band_name || !payload.leader_name || !payload.contact) throw new Error('乐队名 / 负责人 / 联系方式都要填');
    checkContact(payload.contact);

    // 冲突：选时段时已确认过就不再重复问；若期间数据变了，这里再拦一次
    if (!state.selWarned) {
      const { bookings, borrows } = currentConflicts();
      if (bookings.length || borrows.length) {
        const ok = await askConfirm('这个时段有冲突',
          `该时段已有 ${bookings.length} 条排练、${borrows.length} 条设备外借，仍要提交吗？`, '仍然提交');
        if (!ok) { btn.disabled = false; btn.textContent = '提交预约'; return; }
      }
    }

    const id = await api.createBooking(payload);
    mineAdd({
      kind: 'booking', id, token: payload.cancel_token,
      title: payload.band_name, dateLabel: `${payload.booking_date}`,
      timeLabel: `${payload.start_time}–${payload.end_time}`,
      at: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
    f.reset();
    state.sel = null;
    state.selWarned = false;
    toast('预约已登记', 'ok');
    await refreshAll();
  } catch (e) {
    toast('提交失败：' + friendlyError(e.message), 'err');
  } finally {
    btn.disabled = false; btn.textContent = '提交预约';
  }
});

// ---------------- 提交：外借 ----------------
$('#borrowForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  const data = Object.fromEntries(new FormData(f).entries());
  try {
    const eq = state.equipment.find(e => e.id === data.equipment_id);
    if (!eq) throw new Error('先选一个设备');
    if (toMin(data.end_time) <= toMin(data.start_time)) throw new Error('归还时间要晚于开始时间');
    const token = tok();
    const payload = {
      equipment_id: eq.id, item_name: eq.name, qty: Number(data.qty) || 1,
      borrower_name: data.borrower_name.trim(), contact_type: data.contact_type,
      contact: data.contact.trim(), borrow_date: data.borrow_date,
      start_time: data.start_time, end_time: data.end_time,
      note: (data.note || '').trim(), cancel_token: token,
    };
    if (!payload.borrower_name || !payload.contact) throw new Error('借用人和联系方式都要填');
    checkContact(payload.contact);
    const id = await api.createBorrow(payload);
    mineAdd({
      kind: 'borrow', id, token,
      title: `${payload.item_name} × ${payload.qty}`,
      dateLabel: payload.borrow_date, timeLabel: `${payload.start_time}–${payload.end_time}`,
      at: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
    f.reset();
    if (state.equipment[0]) $('#equipSelect').value = state.equipment[0].id;
    toast('已提交，等管理员审批', 'ok');
    await refreshAll();
  } catch (e) {
    toast('提交失败：' + friendlyError(e.message), 'err');
  }
});

$('#borrowDate').addEventListener('change', renderBorrowTab);

// ---------------- 管理员 ----------------
function updateAdminUI() {
  const logged = !!state.session;
  $('#adminBadge').classList.toggle('hidden', !logged);
  $('#tabAdmin').classList.toggle('hidden', !logged);
  $('#btnAdmin').textContent = logged ? '退出' : '管理员登录';
  if (!logged && state.view === 'admin') switchView('booking');
}

$('#btnAdmin').onclick = async () => {
  if (state.session) {
    await api.signOut();
    state.session = null; state.adminBookings = []; state.adminBorrows = [];
    updateAdminUI(); toast('已退出'); return;
  }
  $('#loginHint').textContent = api.mode === 'demo' ? '演示模式：admin / admin123' : '';
  $('#modalLogin').classList.remove('hidden');
  $('#loginEmail').focus();
};
$$('#modalLogin [data-close]').forEach(b => b.onclick = () => $('#modalLogin').classList.add('hidden'));
$('#modalLogin').onclick = ev => { if (ev.target.id === 'modalLogin') ev.target.classList.add('hidden'); };

$('#btnDoLogin').onclick = async () => {
  const email = $('#loginEmail').value.trim();
  const pw = $('#loginPassword').value;
  if (!email || !pw) { toast('填邮箱和密码', 'err'); return; }
  try {
    const s = await api.signIn(email, pw);
    state.session = s;
    $('#modalLogin').classList.add('hidden');
    $('#loginPassword').value = '';
    updateAdminUI();
    await refreshAdmin();
    switchView('admin');
    toast('登录成功', 'ok');
  } catch (e) {
    toast('登录失败：' + e.message, 'err');
  }
};

async function refreshAdmin() {
  if (!state.session) return;
  try {
    state.adminBookings = await api.adminBookings();
    state.adminBorrows = await api.adminBorrows();
    renderAdmin();
  } catch (e) { toast('读取失败：' + e.message, 'err'); }
}

function renderAdmin() {
  const pending = state.adminBorrows.filter(b => b.status === 'pending');
  $('#pendingList').innerHTML = pending.length ? pending.map(b => `
    <div class="item">
      <div class="time">${b.borrow_date}<br><span style="font-size:10px;color:var(--dim)">${String(b.start_time).slice(0,5)}–${String(b.end_time).slice(0,5)}</span></div>
      <div class="main">
        <div class="title">${esc(b.item_name)} × ${b.qty}</div>
        <div class="sub">${esc(b.borrower_name)} · ${contactLabel(b.contact_type)}：${esc(b.contact)}${b.note ? ' · ' + esc(b.note) : ''}</div>
      </div>
      <div class="actions">
        <button class="btn primary small" data-approve="${b.id}">通过</button>
        <button class="btn danger small" data-reject="${b.id}">拒绝</button>
      </div>
    </div>`).join('') : '<div class="empty">没有待审批的申请</div>';

  $$('#pendingList [data-approve]').forEach(x => x.onclick = () => setStatus(x.dataset.approve, 'approved'));
  $$('#pendingList [data-reject]').forEach(x => x.onclick = () => setStatus(x.dataset.reject, 'rejected'));

  const tb = $('#adminTable tbody');
  tb.innerHTML = state.adminBookings.map(b => `
    <tr>
      <td>${b.booking_date}</td>
      <td>${String(b.start_time).slice(0, 5)}–${String(b.end_time).slice(0, 5)}</td>
      <td>${esc(b.band_name)}</td>
      <td>${esc(b.leader_name)}</td>
      <td>${contactLabel(b.contact_type)}：${esc(b.contact)}</td>
      <td>${b.needs_double_pedal ? '<span class="badge warn">双踩</span>' : '—'}</td>
      <td><button class="btn danger small" data-del="${b.id}">删除</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">暂无预约</td></tr>';

  $$('#adminTable [data-del]').forEach(x => x.onclick = async () => {
    if (!confirm('删除这条预约？')) return;
    try { await api.deleteBooking(x.dataset.del); toast('已删除', 'ok'); await refreshAll(); await refreshAdmin(); }
    catch (e) { toast('删除失败：' + friendlyError(e.message), 'err'); }
  });

  // —— 全部外借（含已批准的，可撤销）——
  const allB = state.adminBorrows.slice()
    .sort((a, b) => (a.borrow_date + String(a.start_time)).localeCompare(b.borrow_date + String(b.start_time)));
  const pendingN = allB.filter(b => b.status === 'pending').length;
  $('#adminBorrowHint').textContent = `${allB.length} 条${pendingN ? ` · ${pendingN} 条待审批` : ''}`;
  $('#adminBorrowTable tbody').innerHTML = allB.map(b => {
    const acts = [];
    if (b.status === 'pending') {
      acts.push(`<button class="btn primary small" data-app2="${b.id}">通过</button>`);
      acts.push(`<button class="btn danger small" data-rej2="${b.id}">拒绝</button>`);
    } else if (b.status === 'approved') {
      acts.push(`<button class="btn ghost small" data-ret2="${b.id}">标记归还</button>`);
    }
    acts.push(`<button class="btn danger small" data-delb="${b.id}">撤销</button>`);
    return `<tr>
      <td>${b.borrow_date}</td>
      <td>${String(b.start_time).slice(0, 5)}–${String(b.end_time).slice(0, 5)}</td>
      <td>${esc(b.item_name)}</td>
      <td>${b.qty}</td>
      <td>${esc(b.borrower_name)}</td>
      <td>${contactLabel(b.contact_type)}：${esc(b.contact)}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${acts.join(' ')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">暂无外借记录</td></tr>';

  $$('#adminBorrowTable [data-app2]').forEach(x => x.onclick = () => setStatus(x.dataset.app2, 'approved'));
  $$('#adminBorrowTable [data-rej2]').forEach(x => x.onclick = () => setStatus(x.dataset.rej2, 'rejected'));
  $$('#adminBorrowTable [data-ret2]').forEach(x => x.onclick = () => setStatus(x.dataset.ret2, 'returned'));
  $$('#adminBorrowTable [data-delb]').forEach(x => x.onclick = async () => {
    if (!confirm('撤销这条外借记录？撤销后设备会重新变为可用。')) return;
    const id = x.dataset.delb;
    const before = state.adminBorrows;
    // 乐观更新：先从列表里拿掉，界面立刻响应
    state.adminBorrows = before.filter(b => b.id !== id);
    renderAdmin();
    try {
      await api.deleteBorrow(id);
      toast('已撤销', 'ok');
      refreshAll().catch(() => {});
      refreshAdmin().catch(() => {});
    } catch (e) {
      state.adminBorrows = before;
      renderAdmin();
      toast('撤销失败：' + friendlyError(e.message), 'err');
    }
  });

  $('#adminEquipList').innerHTML = state.equipment.map(e => `
    <div class="item">
      <div class="main"><div class="title">${esc(e.name)}</div><div class="sub">总数 ${e.total_qty}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <div class="actions"><button class="btn danger small" data-deleq="${e.id}">删除</button></div>
    </div>`).join('') || '<div class="empty">还没有设备</div>';

  $$('#adminEquipList [data-deleq]').forEach(x => x.onclick = async () => {
    if (!confirm('删除这个设备？')) return;
    try { await api.deleteEquipment(x.dataset.deleq); await refreshAll(); await refreshAdmin(); toast('已删除', 'ok'); }
    catch (e) { toast('删除失败：' + e.message, 'err'); }
  });
}

async function setStatus(id, status) {
  const b = state.adminBorrows.find(x => x.id === id);
  const old = b ? b.status : null;
  if (b) { b.status = status; renderAdmin(); }   // 乐观更新
  try {
    await api.setBorrowStatus(id, status);
    toast('已更新', 'ok');
    refreshAll().catch(() => {});
    refreshAdmin().catch(() => {});
  } catch (e) {
    if (b) { b.status = old; renderAdmin(); }
    toast('更新失败：' + friendlyError(e.message), 'err');
  }
}

$('#equipForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(ev.target).entries());
  if (!data.name.trim()) return;
  try {
    await api.addEquipment(data.name.trim(), data.total_qty);
    ev.target.reset();
    await refreshAll(); await refreshAdmin();
    toast('已添加', 'ok');
  } catch (e) { toast('添加失败：' + e.message, 'err'); }
});

// ---------------- 视图切换 ----------------
function switchView(v) {
  state.view = v;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  ['booking', 'borrow', 'mine', 'admin'].forEach(name => {
    const el = $('#view-' + name);
    if (el) el.classList.toggle('hidden', name !== v);
  });
  if (v === 'mine') renderMine();
  if (v === 'admin' && state.session) refreshAdmin();
}
$$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));

// ---------------- 数据刷新 ----------------
async function refreshAll() {
  const from = ymd(today);
  const to = (() => { const d = new Date(today); d.setDate(d.getDate() + MAX_DAYS); return ymd(d); })();
  try {
    const [bookings, equipment, borrows] = await Promise.all([
      api.listBookings(from, to),
      api.listEquipment(),
      api.listBorrows(from, to),
    ]);
    state.bookings = bookings;
    state.equipment = equipment;
    state.borrows = borrows;
    renderTimeline();
    renderDayList();
    renderBorrowTab();
    renderMine();
  } catch (e) {
    toast('读取数据失败：' + e.message, 'err');
  }
}

// ---------------- 初始化 ----------------
(async function init() {
  $('#clubTitle').textContent = `${CFG.CLUB_NAME || '音乐社'} · ${CFG.ROOM_NAME || '排练室'}预约`;
  $('#footMeta').textContent = api.mode === 'demo'
    ? '演示模式 · 数据保存在本机浏览器'
    : '数据由 Supabase 提供';

  if (api.mode === 'demo') $('#setupBanner').classList.remove('hidden');

  renderDates();
  try {
    state.session = await api.getSession();
  } catch (e) { state.session = null; }
  updateAdminUI();
  await refreshAll();
  if (state.session) refreshAdmin();

  // 每 60 秒自动刷新，几个人同时登记也能看到最新的
  setInterval(refreshAll, 60000);
  $('#btnRefresh').onclick = async () => { await refreshAll(); toast('已刷新'); };
  $('#btnRefreshAdmin').onclick = refreshAdmin;
})();

})();
