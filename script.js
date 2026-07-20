/* ==========================================================================
   AURELA — planner online
   O estado do usuário é sincronizado com o back-end (Node/Express + MongoDB)
   através da API definida em api.js. Um cache local (localStorage) é usado
   apenas para acelerar o carregamento inicial e funcionar offline por curtos
   períodos — a fonte da verdade é sempre o banco de dados.
   ========================================================================== */

/* ---------------------------- UTILITÁRIOS ------------------------------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => toISO(new Date());
const currency = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_FULL = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const MOTIVATIONAL_QUOTES = [
  'Pequenos passos, todos os dias, constroem grandes conquistas.',
  'Você está exatamente onde precisa estar para crescer.',
  'Organização é um ato de amor-próprio.',
  'Respire fundo. Um item de cada vez.',
  'Seu ritmo é válido. Continue.',
  'Hoje é uma boa chance de recomeçar com leveza.',
  'Progresso, não perfeição.',
  'Cuide de você como cuida de quem você ama.',
  'Cada tarefa concluída é uma vitória silenciosa.',
  'Confie no processo — você está mais perto do que imagina.',
  'A calma também é produtividade.',
  'Menos pressa, mais presença.',
];

/* ---------------------------- ESTADO PADRÃO ------------------------------ */
function defaultState() {
  return {
    profile: { name: '', avatar: '' },
    theme: 'light',
    accent: 'rose',
    customBg: '',
    tasks: [], // {id,date,title,time,priority,period,done}
    habitCategories: [],
    habits: [],
    shoppingCategories: [],
    shoppingItems: [],
    goals: [],
    exams: [],
    finances: [],
    notes: [],
    quoteIndex: null,
    quoteDate: null,
  };
}

let state = defaultState();
let currentUser = null;
let syncTimer = null;

/* ---------------------------- SINCRONIZAÇÃO COM A API --------------------- */
const LOCAL_CACHE_KEY = 'aurela-state-cache-v1';
const SYNCED_COLLECTIONS = ['tasks', 'habitCategories', 'habits', 'shoppingCategories', 'shoppingItems', 'goals', 'exams', 'finances', 'notes'];

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveLocalCache() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state));
  } catch (e) { /* armazenamento indisponível — segue sem cache */ }
}

// Busca o estado completo do usuário logado no back-end.
async function fetchRemoteState() {
  const remote = await Api.getState();
  state = Object.assign(defaultState(), remote, {
    profile: { name: remote.profile?.name || '', avatar: remote.profile?.avatar || '' },
  });
  saveLocalCache();
}

// Envia as alterações para o back-end (com debounce para não sobrecarregar a API).
function saveState() {
  saveLocalCache();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToServer, 600);
}

async function syncToServer() {
  if (!Auth.getToken()) return;
  try {
    const collectionSyncs = SYNCED_COLLECTIONS.map(async (key) => {
      const { items } = await Api.syncCollection(key, state[key] || []);
      state[key] = items;
    });
    await Promise.all(collectionSyncs);
  await Api.syncSettings({ theme: state.theme, accent: state.accent, customBg: state.customBg, profile: state.profile });
    saveLocalCache();
  } catch (e) {
    console.error('Falha ao sincronizar com o servidor:', e.message);
    toast('Não foi possível salvar agora. Verifique sua conexão.', '⚠');
  }
}

/* ---------------------------- TOASTS ------------------------------------ */
function toast(msg, icon = '✓') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 280);
  }, 2600);
}

/* ---------------------------- PÉTALAS (confete) -------------------------- */
function petalBurst() {
  const layer = $('#petal-layer');
  const emojis = ['🌸', '🌷', '💮', '🌺'];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    p.style.left = Math.random() * 100 + 'vw';
    p.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    p.style.animationDuration = (2.6 + Math.random() * 1.8) + 's';
    p.style.fontSize = (14 + Math.random() * 14) + 'px';
    layer.appendChild(p);
    setTimeout(() => p.remove(), 4600);
  }
}

/* ---------------------------- MODAL GENÉRICO ----------------------------- */
function openModal(html) {
  const backdrop = $('#modal-backdrop');
  const box = $('#modal-box');
  box.innerHTML = html;
  backdrop.classList.add('open');
  const firstInput = box.querySelector('input,textarea,select');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
}
function closeModal() {
  $('#modal-backdrop').classList.remove('open');
  $('#modal-box').innerHTML = '';
}
$('#modal-backdrop').addEventListener('click', e => { if (e.target.id === 'modal-backdrop') closeModal(); });

/* ============================================================================
   NAVEGAÇÃO
   ========================================================================== */
let currentPage = 'dashboard';
function navigateTo(page) {
  currentPage = page;
  $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === page));
  closeMobileSidebar();
  renderPage(page);
}
$$('[data-nav]').forEach(el => el.addEventListener('click', () => navigateTo(el.dataset.nav)));

function renderPage(page) {
  if (page === 'dashboard') renderDashboard();
  else if (page === 'daily') renderDaily();
  else if (page === 'weekly') renderWeekly();
  else if (page === 'monthly') renderMonthly();
  else if (page === 'habits') renderHabits();
  else if (page === 'shopping') renderShopping();
  else if (page === 'goals') renderGoals();
  else if (page === 'studies') renderStudies();
  else if (page === 'finances') renderFinances();
  else if (page === 'notes') renderNotes();
  else if (page === 'settings') renderSettings();
}

/* mobile sidebar */
function closeMobileSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.remove('open');
}
$('#mobile-menu-btn').addEventListener('click', () => {
  $('#sidebar').classList.add('open');
  $('#sidebar-overlay').classList.add('open');
});
$('#sidebar-overlay').addEventListener('click', closeMobileSidebar);

/* ============================================================================
   TEMA & PERSONALIZAÇÃO
   ========================================================================== */
function applyTheme() {
  document.body.dataset.theme = state.theme;
  document.body.dataset.accent = state.accent;
  if (state.customBg) document.body.style.setProperty('--bg', state.customBg);
  else document.body.style.removeProperty('--bg');
  $('#theme-icon').textContent = state.theme === 'dark' ? '☀' : '🌙';
  $('#theme-label').textContent = state.theme === 'dark' ? 'Modo claro' : 'Modo escuro';
  $('#mobile-theme-btn').textContent = state.theme === 'dark' ? '☀' : '🌙';
}
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  saveState(); applyTheme();
}
$('#theme-toggle').addEventListener('click', toggleTheme);
$('#mobile-theme-btn').addEventListener('click', toggleTheme);

$('#custom-bg-input').addEventListener('input', e => {
  state.customBg = e.target.value;
  saveState();
  applyTheme();
});
$('#custom-bg-reset').addEventListener('click', () => {
  state.customBg = '';
  saveState();
  applyTheme();
  $('#custom-bg-input').value = '#FFF9FB';
});

