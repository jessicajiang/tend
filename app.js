// ---------- storage ----------
const STORAGE_KEY = 'loop.tasks.v1';

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : seedTasks();
  } catch (e) {
    return seedTasks();
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function seedTasks() {
  return [];
}

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ---------- date helpers (local time, no TZ math) ----------
function toISODate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseISO(s) { return new Date(s + 'T00:00:00'); }
function todayStr() { return toISODate(new Date()); }
function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function addInterval(dateStr, interval) {
  const d = parseISO(dateStr);
  if (interval.unit === 'day') d.setDate(d.getDate() + interval.value);
  else if (interval.unit === 'week') d.setDate(d.getDate() + interval.value * 7);
  else if (interval.unit === 'month') d.setMonth(d.getMonth() + interval.value);
  return toISODate(d);
}
function mostRecentScheduled(weekdays, fromStr) {
  const d = parseISO(fromStr);
  for (let i = 0; i < 7; i++) {
    if (weekdays.includes(d.getDay())) return toISODate(d);
    d.setDate(d.getDate() - 1);
  }
  return fromStr;
}
function nextScheduledAfter(weekdays, fromStr) {
  const d = parseISO(fromStr);
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() + 1);
    if (weekdays.includes(d.getDay())) return toISODate(d);
  }
  return fromStr;
}
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function formatDateHuman(s) {
  const d = parseISO(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- recurrence status ----------
function getStatus(task) {
  const today = todayStr();
  if (task.type === 'freeform') {
    return { due: false, next: null };
  }
  if (task.type === 'fixed') {
    const recent = mostRecentScheduled(task.weekdays, today);
    const last = task.completions.length ? task.completions[task.completions.length - 1] : null;
    const completedThisCycle = last && last >= recent;
    if (completedThisCycle) {
      return { due: false, next: nextScheduledAfter(task.weekdays, today) };
    }
    return { due: true, next: recent, overdueDays: diffDays(recent, today) };
  }
  // floating
  const last = task.completions.length ? task.completions[task.completions.length - 1] : null;
  const next = last ? addInterval(last, task.interval) : task.createdAt;
  const due = next <= today;
  return { due, next, overdueDays: due ? diffDays(next, today) : 0 };
}

function scheduleLabel(task) {
  if (task.type === 'freeform') return 'As needed';
  if (task.type === 'fixed') {
    if (task.weekdays.length === 7) return 'Every day';
    return 'Every ' + task.weekdays.map(w => WEEKDAY_NAMES[w]).join(', ');
  }
  const { value, unit } = task.interval;
  if (value === 1) return `Every ${unit}`;
  return `Every ${value} ${unit}s`;
}

function metaLabel(task, status) {
  if (task.type === 'freeform') {
    if (!task.completions.length) return 'Not logged yet';
    return `Last ${formatDateHuman(task.completions[task.completions.length - 1])}`;
  }
  if (status.due) {
    if (status.overdueDays > 0) return `${status.overdueDays}d overdue`;
    return 'Due today';
  }
  return `Next ${formatDateHuman(status.next)}`;
}

// ---------- auto emoji ----------
const EMOJI_RULES = [
  [['plant', 'water the', 'garden'], '🪴'],
  [['trash', 'garbage', 'recycl'], '🗑️'],
  [['dish'], '🍽️'],
  [['laundry', 'wash cloth'], '🧺'],
  [['vacuum', 'sweep', 'mop', 'dust'], '🧹'],
  [['toilet', 'bathroom'], '🚽'],
  [['shower'], '🚿'],
  [['gym', 'workout', 'exercise', 'lift'], '🏋️'],
  [['run', 'jog'], '🏃'],
  [['yoga', 'stretch'], '🧘'],
  [['meditat'], '🧘'],
  [['floss'], '🦷'],
  [['brush teeth', 'teeth'], '🪥'],
  [['journal', 'write', 'diary'], '📓'],
  [['read', 'book'], '📖'],
  [['japanese'], '🇯🇵'],
  [['spanish'], '🇪🇸'],
  [['french'], '🇫🇷'],
  [['korean'], '🇰🇷'],
  [['language', 'learn'], '🧠'],
  [['code', 'coding', 'program'], '💻'],
  [['guitar'], '🎸'],
  [['piano'], '🎹'],
  [['music', 'practice instrument'], '🎵'],
  [['craft', 'knit', 'sew'], '🧶'],
  [['draw', 'paint', 'art'], '🎨'],
  [['cook', 'meal prep', 'recipe'], '🍳'],
  [['groceries', 'grocery'], '🛒'],
  [['bill', 'budget', 'financ', 'invoice'], '💳'],
  [['car', 'oil change'], '🚗'],
  [['dog', 'walk the'], '🐕'],
  [['cat', 'litter'], '🐈'],
  [['pet', 'feed'], '🐾'],
  [['sleep', 'bed'], '🛏️'],
  [['skincare', 'skin'], '🧴'],
  [['vitamin', 'medicat', 'pill'], '💊'],
  [['email', 'inbox'], '📧'],
  [['call', 'phone'], '📞'],
  [['clean'], '🧼'],
];
const EMOJI_FALLBACK = ['✅', '🔁', '📌', '🌀', '✨', '🟢', '🔔', '🧩'];

function autoEmoji(title, tags) {
  const haystack = (title + ' ' + tags.join(' ')).toLowerCase();
  for (const [keywords, emoji] of EMOJI_RULES) {
    if (keywords.some(k => haystack.includes(k))) return emoji;
  }
  return EMOJI_FALLBACK[Math.abs(hashStr(haystack)) % EMOJI_FALLBACK.length];
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// ---------- tag colors ----------
const PALETTE = ['#FF6B6B', '#FFA94D', '#FFD43B', '#A9E34B', '#20C997', '#4DABF7', '#9775FA', '#F783AC'];
function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ---------- state ----------
const state = {
  tasks: loadTasks(),
  tab: 'due',
  statsPeriod: 30,
};

function mutate(fn) {
  fn();
  saveTasks();
  render();
}

function markDone(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const today = todayStr();
  if (!t.completions.includes(today)) {
    t.completions.push(today);
    t.completions.sort();
  }
  mutate(() => {});
}

function unmarkDone(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const today = todayStr();
  t.completions = t.completions.filter(c => c !== today);
  mutate(() => {});
}

function deleteCompletion(taskId, dateStr) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.completions = t.completions.filter(c => c !== dateStr);
  mutate(() => {});
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  mutate(() => {});
}

// ---------- rendering ----------
const viewEl = document.getElementById('view');

function render() {
  if (state.tab === 'due') renderDue();
  else if (state.tab === 'all') renderAll();
  else if (state.tab === 'free') renderFree();
  else if (state.tab === 'stats') renderStats();
}

function taskCard(task, status) {
  const el = document.createElement('div');
  el.className = 'card';
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.style.background = colorFor(task.tags[0] || task.title);
  badge.textContent = task.emoji || task.title[0].toUpperCase();
  el.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = task.title;
  const meta = document.createElement('p');
  meta.className = 'card-meta' + (status.due && status.overdueDays > 0 ? ' overdue' : '');
  meta.textContent = metaLabel(task, status) + ' · ' + scheduleLabel(task);
  body.appendChild(title);
  body.appendChild(meta);
  if (task.tags.length) {
    const tagRow = document.createElement('div');
    tagRow.className = 'tag-row';
    task.tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.style.background = colorFor(tag);
      chip.textContent = tag;
      tagRow.appendChild(chip);
    });
    body.appendChild(tagRow);
  }
  el.appendChild(body);

  const doneBtn = document.createElement('button');
  const today = todayStr();
  const doneToday = task.completions.includes(today);
  doneBtn.className = 'done-btn' + (doneToday ? ' checked' : '');
  doneBtn.textContent = doneToday ? '✓' : '';
  doneBtn.setAttribute('aria-label', 'Mark done');
  doneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    doneToday ? unmarkDone(task.id) : markDone(task.id);
  });
  el.appendChild(doneBtn);

  el.addEventListener('click', () => openDetail(task.id));
  return el;
}