function applyProfile() {
  $('#sidebar-username').textContent = state.profile.name || 'Minha conta';
  const avatarSrc = state.profile.avatar || makeAvatarPlaceholder();
  $('#sidebar-avatar').src = avatarSrc;
}
function makeAvatarPlaceholder() {
  const initial = (state.profile.name || '✿')[0].toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' rx='50' fill='#F8DCE6'/><text x='50' y='63' font-size='42' text-anchor='middle' font-family='Outfit,sans-serif' fill='#B96A85'>${initial}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

/* ============================================================================
   DASHBOARD
   ========================================================================== */
let dashCalCursor = new Date();

function renderDashboard() {
  const now = new Date();
  $('#hero-date').textContent = `${WEEKDAYS_FULL[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}`;
  const hour = now.getHours();
  const greetWord = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = state.profile.name ? `, ${state.profile.name}` : '';
  $('#hero-greeting').textContent = `${greetWord}${name} ✿`;

  // frase motivacional fixa por dia
  if (state.quoteDate !== todayISO()) {
    state.quoteIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    state.quoteDate = todayISO();
    saveState();
  }
  $('#hero-quote').textContent = `“${MOTIVATIONAL_QUOTES[state.quoteIndex]}”`;

  updateClock();

  const todayTasks = state.tasks.filter(t => t.date === todayISO());
  const doneTasks = todayTasks.filter(t => t.done).length;
  $('#stat-tasks').textContent = `${doneTasks}/${todayTasks.length}`;
  $('#ring-tasks').style.setProperty('--pct', todayTasks.length ? Math.round(doneTasks / todayTasks.length * 100) : 0);

  const doneHabits = state.habits.filter(h => h.history[todayISO()]).length;
  $('#stat-habits').textContent = `${doneHabits}/${state.habits.length}`;
  $('#ring-habits').style.setProperty('--pct', state.habits.length ? Math.round(doneHabits / state.habits.length * 100) : 0);

  $('#stat-shopping').textContent = state.shoppingItems.filter(i => !i.bought).length;
  $('#stat-goals').textContent = state.goals.filter(g => goalProgress(g) >= 100).length;

  // resumo do dia
  const list = $('#dash-today-list');
  if (!todayTasks.length) {
    list.innerHTML = '<div class="empty-hint">Nenhuma tarefa para hoje. Que tal aproveitar para descansar? ✿</div>';
  } else {
    list.innerHTML = todayTasks
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
      .map(t => `<div class="simple-item"><span class="dot" style="background:${t.done ? 'var(--success-strong)' : 'var(--accent-strong)'}"></span>
        <span style="flex:1;${t.done ? 'text-decoration:line-through;opacity:.5' : ''}">${escapeHTML(t.title)}</span>
        ${t.time ? `<span class="task-time">${t.time}</span>` : ''}</div>`).join('');
  }

  renderMiniCalendar();
}

function updateClock() {
  const now = new Date();
  $('#hero-clock').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
setInterval(() => { if (currentPage === 'dashboard') updateClock(); }, 1000 * 20);

function renderMiniCalendar() {
  const year = dashCalCursor.getFullYear(), month = dashCalCursor.getMonth();
  $('#mini-cal-title').textContent = `${MONTHS[month]} de ${year}`;
  const grid = $('#mini-calendar');
  grid.innerHTML = WEEKDAYS_SHORT.map(d => `<span class="mini-cal-dow">${d}</span>`).join('');
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = todayISO();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, other: true, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    cells.push({ day: d, other: false, dateStr });
  }
  while (cells.length % 7 !== 0) cells.push({ day: cells.length, other: true, dateStr: null });

  grid.innerHTML += cells.map(c => {
    if (c.other) return `<div class="mini-cal-day other-month">${c.day}</div>`;
    const hasTask = state.tasks.some(t => t.date === c.dateStr);
    const isToday = c.dateStr === todayStr;
    return `<div class="mini-cal-day${isToday ? ' today' : ''}${hasTask ? ' has-task' : ''}" data-date="${c.dateStr}">${c.day}</div>`;
  }).join('');

  $$('.mini-cal-day[data-date]', grid).forEach(el => el.addEventListener('click', () => {
    $('#daily-date-picker').value = el.dataset.date;
    navigateTo('daily');
  }));
}
$('#mini-cal-prev').addEventListener('click', () => { dashCalCursor.setMonth(dashCalCursor.getMonth() - 1); renderMiniCalendar(); });
$('#mini-cal-next').addEventListener('click', () => { dashCalCursor.setMonth(dashCalCursor.getMonth() + 1); renderMiniCalendar(); });

function escapeHTML(str) {
  const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML;
}

/* ============================================================================
   PLANNER DIÁRIO
   ========================================================================== */
function renderDaily() {
  const picker = $('#daily-date-picker');
  if (!picker.value) picker.value = todayISO();
  const date = picker.value;
  const d = parseISO(date);
  $('#daily-date-label').textContent = `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;

  const dayTasks = state.tasks.filter(t => t.date === date);
  ['manha', 'tarde', 'noite'].forEach(period => {
    const container = $(`#list-${period}`);
    const items = dayTasks.filter(t => t.period === period).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    container.innerHTML = items.map(renderTaskCard).join('') || '<div class="empty-hint">Sem tarefas</div>';
    bindTaskCardEvents(container);
    setupDropZone(container, period);
  });

  const total = dayTasks.length;
  const done = dayTasks.filter(t => t.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  $('#daily-progress-fill').style.width = pct + '%';
  $('#daily-progress-label').textContent = `${pct}% concluído (${done}/${total})`;
}
$('#daily-date-picker').addEventListener('change', renderDaily);
$('#daily-add-btn').addEventListener('click', () => openTaskModal({ date: $('#daily-date-picker').value }));

function renderTaskCard(t) {
  return `<div class="task-card${t.done ? ' done' : ''}" draggable="true" data-id="${t.id}">
    <div class="task-actions">
      <button data-action="edit" title="Editar">✎</button>
      <button data-action="duplicate" title="Duplicar">⧉</button>
      <button data-action="delete" title="Excluir">✕</button>
    </div>
    <div class="task-top">
      <button class="task-check${t.done ? ' checked' : ''}" data-action="toggle">${t.done ? '✓' : ''}</button>
      <span class="task-title">${escapeHTML(t.title)}</span>
    </div>
    <div class="task-meta">
      ${t.time ? `<span class="task-time">🕐 ${t.time}</span>` : ''}
      <span class="priority-pill priority-${t.priority}">${t.priority}</span>
    </div>
  </div>`;
}

function bindTaskCardEvents(container) {
  $$('.task-card', container).forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    $('[data-action="toggle"]', card).addEventListener('click', () => toggleTask(id));
    const editBtn = card.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', () => openTaskModal({}, id));
    const dupBtn = card.querySelector('[data-action="duplicate"]');
    if (dupBtn) dupBtn.addEventListener('click', () => duplicateTask(id));
    const delBtn = card.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', () => { deleteTask(id); });
  });
}

function toggleTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  saveState();
  renderPage(currentPage);
  if (t.done) toast('Tarefa concluída ✿');
}
function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState(); renderPage(currentPage);
  toast('Tarefa excluída', '🗑');
}
function duplicateTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  state.tasks.push({ ...t, id: uid(), done: false });
  saveState(); renderPage(currentPage);
  toast('Tarefa duplicada ⧉');
}