function renderDue() {
  viewEl.innerHTML = '';
  const due = state.tasks
    .map(t => ({ t, status: getStatus(t) }))
    .filter(x => x.status.due)
    .sort((a, b) => a.status.next.localeCompare(b.status.next));

  if (!due.length) {
    viewEl.appendChild(emptyState('All caught up! 🎉', 'Nothing due right now.'));
    return;
  }
  due.forEach(({ t, status }) => viewEl.appendChild(taskCard(t, status)));
}

function renderAll() {
  viewEl.innerHTML = '';
  const scheduled = state.tasks.filter(t => t.type !== 'freeform');
  if (!scheduled.length) {
    viewEl.appendChild(emptyState('Nothing here yet', 'Tap + to add a chore or habit.'));
    return;
  }
  const rows = scheduled
    .map(t => ({ t, status: getStatus(t) }))
    .sort((a, b) => (a.status.next || '9999-99-99').localeCompare(b.status.next || '9999-99-99'));
  rows.forEach(({ t, status }) => viewEl.appendChild(taskCard(t, status)));
}

function renderFree() {
  viewEl.innerHTML = '';
  const freeform = state.tasks.filter(t => t.type === 'freeform');
  if (!freeform.length) {
    viewEl.appendChild(emptyState('Nothing here yet', 'Add something you do as-needed, like a hobby or craft.'));
    return;
  }
  const rows = freeform.slice().sort((a, b) => a.title.localeCompare(b.title));
  rows.forEach(t => viewEl.appendChild(taskCard(t, getStatus(t))));
}