function openTaskModal(defaults = {}, editId = null) {
  const editing = editId ? state.tasks.find(t => t.id === editId) : null;
  const data = editing || { date: defaults.date || todayISO(), period: defaults.period || 'manha', priority: 'media', time: '', title: '' };
  openModal(`
    <h2>${editing ? 'Editar tarefa' : 'Nova tarefa'}</h2>
    <div class="form-row"><label>Título</label><input class="input" id="tm-title" placeholder="Ex: Estudar para prova" value="${escapeHTML(data.title)}"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Data</label><input type="date" class="input" id="tm-date" value="${data.date}"></div>
      <div class="form-row"><label>Horário</label><input type="time" class="input" id="tm-time" value="${data.time || ''}"></div>
    </div>
    <div class="form-row"><label>Período</label>
      <div class="chip-select" id="tm-period">
        ${['manha', 'tarde', 'noite'].map(p => `<div class="chip-option${data.period === p ? ' selected' : ''}" data-val="${p}">${p === 'manha' ? '☀ Manhã' : p === 'tarde' ? '◐ Tarde' : '☾ Noite'}</div>`).join('')}
      </div>
    </div>
    <div class="form-row"><label>Prioridade</label>
      <div class="chip-select" id="tm-priority">
        ${['alta', 'media', 'baixa'].map(p => `<div class="chip-option${data.priority === p ? ' selected' : ''}" data-val="${p}">${p}</div>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      ${editing ? '<button class="btn-danger-text" id="tm-delete">Excluir</button>' : ''}
      <button class="btn btn-ghost" id="tm-cancel">Cancelar</button>
      <button class="btn btn-primary" id="tm-save">Salvar</button>
    </div>
  `);
  let selPeriod = data.period, selPriority = data.priority;
  $$('#tm-period .chip-option').forEach(c => c.addEventListener('click', () => { $$('#tm-period .chip-option').forEach(x => x.classList.remove('selected')); c.classList.add('selected'); selPeriod = c.dataset.val; }));
  $$('#tm-priority .chip-option').forEach(c => c.addEventListener('click', () => { $$('#tm-priority .chip-option').forEach(x => x.classList.remove('selected')); c.classList.add('selected'); selPriority = c.dataset.val; }));
  $('#tm-cancel').addEventListener('click', closeModal);
  if (editing) $('#tm-delete').addEventListener('click', () => { deleteTask(editId); closeModal(); });
  $('#tm-save').addEventListener('click', () => {
    const title = $('#tm-title').value.trim();
    if (!title) { toast('Dê um título para a tarefa', '⚠'); return; }
    const payload = {
      title, date: $('#tm-date').value || todayISO(), time: $('#tm-time').value, period: selPeriod, priority: selPriority,
    };
    if (editing) Object.assign(editing, payload);
    else state.tasks.push({ id: uid(), done: false, ...payload });
    saveState(); closeModal(); renderPage(currentPage);
    toast(editing ? 'Tarefa atualizada' : 'Tarefa adicionada ✿');
  });
}

/* drag & drop entre períodos/dias */
function setupDropZone(container, period, dateOverride) {
  container.addEventListener('dragover', e => { e.preventDefault(); container.classList.add('drop-zone-active'); });
  container.addEventListener('dragleave', () => container.classList.remove('drop-zone-active'));
  container.addEventListener('drop', e => {
    e.preventDefault();
    container.classList.remove('drop-zone-active');
    const dragging = $('.dragging');
    if (!dragging) return;
    const id = dragging.dataset.id;
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    if (period) t.period = period;
    if (dateOverride) t.date = dateOverride;
    saveState(); renderPage(currentPage);
  });
}

/* ============================================================================
   PLANNER SEMANAL
   ========================================================================== */
let weekCursor = startOfWeek(new Date());
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0, 0, 0, 0); return r; }

function renderWeekly() {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekCursor); d.setDate(d.getDate() + i); return d; });
  $('#weekly-range-label').textContent = `${days[0].getDate()} ${MONTHS[days[0].getMonth()].slice(0,3)} — ${days[6].getDate()} ${MONTHS[days[6].getMonth()].slice(0,3)} de ${days[6].getFullYear()}`;

  const grid = $('#week-grid');
  grid.innerHTML = days.map(d => {
    const iso = toISO(d);
    const isToday = iso === todayISO();
    return `<div class="week-day-col${isToday ? ' is-today' : ''}" data-date="${iso}">
      <div class="week-day-head"><div class="week-day-name">${WEEKDAYS_SHORT[d.getDay()]}</div><div class="week-day-num">${d.getDate()}</div></div>
      <div class="week-task-list" id="week-list-${iso}"></div>
      <button class="week-add-btn" data-date="${iso}">+ adicionar</button>
    </div>`;
  }).join('');

  days.forEach(d => {
    const iso = toISO(d);
    const list = $(`#week-list-${iso}`);
    const items = state.tasks.filter(t => t.date === iso).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    list.innerHTML = items.map(t => `<div class="week-task-card${t.done ? ' done' : ''}" draggable="true" data-id="${t.id}" title="Clique para marcar, clique direito para editar">
      ${t.time ? `<b>${t.time}</b> ` : ''}${escapeHTML(t.title)}</div>`).join('');
    $$('.week-task-card', list).forEach(card => {
      card.addEventListener('dragstart', () => card.classList.add('dragging'));
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', () => toggleTask(card.dataset.id));
      card.addEventListener('dblclick', () => openTaskModal({}, card.dataset.id));
    });
    setupDropZone(list, null, iso);
  });

  $$('.week-add-btn', grid).forEach(btn => btn.addEventListener('click', () => openTaskModal({ date: btn.dataset.date, period: 'tarde' })));
}
$('#weekly-prev').addEventListener('click', () => { weekCursor.setDate(weekCursor.getDate() - 7); renderWeekly(); });
$('#weekly-next').addEventListener('click', () => { weekCursor.setDate(weekCursor.getDate() + 7); renderWeekly(); });
$('#weekly-today').addEventListener('click', () => { weekCursor = startOfWeek(new Date()); renderWeekly(); });

/* ============================================================================
   PLANNER MENSAL
   ========================================================================== */
let monthCursor = new Date();

function renderMonthly() {
  const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
  $('#monthly-label').textContent = `${MONTHS[month]} de ${year}`;
  $('#month-weekdays').innerHTML = WEEKDAYS_SHORT.map(d => `<span>${d}</span>`).join('');

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = todayISO();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, other: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, other: false, dateStr: `${year}-${pad(month + 1)}-${pad(d)}` });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length, other: true });

  $('#month-grid').innerHTML = cells.map(c => {
    if (c.other) return `<div class="month-cell other-month"><span class="month-cell-num">${c.day}</span></div>`;
    const count = state.tasks.filter(t => t.date === c.dateStr).length;
    const isToday = c.dateStr === todayStr;
    return `<div class="month-cell${isToday ? ' today' : ''}" data-date="${c.dateStr}">
      <span class="month-cell-num">${c.day}</span>
      ${count ? `<span class="month-cell-count">${count}</span>` : ''}
    </div>`;
  }).join('');

  $$('.month-cell[data-date]', $('#month-grid')).forEach(cell => cell.addEventListener('click', () => openDayTasksModal(cell.dataset.date)));
}
$('#monthly-prev').addEventListener('click', () => { monthCursor.setMonth(monthCursor.getMonth() - 1); renderMonthly(); });
$('#monthly-next').addEventListener('click', () => { monthCursor.setMonth(monthCursor.getMonth() + 1); renderMonthly(); });
$('#monthly-today').addEventListener('click', () => { monthCursor = new Date(); renderMonthly(); });