function emptyState(title, sub) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `${title}<span class="sub">${sub}</span>`;
  return el;
}

function renderStats() {
  viewEl.innerHTML = '';

  const toggle = document.createElement('div');
  toggle.className = 'stats-period-toggle';
  [[7, '7d'], [30, '30d'], [90, '90d'], [36500, 'All time']].forEach(([days, label]) => {
    const b = document.createElement('button');
    b.className = 'tab' + (state.statsPeriod === days ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { state.statsPeriod = days; render(); });
    toggle.appendChild(b);
  });
  viewEl.appendChild(toggle);

  const cutoff = toISODate(new Date(Date.now() - state.statsPeriod * 86400000));
  const counts = {};
  state.tasks.forEach(t => {
    const tags = t.tags.length ? t.tags : ['untagged'];
    const n = t.completions.filter(c => c >= cutoff).length;
    if (!n) return;
    tags.forEach(tag => { counts[tag] = (counts[tag] || 0) + n; });
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    viewEl.appendChild(emptyState('No activity yet', 'Complete a few things to see stats here.'));
    return;
  }
  entries.forEach(([tag, count]) => {
    const row = document.createElement('div');
    row.className = 'stat-tag-row';
    row.innerHTML = `<span class="name">${tag}</span><span class="count">${count}×</span>`;
    row.style.borderLeftColor = colorFor(tag);
    row.addEventListener('click', () => openTagDetail(tag));
    viewEl.appendChild(row);
  });
}

// ---------- tag detail (heatmap + ranking) ----------
function tagCompletionCounts(tag) {
  const byDate = {};
  state.tasks.forEach(t => {
    const tags = t.tags.length ? t.tags : ['untagged'];
    if (!tags.includes(tag)) return;
    t.completions.forEach(c => { byDate[c] = (byDate[c] || 0) + 1; });
  });
  return byDate;
}

function tagHeatmapHTML(tag, weeks) {
  const byDate = tagCompletionCounts(tag);
  const totalDays = weeks * 7;
  const start = new Date();
  start.setDate(start.getDate() - (totalDays - 1));
  const pad = start.getDay();
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    cells.push(toISODate(d));
  }
  const color = colorFor(tag);
  return `<div class="heatmap" style="grid-template-rows: repeat(7, 1fr);">${cells.map(dateStr => {
    if (!dateStr) return '<div class="heatmap-cell heatmap-empty"></div>';
    const n = byDate[dateStr] || 0;
    const opacity = n === 0 ? 0 : n === 1 ? 0.4 : n === 2 ? 0.7 : 1;
    const style = n === 0 ? '' : `background:${color};opacity:${opacity}`;
    return `<div class="heatmap-cell" style="${style}" title="${dateStr}"></div>`;
  }).join('')}</div>`;
}

function openTagDetail(tag) {
  const tasksWithTag = state.tasks.filter(t => (t.tags.length ? t.tags : ['untagged']).includes(tag));
  const ranked = tasksWithTag
    .map(t => ({ t, count: t.completions.length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count);

  openModal(`
    <h2><span style="color:${colorFor(tag)}">●</span> ${tag}</h2>
    <p class="section-label" style="margin-top:0">Last 18 weeks</p>
    ${tagHeatmapHTML(tag, 18)}
    <p class="section-label">Most done</p>
    ${ranked.length ? `<div class="history-list">${ranked.map(({ t, count }) => `
      <div class="history-item"><span>${t.emoji ? t.emoji + ' ' : ''}${t.title}</span><span>${count}×</span></div>
    `).join('')}</div>` : '<p style="opacity:0.5;font-weight:600;font-size:14px">No completions logged yet.</p>'}
  `);
}

// ---------- tabs ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('#tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  state.tab = btn.dataset.tab;
  render();
});

// ---------- modal ----------
const overlay = document.getElementById('modal-overlay');
const modalEl = document.getElementById('modal');

function closeModal() {
  overlay.classList.remove('open');
  modalEl.innerHTML = '';
}
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function openModal(html) {
  modalEl.innerHTML = html;
  overlay.classList.add('open');
}

document.getElementById('add-btn').addEventListener('click', () => openForm(null));