function openDayTasksModal(dateStr) {
  const d = parseISO(dateStr);
  const items = state.tasks.filter(t => t.date === dateStr).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  openModal(`
    <h2>${d.getDate()} de ${MONTHS[d.getMonth()]}</h2>
    <div class="simple-list" id="day-modal-list" style="margin-bottom:16px;">
      ${items.length ? items.map(t => `<div class="simple-item"><span class="dot" style="background:${t.done ? 'var(--success-strong)' : 'var(--accent-strong)'}"></span>
        <span style="flex:1;${t.done ? 'text-decoration:line-through;opacity:.5' : ''}">${escapeHTML(t.title)}</span>
        ${t.time ? `<span class="task-time">${t.time}</span>` : ''}
        <button class="btn-danger-text" data-id="${t.id}">✕</button></div>`).join('') : '<div class="empty-hint">Nenhuma tarefa neste dia</div>'}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="day-modal-close">Fechar</button>
      <button class="btn btn-primary" id="day-modal-add">+ Adicionar tarefa</button>
    </div>
  `);
  $$('#day-modal-list button[data-id]').forEach(b => b.addEventListener('click', () => { deleteTask(b.dataset.id); closeModal(); openDayTasksModal(dateStr); }));
  $('#day-modal-close').addEventListener('click', closeModal);
  $('#day-modal-add').addEventListener('click', () => openTaskModal({ date: dateStr, period: 'tarde' }));
}

/* ============================================================================
   HÁBITOS
   ========================================================================== */
function habitStreak(habit) {
  let streak = 0;
  let d = new Date();
  if (!habit.history[todayISO()]) d.setDate(d.getDate() - 1);
  while (habit.history[toISO(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function habitCompletionPct(habit) {
  const days = Object.keys(habit.history).length;
  const created = habit.createdAt ? parseISO(habit.createdAt) : new Date();
  const totalDays = Math.max(1, Math.ceil((new Date() - created) / 86400000) + 1);
  return Math.min(100, Math.round((days / totalDays) * 100));
}

function renderHabits() {
  const today = todayISO();
  const doneToday = state.habits.filter(h => h.history[today]).length;
  const bestStreak = Math.max(0, ...state.habits.map(habitStreak));
  $('#habit-stats-row').innerHTML = `
    <div class="habit-stat-chip">Hoje: <b>${doneToday}/${state.habits.length}</b></div>
    <div class="habit-stat-chip">Melhor sequência: <b>${bestStreak} dias</b></div>
    <div class="habit-stat-chip">Categorias: <b>${state.habitCategories.length}</b></div>
  `;

  const list = $('#habits-list');
  if (!state.habits.length) { list.innerHTML = '<div class="empty-hint">Nenhum hábito ainda. Adicione o primeiro ✿</div>'; return; }

  list.innerHTML = state.habitCategories.map(cat => {
    const items = state.habits.filter(h => h.categoryId === cat.id);
    if (!items.length) return '';
    return `<div class="habit-category-group">
      <div class="habit-category-label">${escapeHTML(cat.name)}</div>
      ${items.map(renderHabitRow).join('')}
    </div>`;
  }).join('') + (() => {
    const orphan = state.habits.filter(h => !state.habitCategories.some(c => c.id === h.categoryId));
    return orphan.length ? `<div class="habit-category-group"><div class="habit-category-label">Sem categoria</div>${orphan.map(renderHabitRow).join('')}</div>` : '';
  })();

  bindHabitEvents();
}

function renderHabitRow(h) {
  const checked = !!h.history[todayISO()];
  const streak = habitStreak(h);
  const pct = habitCompletionPct(h);
  return `<div class="habit-row" data-id="${h.id}">
    <span class="habit-color-dot" style="background:${h.color}"></span>
    <div class="habit-row-info">
      <div class="habit-row-name">${escapeHTML(h.name)}</div>
      <div class="habit-row-meta">meta: ${h.goal}x ${h.frequency} · ${pct}% de conclusão</div>
      <div class="habit-progress-mini"><div class="habit-progress-mini-fill" style="width:${pct}%;background:${h.color}"></div></div>
    </div>
    <span class="habit-streak">🔥 ${streak}</span>
    <button class="habit-check-today${checked ? ' checked' : ''}" data-action="check">${checked ? '✓' : ''}</button>
    <div class="habit-row-actions">
      <button data-action="edit">✎</button>
      <button data-action="delete">✕</button>
    </div>
  </div>`;
}

function bindHabitEvents() {
  $$('.habit-row').forEach(row => {
    const id = row.dataset.id;
    $('[data-action="check"]', row).addEventListener('click', () => {
      const h = state.habits.find(h => h.id === id);
      const today = todayISO();
      const wasChecked = !!h.history[today];
      if (wasChecked) delete h.history[today]; else h.history[today] = true;
      saveState(); renderHabits(); renderDashboardIfActive();
      if (!wasChecked) toast(`${h.name} concluído ✿`);
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openHabitModal(state.habits.find(h => h.id === id)));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      state.habits = state.habits.filter(h => h.id !== id);
      saveState(); renderHabits();
      toast('Hábito excluído', '🗑');
    });
  });
}
function renderDashboardIfActive() { if (currentPage === 'dashboard') renderDashboard(); }

function openHabitModal(editing = null) {
  const data = editing || { name: '', categoryId: state.habitCategories[0]?.id || '', color: '#D68CA4', goal: 1, frequency: 'diario' };
  openModal(`
    <h2>${editing ? 'Editar hábito' : 'Novo hábito'}</h2>
    <div class="form-row"><label>Nome</label><input class="input" id="hm-name" value="${escapeHTML(data.name)}" placeholder="Ex: Beber água"></div>
    <div class="form-row"><label>Categoria</label>
      <select class="input" id="hm-category">${state.habitCategories.map(c => `<option value="${c.id}" ${c.id === data.categoryId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}</select>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Meta (vezes)</label><input type="number" min="1" class="input" id="hm-goal" value="${data.goal}"></div>
      <div class="form-row"><label>Frequência</label>
        <select class="input" id="hm-frequency">
          <option value="diario" ${data.frequency === 'diario' ? 'selected' : ''}>Diário</option>
          <option value="semanal" ${data.frequency === 'semanal' ? 'selected' : ''}>Semanal</option>
        </select>
      </div>
    </div>
    <div class="form-row"><label>Cor</label><input type="color" id="hm-color" value="${data.color}" style="width:60px;height:36px;border:none;background:none;cursor:pointer;"></div>
    <div class="modal-actions">
      ${editing ? '<button class="btn-danger-text" id="hm-delete">Excluir</button>' : ''}
      <button class="btn btn-ghost" id="hm-cancel">Cancelar</button>
      <button class="btn btn-primary" id="hm-save">Salvar</button>
    </div>
  `);
  $('#hm-cancel').addEventListener('click', closeModal);
  if (editing) $('#hm-delete').addEventListener('click', () => { state.habits = state.habits.filter(h => h.id !== editing.id); saveState(); closeModal(); renderHabits(); });
  $('#hm-save').addEventListener('click', () => {
    const name = $('#hm-name').value.trim();
    if (!name) { toast('Dê um nome ao hábito', '⚠'); return; }
    const payload = { name, categoryId: $('#hm-category').value, goal: Number($('#hm-goal').value) || 1, frequency: $('#hm-frequency').value, color: $('#hm-color').value };
    if (editing) Object.assign(editing, payload);
    else state.habits.push({ id: uid(), history: {}, createdAt: todayISO(), ...payload });
    saveState(); closeModal(); renderHabits();
    toast(editing ? 'Hábito atualizado' : 'Hábito adicionado ✿');
  });
}
$('#habits-add-btn').addEventListener('click', () => openHabitModal());
$('#habits-category-btn').addEventListener('click', () => {
  openModal(`
    <h2>Nova categoria de hábitos</h2>
    <div class="form-row"><label>Nome</label><input class="input" id="hcm-name" placeholder="Ex: Autocuidado"></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="hcm-cancel">Cancelar</button><button class="btn btn-primary" id="hcm-save">Criar</button></div>
  `);
  $('#hcm-cancel').addEventListener('click', closeModal);
  $('#hcm-save').addEventListener('click', () => {
    const name = $('#hcm-name').value.trim();
    if (!name) return;
    state.habitCategories.push({ id: uid(), name });
    saveState(); closeModal(); renderHabits();
    toast('Categoria criada ✿');
  });
});

/* ============================================================================
   LISTA DE COMPRAS
   ========================================================================== */
let shoppingSearchTerm = '';
$('#shopping-search').addEventListener('input', e => { shoppingSearchTerm = e.target.value.toLowerCase(); renderShopping(); });

const collapsedCategories = new Set();

function renderShopping() {
  const container = $('#shopping-categories');
  container.innerHTML = state.shoppingCategories.map(cat => {
    let items = state.shoppingItems.filter(i => i.categoryId === cat.id && !i.bought);
    if (shoppingSearchTerm) items = items.filter(i => i.name.toLowerCase().includes(shoppingSearchTerm));
    const collapsed = collapsedCategories.has(cat.id);
    return `<div class="shopping-category${collapsed ? ' collapsed' : ''}" data-cat="${cat.id}">
      <div class="card-head collapsible" data-collapse-cat="${cat.id}">
        <h3>${cat.emoji} ${escapeHTML(cat.name)} <span class="count-pill">${items.length}</span></h3>
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="btn btn-sm btn-ghost" data-add-item="${cat.id}">+ item</button>
          <span class="chevron">⌄</span>
        </div>
      </div>
      <div class="collapse-body${collapsed ? ' collapsed' : ''}">
        ${items.length ? items.map(renderShoppingItem).join('') : '<div class="empty-hint">Nenhum item aqui ainda</div>'}
      </div>
    </div>`;
  }).join('');

  $$('[data-collapse-cat]', container).forEach(head => head.addEventListener('click', e => {
    if (e.target.closest('[data-add-item]')) return;
    const id = head.dataset.collapseCat;
    collapsedCategories.has(id) ? collapsedCategories.delete(id) : collapsedCategories.add(id);
    renderShopping();
  }));
  $$('[data-add-item]', container).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openShoppingItemModal(null, btn.dataset.addItem); }));
  bindShoppingItemEvents(container);

  // comprados
  const purchased = state.shoppingItems.filter(i => i.bought).sort((a, b) => (b.boughtDate || '').localeCompare(a.boughtDate || ''));
  $('#purchased-count').textContent = purchased.length;
  const purchasedBody = $('#purchased-list-body');
  purchasedBody.innerHTML = purchased.length ? purchased.map(i => `
    <div class="shopping-item">
      <button class="shopping-check checked" data-action="unbuy" data-id="${i.id}">✓</button>
      <div class="shopping-item-info">
        <span class="shopping-item-name done">${escapeHTML(i.name)}</span>
        <div class="shopping-item-meta"><span>comprado em ${i.boughtDate ? formatDatePt(i.boughtDate) : '—'}</span>${i.price ? `<span>${currency(i.price)}</span>` : ''}</div>
      </div>
      <div class="shopping-item-actions"><button data-action="delete" data-id="${i.id}">✕</button></div>
    </div>`).join('') : '<div class="empty-hint">Nada comprado ainda</div>';
  bindShoppingItemEvents($('#purchased-list-body'));
}
function formatDatePt(iso) { const d = parseISO(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }

function renderShoppingItem(i) {
  return `<div class="shopping-item" data-id="${i.id}">
    <button class="shopping-check${i.bought ? ' checked' : ''}" data-action="toggle" data-id="${i.id}">${i.bought ? '✓' : ''}</button>
    <div class="shopping-item-info">
      <span class="shopping-item-name">${escapeHTML(i.name)}</span>
      <div class="shopping-item-meta">
        ${i.price ? `<span>${currency(i.price)}</span>` : ''}
        ${i.qty ? `<span>qtd: ${i.qty}</span>` : ''}
        <span class="priority-pill priority-${i.priority}">${i.priority}</span>
        ${i.notes ? `<span>${escapeHTML(i.notes)}</span>` : ''}
      </div>
    </div>
    <div class="shopping-item-actions">
      <button class="buy-btn" data-action="buy" data-id="${i.id}" title="Marcar como comprado">comprar</button>
      <button data-action="edit" data-id="${i.id}">✎</button>
      <button data-action="delete" data-id="${i.id}">✕</button>
    </div>
  </div>`;
}

function bindShoppingItemEvents(container) {
  $$('[data-action="toggle"]', container).forEach(b => b.addEventListener('click', () => setBought(b.dataset.id, !state.shoppingItems.find(i => i.id === b.dataset.id).bought)));
  $$('[data-action="unbuy"]', container).forEach(b => b.addEventListener('click', () => setBought(b.dataset.id, false)));
  $$('[data-action="buy"]', container).forEach(b => b.addEventListener('click', () => setBought(b.dataset.id, true)));
  $$('[data-action="edit"]', container).forEach(b => b.addEventListener('click', () => { const item = state.shoppingItems.find(i => i.id === b.dataset.id); openShoppingItemModal(item, item.categoryId); }));
  $$('[data-action="delete"]', container).forEach(b => b.addEventListener('click', () => { state.shoppingItems = state.shoppingItems.filter(i => i.id !== b.dataset.id); saveState(); renderShopping(); toast('Item excluído', '🗑'); }));
}
function setBought(id, bought) {
  const item = state.shoppingItems.find(i => i.id === id);
  item.bought = bought;
  item.boughtDate = bought ? todayISO() : null;
  saveState(); renderShopping();
  if (bought) toast('Adicionado aos comprados ✿');
}

function openShoppingItemModal(editing, categoryId) {
  const data = editing || { name: '', price: '', qty: 1, priority: 'media', notes: '', categoryId };
  openModal(`
    <h2>${editing ? 'Editar item' : 'Novo item'}</h2>
    <div class="form-row"><label>Nome</label><input class="input" id="sm-name" value="${escapeHTML(data.name)}" placeholder="Ex: Creme hidratante"></div>
    <div class="form-row"><label>Categoria</label>
      <select class="input" id="sm-category">${state.shoppingCategories.map(c => `<option value="${c.id}" ${c.id === data.categoryId ? 'selected' : ''}>${c.emoji} ${escapeHTML(c.name)}</option>`).join('')}</select>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Preço (R$)</label><input type="number" step="0.01" class="input" id="sm-price" value="${data.price || ''}"></div>
      <div class="form-row"><label>Quantidade</label><input type="number" min="1" class="input" id="sm-qty" value="${data.qty || 1}"></div>
    </div>
    <div class="form-row"><label>Prioridade</label>
      <div class="chip-select" id="sm-priority">
        ${['alta', 'media', 'baixa'].map(p => `<div class="chip-option${data.priority === p ? ' selected' : ''}" data-val="${p}">${p}</div>`).join('')}
      </div>
    </div>
    <div class="form-row"><label>Observações</label><textarea class="input" id="sm-notes">${escapeHTML(data.notes || '')}</textarea></div>
    <div class="modal-actions">
      ${editing ? '<button class="btn-danger-text" id="sm-delete">Excluir</button>' : ''}
      <button class="btn btn-ghost" id="sm-cancel">Cancelar</button>
      <button class="btn btn-primary" id="sm-save">Salvar</button>
    </div>
  `);
  let selPriority = data.priority;
  $$('#sm-priority .chip-option').forEach(c => c.addEventListener('click', () => { $$('#sm-priority .chip-option').forEach(x => x.classList.remove('selected')); c.classList.add('selected'); selPriority = c.dataset.val; }));
  $('#sm-cancel').addEventListener('click', closeModal);
  if (editing) $('#sm-delete').addEventListener('click', () => { state.shoppingItems = state.shoppingItems.filter(i => i.id !== editing.id); saveState(); closeModal(); renderShopping(); });
  $('#sm-save').addEventListener('click', () => {
    const name = $('#sm-name').value.trim();
    if (!name) { toast('Dê um nome ao item', '⚠'); return; }
    const payload = { name, categoryId: $('#sm-category').value, price: parseFloat($('#sm-price').value) || 0, qty: Number($('#sm-qty').value) || 1, priority: selPriority, notes: $('#sm-notes').value.trim() };
    if (editing) Object.assign(editing, payload);
    else state.shoppingItems.push({ id: uid(), bought: false, boughtDate: null, ...payload });
    saveState(); closeModal(); renderShopping();
    toast(editing ? 'Item atualizado' : 'Item adicionado ✿');
  });
}
$('#shopping-add-btn').addEventListener('click', () => openShoppingItemModal(null, state.shoppingCategories[0]?.id));
$('#shopping-category-btn').addEventListener('click', () => {
  openModal(`
    <h2>Nova categoria</h2>
    <div class="form-row"><label>Emoji</label><input class="input" id="scm-emoji" maxlength="2" placeholder="✨" style="width:70px;"></div>
    <div class="form-row"><label>Nome</label><input class="input" id="scm-name" placeholder="Ex: Maquiagem"></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="scm-cancel">Cancelar</button><button class="btn btn-primary" id="scm-save">Criar</button></div>
  `);
  $('#scm-cancel').addEventListener('click', closeModal);
  $('#scm-save').addEventListener('click', () => {
    const name = $('#scm-name').value.trim();
    if (!name) return;
    state.shoppingCategories.push({ id: uid(), name, emoji: $('#scm-emoji').value.trim() || '🛍' });
    saveState(); closeModal(); renderShopping();
    toast('Categoria criada ✿');
  });
});
$('[data-collapse="comprados"]').addEventListener('click', () => {
  $('#purchased-list-body').classList.toggle('collapsed');
  $('[data-collapse="comprados"]').classList.toggle('collapsed');
});

/* ============================================================================
   METAS
   ========================================================================== */
let goalsTab = 'anual';
$$('#goals-tabs .segmented-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('#goals-tabs .segmented-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); goalsTab = btn.dataset.tab; renderGoals();
}));

function goalProgress(g) {
  if (!g.subtasks.length) return g.done ? 100 : 0;
  const done = g.subtasks.filter(s => s.done).length;
  return Math.round(done / g.subtasks.length * 100);
}

function renderGoals() {
  const items = state.goals.filter(g => g.type === goalsTab);
  const grid = $('#goals-grid');
  if (!items.length) { grid.innerHTML = '<div class="empty-hint">Nenhuma meta aqui ainda. Que tal criar uma? ✿</div>'; return; }
  grid.innerHTML = items.map(g => {
    const pct = goalProgress(g);
    return `<div class="goal-card" data-id="${g.id}">
      <div class="goal-card-head">
        <div><div class="goal-title">${escapeHTML(g.title)}</div>${g.desc ? `<div class="goal-desc">${escapeHTML(g.desc)}</div>` : ''}</div>
        <div class="goal-progress-ring" style="--pct:${pct}" data-pct="${pct}%"></div>
      </div>
      <div class="goal-subtasks">
        ${g.subtasks.map(s => `<label class="goal-subtask${s.done ? ' done' : ''}"><input type="checkbox" data-sub="${s.id}" ${s.done ? 'checked' : ''}><span>${escapeHTML(s.text)}</span></label>`).join('')}
      </div>
      <div class="goal-add-subtask">
        <input class="input" placeholder="+ subtarefa" data-newsub>
      </div>
      <div class="goal-card-actions">
        <button class="btn btn-sm btn-ghost" data-action="edit">Editar</button>
        <button class="btn-danger-text" data-action="delete">Excluir</button>
      </div>
    </div>`;
  }).join('');

  $$('.goal-card', grid).forEach(card => {
    const id = card.dataset.id;
    const goal = state.goals.find(g => g.id === id);
    $$('[data-sub]', card).forEach(cb => cb.addEventListener('change', () => {
      const sub = goal.subtasks.find(s => s.id === cb.dataset.sub);
      sub.done = cb.checked;
      const wasComplete = goalProgress(goal) === 100;
      saveState();
      if (cb.checked && goalProgress(goal) === 100) { petalBurst(); toast('Meta concluída! 🎉'); }
      renderGoals();
    }));
    const newSubInput = card.querySelector('[data-newsub]');
    newSubInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && newSubInput.value.trim()) {
        goal.subtasks.push({ id: uid(), text: newSubInput.value.trim(), done: false });
        saveState(); renderGoals();
      }
    });
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openGoalModal(goal));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => { state.goals = state.goals.filter(g => g.id !== id); saveState(); renderGoals(); toast('Meta excluída', '🗑'); });
  });
}

function openGoalModal(editing = null) {
  const data = editing || { title: '', desc: '', type: goalsTab };
  openModal(`
    <h2>${editing ? 'Editar meta' : 'Nova meta'}</h2>
    <div class="form-row"><label>Título</label><input class="input" id="gm-title" value="${escapeHTML(data.title)}" placeholder="Ex: Ler 12 livros"></div>
    <div class="form-row"><label>Descrição</label><textarea class="input" id="gm-desc">${escapeHTML(data.desc || '')}</textarea></div>
    <div class="form-row"><label>Tipo</label>
      <div class="chip-select" id="gm-type">
        ${['anual', 'mensal', 'semanal'].map(t => `<div class="chip-option${data.type === t ? ' selected' : ''}" data-val="${t}">${t}</div>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      ${editing ? '<button class="btn-danger-text" id="gm-delete">Excluir</button>' : ''}
      <button class="btn btn-ghost" id="gm-cancel">Cancelar</button>
      <button class="btn btn-primary" id="gm-save">Salvar</button>
    </div>
  `);
  let selType = data.type;
  $$('#gm-type .chip-option').forEach(c => c.addEventListener('click', () => { $$('#gm-type .chip-option').forEach(x => x.classList.remove('selected')); c.classList.add('selected'); selType = c.dataset.val; }));
  $('#gm-cancel').addEventListener('click', closeModal);
  if (editing) $('#gm-delete').addEventListener('click', () => { state.goals = state.goals.filter(g => g.id !== editing.id); saveState(); closeModal(); renderGoals(); });
  $('#gm-save').addEventListener('click', () => {
    const title = $('#gm-title').value.trim();
    if (!title) { toast('Dê um título para a meta', '⚠'); return; }
    const payload = { title, desc: $('#gm-desc').value.trim(), type: selType };
    if (editing) Object.assign(editing, payload);
    else state.goals.push({ id: uid(), subtasks: [], ...payload });
    saveState(); closeModal();
    goalsTab = selType;
    $$('#goals-tabs .segmented-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === selType));
    renderGoals();
    toast(editing ? 'Meta atualizada' : 'Meta criada ✿');
  });
}
$('#goals-add-btn').addEventListener('click', () => openGoalModal());

/* ============================================================================
   ESTUDOS — calendário de provas
   ========================================================================== */
function renderStudies() {
  const grid = $('#studies-grid');
  const items = [...state.exams].sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) { grid.innerHTML = '<div class="empty-hint">Nenhuma prova cadastrada. Adicione a primeira ✿</div>'; return; }
  const today = new Date(); today.setHours(0,0,0,0);
  grid.innerHTML = items.map(e => {
    const d = parseISO(e.date);
    const diff = Math.round((d - today) / 86400000);
    const label = diff === 0 ? 'é hoje!' : diff > 0 ? `faltam ${diff} dias` : 'já passou';
    return `<div class="exam-card" data-id="${e.id}">
      <span class="exam-date-badge">${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}</span>
      <div class="exam-subject">${escapeHTML(e.subject)}</div>
      ${e.topic ? `<div class="exam-topic">${escapeHTML(e.topic)}</div>` : ''}
      <div class="exam-days-left">${label}</div>
      <div class="goal-card-actions">
        <button class="btn btn-sm btn-ghost" data-action="edit">Editar</button>
        <button class="btn-danger-text" data-action="delete">Excluir</button>
      </div>
    </div>`;
  }).join('');
  $$('.exam-card', grid).forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openExamModal(state.exams.find(e => e.id === id)));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => { state.exams = state.exams.filter(e => e.id !== id); saveState(); renderStudies(); toast('Prova removida', '🗑'); });
  });
}
function openExamModal(editing = null) {
  const data = editing || { subject: '', topic: '', date: todayISO() };
  openModal(`
    <h2>${editing ? 'Editar prova' : 'Nova prova'}</h2>
    <div class="form-row"><label>Matéria</label><input class="input" id="em-subject" value="${escapeHTML(data.subject)}" placeholder="Ex: Anatomia"></div>
    <div class="form-row"><label>Conteúdo</label><input class="input" id="em-topic" value="${escapeHTML(data.topic || '')}" placeholder="Ex: Sistema nervoso"></div>
    <div class="form-row"><label>Data</label><input type="date" class="input" id="em-date" value="${data.date}"></div>
    <div class="modal-actions">
      ${editing ? '<button class="btn-danger-text" id="em-delete">Excluir</button>' : ''}
      <button class="btn btn-ghost" id="em-cancel">Cancelar</button>
      <button class="btn btn-primary" id="em-save">Salvar</button>
    </div>
  `);
  $('#em-cancel').addEventListener('click', closeModal);
  if (editing) $('#em-delete').addEventListener('click', () => { state.exams = state.exams.filter(e => e.id !== editing.id); saveState(); closeModal(); renderStudies(); });
  $('#em-save').addEventListener('click', () => {
    const subject = $('#em-subject').value.trim();
    if (!subject) { toast('Dê o nome da matéria', '⚠'); return; }
    const payload = { subject, topic: $('#em-topic').value.trim(), date: $('#em-date').value || todayISO() };
    if (editing) Object.assign(editing, payload);
    else state.exams.push({ id: uid(), ...payload });
    saveState(); closeModal(); renderStudies();
    toast(editing ? 'Prova atualizada' : 'Prova adicionada ✿');
  });
}
$('#studies-add-btn').addEventListener('click', () => openExamModal());

/* ============================================================================
   FINANÇAS
   ========================================================================== */
function renderFinances() {
  const income = state.finances.filter(f => f.type === 'entrada').reduce((s, f) => s + f.amount, 0);
  const expense = state.finances.filter(f => f.type === 'saida').reduce((s, f) => s + f.amount, 0);
  $('#fin-income').textContent = currency(income);
  $('#fin-expense').textContent = currency(expense);
  $('#fin-balance').textContent = currency(income - expense);

  const list = $('#finances-list');
  const items = [...state.finances].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = items.length ? items.map(f => `
    <div class="simple-item">
      <span class="dot" style="background:${f.type === 'entrada' ? 'var(--success-strong)' : 'var(--danger)'}"></span>
      <span style="flex:1;">${escapeHTML(f.desc)}</span>
      <span style="font-weight:700;color:${f.type === 'entrada' ? 'var(--success-strong)' : 'var(--danger)'}">${f.type === 'entrada' ? '+' : '-'} ${currency(f.amount)}</span>
      <span class="task-time">${formatDatePt(f.date)}</span>
      <button class="btn-danger-text" data-id="${f.id}">✕</button>
    </div>`).join('') : '<div class="empty-hint">Nenhum lançamento ainda</div>';
  $$('[data-id]', list).forEach(b => b.addEventListener('click', () => { state.finances = state.finances.filter(f => f.id !== b.dataset.id); saveState(); renderFinances(); }));
}
$('#finances-add-btn').addEventListener('click', () => {
  openModal(`
    <h2>Novo lançamento</h2>
    <div class="form-row"><label>Descrição</label><input class="input" id="fm-desc" placeholder="Ex: Mesada"></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Valor (R$)</label><input type="number" step="0.01" class="input" id="fm-amount"></div>
      <div class="form-row"><label>Data</label><input type="date" class="input" id="fm-date" value="${todayISO()}"></div>
    </div>
    <div class="form-row"><label>Tipo</label>
      <div class="chip-select" id="fm-type">
        <div class="chip-option selected" data-val="entrada">entrada</div>
        <div class="chip-option" data-val="saida">saída</div>
      </div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" id="fm-cancel">Cancelar</button><button class="btn btn-primary" id="fm-save">Salvar</button></div>
  `);
  let selType = 'entrada';
  $$('#fm-type .chip-option').forEach(c => c.addEventListener('click', () => { $$('#fm-type .chip-option').forEach(x => x.classList.remove('selected')); c.classList.add('selected'); selType = c.dataset.val; }));
  $('#fm-cancel').addEventListener('click', closeModal);
  $('#fm-save').addEventListener('click', () => {
    const desc = $('#fm-desc').value.trim();
    const amount = parseFloat($('#fm-amount').value);
    if (!desc || !amount) { toast('Preencha descrição e valor', '⚠'); return; }
    state.finances.push({ id: uid(), desc, amount, type: selType, date: $('#fm-date').value || todayISO() });
    saveState(); closeModal(); renderFinances();
    toast('Lançamento adicionado ✿');
  });
});

/* ============================================================================
   NOTAS
   ========================================================================== */
const NOTE_COLORS = ['#F7E7EC', '#F1E8F7', '#E7EFF7', '#E9F2E6', '#F7F0E6'];

function renderNotes() {
  const grid = $('#notes-grid');
  if (!state.notes.length) {
    grid.innerHTML = '<div class="empty-state"><span class="empty-icon">✐</span><span>Nenhuma nota encontrada. Crie a primeira ✿</span></div>';
    return;
  }
  grid.innerHTML = state.notes.map(n => `<div class="note-card" style="background:${n.color || NOTE_COLORS[0]}" data-id="${n.id}">
    <h4>${escapeHTML(n.title) || 'Sem título'}</h4>
    <p>${escapeHTML(n.content || '')}</p>
  </div>`).join('');
  $$('.note-card', grid).forEach(card => card.addEventListener('click', () => openNoteModal(state.notes.find(n => n.id === card.dataset.id))));
}

function openNoteModal(editing = null) {
  const data = editing || { title: '', content: '', color: NOTE_COLORS[0] };
  openModal(`
    <h2>${editing ? 'Editar nota' : 'Nova nota'}</h2>
    <div class="form-row"><label>Título</label><input class="input" id="nm-title" value="${escapeHTML(data.title)}" placeholder="Ex: Ideias para o fim de semana"></div>
    <div class="form-row"><label>Conteúdo</label><textarea class="input" id="nm-content" rows="6">${escapeHTML(data.content)}</textarea></div>
    <div class="form-row"><label>Cor</label>
      <div class="chip-select" id="nm-color">
        ${NOTE_COLORS.map(c => `<div class="color-swatch${data.color === c ? ' active' : ''}" style="background:${c}" data-val="${c}"></div>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      ${editing ? '<button class="btn-danger-text" id="nm-delete">Excluir</button>' : ''}
      <button class="btn btn-ghost" id="nm-cancel">Cancelar</button>
      <button class="btn btn-primary" id="nm-save">Salvar</button>
    </div>
  `);
  let selColor = data.color;
  $$('#nm-color .color-swatch').forEach(c => c.addEventListener('click', () => { $$('#nm-color .color-swatch').forEach(x => x.classList.remove('active')); c.classList.add('active'); selColor = c.dataset.val; }));
  $('#nm-cancel').addEventListener('click', closeModal);
  if (editing) $('#nm-delete').addEventListener('click', () => { state.notes = state.notes.filter(n => n.id !== editing.id); saveState(); closeModal(); renderNotes(); toast('Nota excluída', '🗑'); });
  $('#nm-save').addEventListener('click', () => {
    const payload = { title: $('#nm-title').value.trim(), content: $('#nm-content').value.trim(), color: selColor };
    if (editing) Object.assign(editing, payload);
    else state.notes.push({ id: uid(), ...payload });
    saveState(); closeModal(); renderNotes();
    toast(editing ? 'Nota atualizada' : 'Nota criada ✿');
  });
}
$('#notes-add-btn').addEventListener('click', () => openNoteModal());

/* ============================================================================
   CONFIGURAÇÕES
   ========================================================================== */
const THEME_LABELS = [{ id: 'light', name: '☀ Claro' }, { id: 'dark', name: '🌙 Escuro' }];
const ACCENT_COLORS = [
  { id: 'rose', hex: '#D68CA4', label: 'Rosa bebê' }, { id: 'lavender', hex: '#9F86C9', label: 'Lavanda' },
  { id: 'sky', hex: '#6FA0C9', label: 'Azul pastel' }, { id: 'sage', hex: '#7FA579', label: 'Verde sálvia' },
  { id: 'beige', hex: '#B79C7C', label: 'Bege minimalista' }, { id: 'noir', hex: '#1C1C1F', label: 'Preto elegante' },
  { id: 'clean', hex: '#9098A3', label: 'Branco clean' }, { id: 'peach', hex: '#E0975F', label: 'Pêssego' },
];

function renderSettings() {
  $('#settings-avatar').src = state.profile.avatar || makeAvatarPlaceholder();
  $('#settings-name-input').value = state.profile.name || '';

  $('#theme-options').innerHTML = THEME_LABELS.map(t => `<div class="theme-option${state.theme === t.id ? ' active' : ''}" data-theme-opt="${t.id}">${t.name}</div>`).join('');
  $$('[data-theme-opt]').forEach(el => el.addEventListener('click', () => { state.theme = el.dataset.themeOpt; saveState(); applyTheme(); renderSettings(); }));

  $('#color-options').innerHTML = ACCENT_COLORS.map(c => `<div class="color-swatch${state.accent === c.id ? ' active' : ''}" style="background:${c.hex}" data-accent-opt="${c.id}" title="${c.label}"></div>`).join('');
 $('#custom-bg-input').value = state.customBg || '#FFF9FB';
$('#settings-name-input').addEventListener('input', e => { state.profile.name = e.target.value.trim(); saveState(); applyProfile(); });
$('#settings-avatar-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { state.profile.avatar = reader.result; saveState(); applyProfile(); renderSettings(); toast('Foto atualizada ✿'); };
  reader.readAsDataURL(file);
});

/* ============================================================================
   ATALHOS DE TECLADO
   ========================================================================== */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
  if (e.key === 'Escape') { closeModal(); return; }
  if (typing) return;
  if (e.key.toLowerCase() === 'n') {
    if (currentPage === 'daily') openTaskModal({ date: $('#daily-date-picker').value });
    else if (currentPage === 'habits') openHabitModal();
    else if (currentPage === 'shopping') openShoppingItemModal(null, state.shoppingCategories[0]?.id);
    else if (currentPage === 'goals') openGoalModal();
    else if (currentPage === 'studies') openExamModal();
    else if (currentPage === 'finances') $('#finances-add-btn').click();
    else if (currentPage === 'notes') openNoteModal();
  }
  if (e.key.toLowerCase() === 'd') toggleTheme();
  if (e.key === '/' && currentPage === 'shopping') { e.preventDefault(); $('#shopping-search').focus(); }
});

/* ============================================================================
   AUTENTICAÇÃO
   ========================================================================== */
function showAuthScreen() {
  $('#auth-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
  $('#mobile-topbar').classList.add('hidden');
}
function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#mobile-topbar').classList.remove('hidden');
}

$$('#auth-tabs [data-auth-tab]').forEach(btn => btn.addEventListener('click', () => {
  $$('#auth-tabs [data-auth-tab]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.authTab;
  $('#login-form').classList.toggle('hidden', tab !== 'login');
  $('#register-form').classList.toggle('hidden', tab !== 'register');
}));

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = $('#login-error');
  errEl.textContent = '';
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  try {
    const { token } = await Api.login(email, password);
    Auth.setToken(token);
    await bootApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

$('#register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = $('#register-error');
  errEl.textContent = '';
  const name = $('#register-name').value.trim();
  const email = $('#register-email').value.trim();
  const password = $('#register-password').value;
  try {
    const { token } = await Api.register(name, email, password);
    Auth.setToken(token);
    await bootApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

$('#forgot-password-link').addEventListener('click', async () => {
  const email = ($('#login-email').value || '').trim();
  if (!email) { $('#login-error').textContent = 'Digite seu e-mail no campo acima primeiro'; return; }
  try {
    const { message } = await Api.forgotPassword(email);
    toast(message || 'Verifique seu e-mail', '✉');
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout-btn').addEventListener('click', () => {
  Auth.clearToken();
  localStorage.removeItem(LOCAL_CACHE_KEY);
  state = defaultState();
  showAuthScreen();
});

/* ============================================================================
   INICIALIZAÇÃO
   ========================================================================== */
function renderApp() {
  applyTheme();
  applyProfile();
  $('#daily-date-picker').value = todayISO();
  navigateTo('dashboard');
}

async function bootApp() {
  const cache = loadLocalCache();
  if (cache) state = Object.assign(defaultState(), cache);

  try {
    await Api.me();
    showApp();
    renderApp();
    await fetchRemoteState();
    applyTheme();
    applyProfile();
    renderPage(currentPage);
  } catch (err) {
    Auth.clearToken();
    showAuthScreen();
  }
}

function boot() {
  if (Auth.getToken()) {
    bootApp();
  } else {
    showAuthScreen();
  }
}
boot();