function openForm(taskId) {
  const editing = taskId ? state.tasks.find(t => t.id === taskId) : null;
  const type = editing ? editing.type : 'floating';

  openModal(`
    <h2>${editing ? 'Edit' : 'New'} item</h2>
    <div class="field">
      <label>Title</label>
      <input type="text" id="f-title" placeholder="e.g. Water the plants" value="${editing ? escapeAttr(editing.title) : ''}">
    </div>
    <div class="row">
      <div class="field">
        <label>Emoji</label>
        <input type="text" id="f-emoji" maxlength="4" placeholder="auto" value="${editing ? escapeAttr(editing.emoji || '') : ''}">
      </div>
      <div class="field" style="flex:2; position:relative">
        <label>Tags (comma separated)</label>
        <input type="text" id="f-tags" autocomplete="off" placeholder="home, health" value="${editing ? escapeAttr(editing.tags.join(', ')) : ''}">
        <div class="tag-suggest" id="f-tag-suggest"></div>
      </div>
    </div>
    <div class="field">
      <label>Schedule type</label>
      <div class="seg" id="f-type">
        <button type="button" data-val="floating" class="${type === 'floating' ? 'active' : ''}">Floating</button>
        <button type="button" data-val="fixed" class="${type === 'fixed' ? 'active' : ''}">Fixed days</button>
        <button type="button" data-val="freeform" class="${type === 'freeform' ? 'active' : ''}">As needed</button>
      </div>
    </div>
    <div id="f-floating" class="field" style="${type === 'floating' ? '' : 'display:none'}">
      <label>Repeat every</label>
      <div class="row">
        <input type="number" id="f-interval-value" min="1" value="${editing ? editing.interval.value : 1}">
        <select id="f-interval-unit">
          <option value="day" ${editing && editing.interval.unit === 'day' ? 'selected' : ''}>day(s)</option>
          <option value="week" ${editing && editing.interval.unit === 'week' ? 'selected' : ''}>week(s)</option>
          <option value="month" ${editing && editing.interval.unit === 'month' ? 'selected' : ''}>month(s)</option>
        </select>
      </div>
      <p style="font-size:12px;opacity:0.6;font-weight:600;margin-top:6px">Next due date is based on when you last completed it.</p>
    </div>
    <div id="f-freeform" class="field" style="${type === 'freeform' ? '' : 'display:none'}">
      <p style="font-size:12px;opacity:0.6;font-weight:600;margin:0">No due date and no reminders — it just sits in "All" and logs each time you mark it done. Useful for things like crafts that you want to track but don't do on a real schedule.</p>
    </div>
    <div id="f-fixed" class="field" style="${type === 'fixed' ? '' : 'display:none'}">
      <label>Repeats on</label>
      <div class="weekday-grid" id="f-weekdays">
        ${WEEKDAY_LABELS.map((l, i) => `<button type="button" class="weekday-btn ${editing && editing.weekdays.includes(i) ? 'active' : ''}" data-day="${i}">${l}</button>`).join('')}
      </div>
      <p style="font-size:12px;opacity:0.6;font-weight:600;margin-top:6px">Due date stays locked to these days, no matter when you check it off.</p>
    </div>
    <button class="btn-primary" id="f-save">Save</button>
    ${editing ? '<button class="btn-danger" id="f-delete">Delete</button>' : ''}
  `);

  document.getElementById('f-type').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#f-type button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('f-floating').style.display = b.dataset.val === 'floating' ? '' : 'none';
    document.getElementById('f-fixed').style.display = b.dataset.val === 'fixed' ? '' : 'none';
    document.getElementById('f-freeform').style.display = b.dataset.val === 'freeform' ? '' : 'none';
  });

  document.getElementById('f-weekdays').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    b.classList.toggle('active');
  });

  setupTagAutocomplete();

  document.getElementById('f-save').addEventListener('click', () => {
    const title = document.getElementById('f-title').value.trim();
    if (!title) { document.getElementById('f-title').focus(); return; }
    const tags = document.getElementById('f-tags').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const emoji = document.getElementById('f-emoji').value.trim() || autoEmoji(title, tags);
    const selType = document.querySelector('#f-type button.active').dataset.val;
    const intervalValue = Math.max(1, parseInt(document.getElementById('f-interval-value').value, 10) || 1);
    const intervalUnit = document.getElementById('f-interval-unit').value;
    const weekdays = Array.from(document.querySelectorAll('#f-weekdays .weekday-btn.active')).map(b => parseInt(b.dataset.day, 10));

    if (selType === 'fixed' && !weekdays.length) { return; }

    if (editing) {
      editing.title = title;
      editing.emoji = emoji;
      editing.tags = tags;
      editing.type = selType;
      editing.interval = { value: intervalValue, unit: intervalUnit };
      editing.weekdays = weekdays;
    } else {
      state.tasks.push({
        id: uid(), title, emoji, tags, type: selType,
        interval: { value: intervalValue, unit: intervalUnit },
        weekdays, completions: [], createdAt: todayStr(),
      });
    }
    closeModal();
    mutate(() => {});
  });

  if (editing) {
    document.getElementById('f-delete').addEventListener('click', () => {
      if (confirm(`Delete "${editing.title}"? This can't be undone.`)) {
        closeModal();
        deleteTask(editing.id);
      }
    });
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ---------- tag autocomplete ----------
function allExistingTags() {
  const set = new Set();
  state.tasks.forEach(t => t.tags.forEach(tag => set.add(tag)));
  return Array.from(set).sort();
}

function setupTagAutocomplete() {
  const input = document.getElementById('f-tags');
  const box = document.getElementById('f-tag-suggest');

  function currentSegment() {
    const parts = input.value.split(',');
    return parts[parts.length - 1].trim().toLowerCase();
  }

  function render() {
    const seg = currentSegment();
    if (!seg) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const already = new Set(input.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const matches = allExistingTags().filter(t => t.startsWith(seg) && !already.has(t)).slice(0, 6);
    if (!matches.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = matches.map(t => `<button type="button" class="tag-suggest-item" data-tag="${escapeAttr(t)}">${t}</button>`).join('');
    box.style.display = 'block';
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => { box.style.display = 'none'; }, 150));

  box.addEventListener('click', (e) => {
    const b = e.target.closest('.tag-suggest-item');
    if (!b) return;
    const parts = input.value.split(',');
    parts.pop();
    const prefix = parts.map(s => s.trim()).filter(Boolean);
    prefix.push(b.dataset.tag);
    input.value = prefix.join(', ') + ', ';
    input.focus();
    render();
  });
}

function openDetail(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const status = getStatus(t);
  const completions = [...t.completions].reverse();
  const gaps = [];
  for (let i = 1; i < t.completions.length; i++) gaps.push(diffDays(t.completions[i - 1], t.completions[i]));
  const avg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;

  openModal(`
    <h2>${t.emoji ? t.emoji + ' ' : ''}${t.title}</h2>
    ${t.tags.length ? `<div class="tag-row">${t.tags.map(tag => `<span class="tag-chip" style="background:${colorFor(tag)}">${tag}</span>`).join('')}</div>` : ''}
    <div class="detail-stat-row">
      <div class="stat-box"><div class="num">${t.completions.length ? formatDateHuman(t.completions[t.completions.length - 1]) : '—'}</div><div class="lab">Last done</div></div>
      <div class="stat-box"><div class="num">${scheduleLabel(t)}</div><div class="lab">Schedule</div></div>
      <div class="stat-box"><div class="num">${avg !== null ? avg + 'd' : '—'}</div><div class="lab">Actual avg</div></div>
    </div>
    <button class="btn-primary" id="d-done">${t.completions.includes(todayStr()) ? 'Marked done today ✓' : 'Mark done'}</button>
    <button class="btn-secondary" id="d-edit">Edit</button>
    <p class="section-label" style="margin-top:16px">History (${t.completions.length})</p>
    <div class="history-list">
      ${completions.length ? completions.map(c => `
        <div class="history-item"><span>${formatDateHuman(c)}</span><button data-date="${c}">✕</button></div>
      `).join('') : '<p style="opacity:0.5;font-weight:600;font-size:14px">No completions logged yet.</p>'}
    </div>
  `);

  document.getElementById('d-done').addEventListener('click', () => {
    markDone(t.id);
    closeModal();
  });
  document.getElementById('d-edit').addEventListener('click', () => openForm(t.id));
  modalEl.querySelectorAll('.history-item button').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteCompletion(t.id, btn.dataset.date);
      openDetail(t.id);
    });
  });
}

// ---------- export / import ----------
async function exportData() {
  const json = JSON.stringify(state.tasks, null, 2);
  const filename = `tend-backup-${todayStr()}.json`;
  const file = new File([json], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let incoming;
    try {
      incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error('not an array');
    } catch (e) {
      alert('That file doesn\'t look like a Tend backup.');
      return;
    }
    const existingIds = new Set(state.tasks.map(t => t.id));
    let added = 0;
    incoming.forEach(t => {
      if (t && t.id && !existingIds.has(t.id)) {
        state.tasks.push(t);
        added++;
      }
    });
    mutate(() => {});
    alert(`Imported ${added} item(s). ${incoming.length - added} were already present and skipped.`);
  };
  reader.readAsText(file);
}

document.getElementById('settings-btn').addEventListener('click', () => {
  openModal(`
    <h2>Backup</h2>
    <p style="font-size:14px;font-weight:600;opacity:0.7;margin-top:-8px">Everything is stored only on this device. Export a backup file occasionally, or move data between installs.</p>
    <button class="btn-primary" id="s-export">Export data</button>
    <button class="btn-danger" id="s-import" style="color:var(--ink)">Import data</button>
  `);
  document.getElementById('s-export').addEventListener('click', exportData);
  document.getElementById('s-import').addEventListener('click', () => document.getElementById('import-file').click());
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importData(file);
  e.target.value = '';
  closeModal();
});

render();
