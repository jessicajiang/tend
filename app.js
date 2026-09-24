// ---------- storage ----------
const STORAGE_KEY = 'loop.tasks.v1';

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tasks = raw ? JSON.parse(raw) : seedTasks();
    pruneExpiredSnoozes(tasks);
    return tasks;
  } catch (e) {
    return seedTasks();
  }
}

function pruneExpiredSnoozes(tasks) {
  const today = todayStr();
  tasks.forEach(t => {
    if (t.snoozedUntil && t.snoozedUntil <= today) t.snoozedUntil = null;
  });
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
  if (task.type === 'daily') {
    const doneToday = task.completions.includes(today);
    return { due: false, next: doneToday ? addInterval(today, { value: 1, unit: 'day' }) : today };
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
  if (task.type === 'daily') return 'Daily';
  if (task.type === 'fixed') {
    if (task.weekdays.length === 7) return 'Every day';
    return 'Every ' + task.weekdays.map(w => WEEKDAY_NAMES[w]).join(', ');
  }
  const { value, unit } = task.interval;
  if (value === 1) return `Every ${unit}`;
  return `Every ${value} ${unit}s`;
}

function metaLabel(task, status) {
  if (task.type === 'daily') {
    return task.completions.includes(todayStr()) ? 'Done today' : 'Not yet today';
  }
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
  [['sunscreen', 'spf', 'skincare', 'skin'], '🧴'],
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
  statsCalOffset: 0,
  statsWeekOffset: 0,
  statsTapped: null,
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
    t.prevPin = null;
    if (t.pin) {
      if (t.type === 'freeform') {
        if (t.pin === 'queued') t.pin = 'progress';
      } else {
        t.prevPin = t.pin;
        t.pin = null;
      }
    }
  }
  mutate(() => {});
}

function unmarkDone(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const today = todayStr();
  if (t.prevPin && t.completions.includes(today)) t.pin = t.prevPin;
  t.prevPin = null;
  t.completions = t.completions.filter(c => c !== today);
  mutate(() => {});
}

// ---------- pins (queued / in progress) ----------
function setPin(taskId, pin) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.pin = pin;
  if (pin) t.snoozedUntil = null;
  mutate(() => {});
}

function applyPinAction(task, action) {
  if (action === 'queue' || action === 'back') setPin(task.id, 'queued');
  else if (action === 'progress') setPin(task.id, 'progress');
  else if (action === 'unpin') setPin(task.id, null);
  else if (action === 'finish') {
    if (task.type !== 'freeform' && !task.completions.includes(todayStr())) markDone(task.id);
    else setPin(task.id, null);
  }
}

function deleteCompletion(taskId, dateStr) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.completions = t.completions.filter(c => c !== dateStr);
  mutate(() => {});
}

function editCompletionDate(taskId, oldDate, newDate) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.completions = t.completions.filter(c => c !== oldDate && c !== newDate);
  t.completions.push(newDate);
  t.completions.sort();
  mutate(() => {});
}

function setArchived(taskId, archived) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.archived = archived;
  if (archived) t.pin = null;
  if (t.type === 'daily') {
    const periods = t.dailyPeriods = t.dailyPeriods || [];
    if (archived) periods.forEach(p => { if (!p.to) p.to = todayStr(); });
    else periods.push({ from: todayStr(), to: null });
  }
  mutate(() => {});
}

// ---------- dailies ----------
function dailiesOn(dateStr) {
  return state.tasks
    .filter(t => t.type === 'daily')
    .filter(t => (t.dailyPeriods || []).some(p => p.from <= dateStr && (!p.to || dateStr < p.to)) || t.completions.includes(dateStr))
    .map(t => ({ task: t, done: t.completions.includes(dateStr) }));
}

function dailiesProgress(dateStr) {
  const list = dailiesOn(dateStr);
  return { list, total: list.length, done: list.filter(x => x.done).length };
}

function dailiesStreak() {
  const d = parseISO(todayStr());
  let streak = 0;
  const p0 = dailiesProgress(toISODate(d));
  if (p0.total > 0 && p0.done === p0.total) streak++;
  for (let i = 0; i < 3650; i++) {
    d.setDate(d.getDate() - 1);
    const p = dailiesProgress(toISODate(d));
    if (p.total === 0 || p.done < p.total) break;
    streak++;
  }
  return streak;
}

function dailyDotOpacity(p) {
  return p.done === p.total ? 1 : 0.2 + 0.5 * (p.done / p.total);
}

function isSnoozed(task) {
  return !!(task.snoozedUntil && task.snoozedUntil > todayStr());
}

function setSnooze(taskId, dateStr) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.snoozedUntil = dateStr;
  mutate(() => {});
}

function nextWeekendDate() {
  const d = parseISO(todayStr());
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== 6);
  return toISODate(d);
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

// ---------- swipe-to-archive ----------
const SWIPE_ACTION_WIDTH = 84;
let openSwipeEl = null;

function closeSwipe(wrapper) {
  if (!wrapper) return;
  wrapper.classList.remove('swiped');
  wrapper.querySelector('.card').style.transform = '';
  if (openSwipeEl === wrapper) openSwipeEl = null;
}

const LONG_PRESS_MS = 500;

function attachSwipeToArchive(wrapper, cardEl, task) {
  let startX = 0, startY = 0, baseX = 0, dragging = false, decided = false, isHorizontal = false;
  let longPressTimer = null, longPressFired = false;
  const canSnooze = task.type !== 'daily' && !task.archived;

  function clearLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    cardEl.classList.remove('longpress-active');
  }

  cardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    baseX = wrapper.classList.contains('swiped') ? -SWIPE_ACTION_WIDTH : 0;
    dragging = true;
    decided = false;
    isHorizontal = false;
    longPressFired = false;
    if (canSnooze) {
      cardEl.classList.add('longpress-active');
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        dragging = false;
        clearLongPress();
        openCardSheet(task);
      }, LONG_PRESS_MS);
    }
  });

  cardEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      decided = true;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
      clearLongPress();
      if (!isHorizontal) { dragging = false; return; }
    }
    if (!isHorizontal) return;
    const next = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, baseX + dx));
    cardEl.style.transition = 'none';
    cardEl.style.transform = `translateX(${next}px)`;
  });

  function endDrag(e) {
    clearLongPress();
    if (!dragging || !isHorizontal) { dragging = false; return; }
    dragging = false;
    const dx = e.clientX - startX;
    const finalX = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, baseX + dx));
    cardEl.style.transition = '';
    if (finalX < -SWIPE_ACTION_WIDTH / 2) {
      if (openSwipeEl && openSwipeEl !== wrapper) closeSwipe(openSwipeEl);
      cardEl.style.transform = `translateX(${-SWIPE_ACTION_WIDTH}px)`;
      wrapper.classList.add('swiped');
      openSwipeEl = wrapper;
    } else {
      closeSwipe(wrapper);
    }
  }
  cardEl.addEventListener('pointerup', endDrag);
  cardEl.addEventListener('pointercancel', endDrag);

  // guard: swiped-open or a long-press just fired -> a tap just resolves that, not opening detail
  cardEl.addEventListener('click', (e) => {
    if (longPressFired) {
      e.stopImmediatePropagation();
      return;
    }
    if (wrapper.classList.contains('swiped')) {
      e.stopImmediatePropagation();
      closeSwipe(wrapper);
    }
  });

  const actionBtn = document.createElement('button');
  actionBtn.className = 'swipe-action-btn' + (task.archived ? ' unarchive' : ' archive');
  actionBtn.textContent = task.archived ? 'Unarchive' : 'Archive';
  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setArchived(task.id, !task.archived);
  });
  const actions = document.createElement('div');
  actions.className = 'card-swipe-actions' + (task.archived ? ' unarchive' : ' archive');
  actions.appendChild(actionBtn);
  wrapper.appendChild(actions);
}

function taskCard(task, status) {
  const el = document.createElement('div');
  el.className = 'card';
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.style.background = colorFor(task.tags[0] || task.title);
  badge.textContent = task.emoji || task.title[0].toUpperCase();
  el.appendChild(badge);

  if (task.archived) el.classList.add('archived');
  if (task.pin && !task.archived) el.classList.add(task.pin === 'progress' ? 'pin-progress' : 'pin-queued');

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = task.title;
  const meta = document.createElement('p');
  meta.className = 'card-meta' + (status.due && status.overdueDays > 0 ? ' overdue' : '');
  meta.textContent = task.archived ? 'Archived · ' + scheduleLabel(task) : metaLabel(task, status) + ' · ' + scheduleLabel(task);
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
  if (!task.archived && isSnoozed(task)) {
    const tag = document.createElement('span');
    tag.className = 'snoozed-tag';
    tag.textContent = `😴 Snoozed until ${formatDateHuman(task.snoozedUntil)}`;
    body.appendChild(tag);
  }
  if (task.pin && !task.archived) {
    const chip = document.createElement('span');
    chip.className = 'pin-chip ' + (task.pin === 'progress' ? 'progress' : 'queued');
    chip.textContent = task.pin === 'progress' ? 'In progress' : 'Queued';
    body.appendChild(chip);
  }
  el.appendChild(body);

  if (!task.archived) {
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
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'card-swipe';
  attachSwipeToArchive(wrapper, el, task);
  el.addEventListener('click', () => openDetail(task.id));
  wrapper.appendChild(el);
  return wrapper;
}

function buildDailiesRow() {
  const p = dailiesProgress(todayStr());
  if (!p.total) return null;
  const streak = dailiesStreak();
  const chip = streak > 0 ? `<span class="streak">🔥 ${streak}</span>` : '';
  const el = document.createElement('div');
  if (p.done === p.total) {
    el.className = 'dailies-slim';
    el.innerHTML = `<span>☀️ Dailies done ✓</span>${chip}`;
  } else {
    el.className = 'dailies-card';
    const segs = Array.from({ length: p.total }, (_, i) => `<div class="seg-pill${i < p.done ? ' on' : ''}"></div>`).join('');
    el.innerHTML = `<div class="d-top"><span class="d-title">☀️ Dailies</span>${chip}</div><div class="segs">${segs}</div><div class="d-sub"><span>${p.done} of ${p.total}</span><span>›</span></div>`;
  }
  el.addEventListener('click', openDailiesSheet);
  return el;
}

function openDailiesSheet() {
  const today = todayStr();
  function render() {
    const p = dailiesProgress(today);
    if (!p.total) { closeModal(); return; }
    const streak = dailiesStreak();
    openModal(`
      <h2 id="dailies-sheet">☀️ Dailies</h2>
      <p class="dailies-sub">${streak > 0 ? `🔥 ${streak}-day streak · ` : ''}${p.done === p.total ? 'All done!' : `${p.done} of ${p.total} today`}</p>
      ${p.list.map(({ task, done }) => `<div class="daily-row${done ? ' on' : ''}" data-id="${task.id}"><div class="chk">${done ? '✓' : ''}</div><span class="lbl">${task.emoji ? task.emoji + ' ' : ''}${task.title}</span></div>`).join('')}
    `);
    modalEl.querySelectorAll('.daily-row').forEach(row => row.addEventListener('click', () => {
      const t = state.tasks.find(x => x.id === row.dataset.id);
      if (!t) return;
      t.completions.includes(today) ? unmarkDone(t.id) : markDone(t.id);
      render();
      setTimeout(() => {
        const q = dailiesProgress(today);
        if (q.total && q.done === q.total && document.getElementById('dailies-sheet')) closeModal();
      }, 700);
    }));
  }
  render();
}

function renderDue() {
  viewEl.innerHTML = '';
  const dailiesRow = buildDailiesRow();
  if (dailiesRow) viewEl.appendChild(dailiesRow);
  const pinned = state.tasks.filter(t => !t.archived && t.type !== 'daily' && t.pin);
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  pinned.filter(t => t.pin === 'progress').sort(byTitle).forEach(t => viewEl.appendChild(taskCard(t, getStatus(t))));
  pinned.filter(t => t.pin === 'queued').sort(byTitle).forEach(t => viewEl.appendChild(taskCard(t, getStatus(t))));

  const due = state.tasks
    .filter(t => !t.archived && !t.pin && !isSnoozed(t))
    .map(t => ({ t, status: getStatus(t) }))
    .filter(x => x.status.due)
    .sort((a, b) => a.status.next.localeCompare(b.status.next));

  if (!due.length) {
    if (!pinned.length) viewEl.appendChild(emptyState('All caught up! 🎉', 'Nothing due right now.'));
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
    .sort((a, b) => {
      if (!!a.t.archived !== !!b.t.archived) return a.t.archived ? 1 : -1;
      return (a.status.next || '9999-99-99').localeCompare(b.status.next || '9999-99-99');
    });
  rows.forEach(({ t, status }) => viewEl.appendChild(taskCard(t, status)));
}

function renderFree() {
  viewEl.innerHTML = '';
  const freeform = state.tasks.filter(t => t.type === 'freeform');
  if (!freeform.length) {
    viewEl.appendChild(emptyState('Nothing here yet', 'Add something you do as-needed, like a hobby or craft.'));
    return;
  }
  const rows = freeform.slice().sort((a, b) => {
    if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
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
    b.addEventListener('click', () => {
      state.statsPeriod = days;
      state.statsTapped = null;
      render();
    });
    toggle.appendChild(b);
  });
  viewEl.appendChild(toggle);

  if (state.statsPeriod === 7) {
    viewEl.appendChild(buildBarSection(null, state.statsWeekOffset, state.statsTapped,
      (offset) => { state.statsWeekOffset = offset; state.statsTapped = null; render(); },
      (dateStr) => { state.statsTapped = state.statsTapped === dateStr ? null : dateStr; render(); }
    ));
  } else {
    viewEl.appendChild(buildCalendarSection(null, state.statsCalOffset, state.statsTapped,
      (offset) => { state.statsCalOffset = offset; state.statsTapped = null; render(); },
      (dateStr) => { state.statsTapped = state.statsTapped === dateStr ? null : dateStr; render(); }
    ));
  }

  const cutoff = toISODate(new Date(Date.now() - state.statsPeriod * 86400000));
  const counts = {};
  state.tasks.forEach(t => {
    if (t.type === 'daily') return;
    const tags = t.tags.length ? t.tags : ['untagged'];
    const n = t.completions.filter(c => c >= cutoff).length;
    if (!n) return;
    tags.forEach(tag => { counts[tag] = (counts[tag] || 0) + n; });
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    const anyDaily = state.tasks.some(t => t.type === 'daily' && t.completions.some(c => c >= cutoff));
    if (!anyDaily) viewEl.appendChild(emptyState('No activity in this period', 'Complete a few things to see stats here.'));
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

// ---------- calendar / bar views (shared by overview stats and tag detail) ----------
function completionsForDate(dateStr, tagFilter) {
  const items = [];
  state.tasks.forEach(t => {
    if (t.type === 'daily') return;
    const tags = t.tags.length ? t.tags : ['untagged'];
    if (tagFilter && !tags.includes(tagFilter)) return;
    if (t.completions.includes(dateStr)) items.push({ task: t, tags });
  });
  return items;
}

function dailiesForOverview(dateStr, tagFilter) {
  if (tagFilter) return null;
  const p = dailiesProgress(dateStr);
  return p.done > 0 ? p : null;
}

function popoverHTML(dateStr, tagFilter) {
  const items = completionsForDate(dateStr, tagFilter);
  const dp = dailiesForOverview(dateStr, tagFilter);
  if (!items.length && !dp) return '';
  const dailyRows = dp ? `<div class="daily-head">☀️ Dailies · ${dp.done} of ${dp.total}</div>` + dp.list.map(({ task, done }) =>
    `<div class="item${done ? '' : ' missed'}" data-task-id="${task.id}"><span class="swatch daily-swatch"></span>${task.emoji ? task.emoji + ' ' : ''}${task.title}<span class="mark">${done ? '✓' : '–'}</span></div>`
  ).join('') : '';
  const rows = items.map(({ task, tags }) => {
    const color = colorFor(tagFilter || tags[0]);
    const tagLabel = tagFilter ? '' : ` <span style="opacity:0.5;font-weight:600">· ${tags[0]}</span>`;
    return `<div class="item" data-task-id="${task.id}"><span class="swatch" style="background:${color}"></span>${task.emoji ? task.emoji + ' ' : ''}${task.title}${tagLabel}</div>`;
  }).join('');
  return `<div class="popover"><div class="date">${formatDateHuman(dateStr)}</div>${dailyRows}${rows}</div>`;
}

function wirePopoverClicks(container) {
  container.querySelectorAll('.popover .item[data-task-id]').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.taskId));
  });
}

function monthOffsetDate(monthsBack) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return d;
}

function weekOffsetStart(weeksBack) {
  const d = new Date();
  d.setDate(d.getDate() - weeksBack * 7);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function buildCalendarSection(tagFilter, monthsBack, tappedDate, onNav, onTapDay) {
  const base = monthOffsetDate(monthsBack);
  const year = base.getFullYear(), month = base.getMonth();
  const monthLabel = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const card = document.createElement('div');
  card.className = 'cal-card';

  const header = document.createElement('div');
  header.className = 'cal-header';
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.addEventListener('click', () => onNav(monthsBack + 1));
  const monthSpan = document.createElement('span');
  monthSpan.className = 'month';
  monthSpan.textContent = monthLabel;
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.disabled = monthsBack <= 0;
  nextBtn.addEventListener('click', () => onNav(Math.max(0, monthsBack - 1)));
  header.append(prevBtn, monthSpan, nextBtn);
  card.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  WEEKDAY_LABELS.forEach(l => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = l;
    grid.appendChild(el);
  });
  for (let i = 0; i < startPad; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }
  for (let dnum = 1; dnum <= daysInMonth; dnum++) {
    const dateStr = toISODate(new Date(year, month, dnum));
    const items = completionsForDate(dateStr, tagFilter);
    const el = document.createElement('div');
    el.className = 'cal-day' + (dateStr === today ? ' today' : '') + (dateStr === tappedDate ? ' tapped' : '');
    const dp = dailiesForOverview(dateStr, tagFilter);
    const dotList = (dp ? [`<span class="dot daily-dot" style="opacity:${dailyDotOpacity(dp)}"></span>`] : [])
      .concat(items.map(({ tags }) => `<span class="dot" style="background:${colorFor(tagFilter || tags[0])}"></span>`))
      .slice(0, 4);
    el.innerHTML = `${dnum}` + (dotList.length ? `<div class="dots">${dotList.join('')}</div>` : '');
    if (dotList.length) el.addEventListener('click', () => onTapDay(dateStr));
    grid.appendChild(el);
  }
  card.appendChild(grid);

  if (tappedDate) {
    const pop = popoverHTML(tappedDate, tagFilter);
    if (pop) { card.insertAdjacentHTML('beforeend', pop); wirePopoverClicks(card); }
  }

  return card;
}

function buildBarSection(tagFilter, weeksBack, tappedDate, onNav, onTapDay) {
  const start = weekOffsetStart(weeksBack);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(toISODate(d));
  }
  const today = todayStr();

  const card = document.createElement('div');
  card.className = 'bar-card';

  const header = document.createElement('div');
  header.className = 'cal-header';
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.addEventListener('click', () => onNav(weeksBack + 1));
  const label = document.createElement('span');
  label.className = 'month';
  label.textContent = `${formatDateHuman(dates[0])} – ${formatDateHuman(dates[6])}`;
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.disabled = weeksBack <= 0;
  nextBtn.addEventListener('click', () => onNav(Math.max(0, weeksBack - 1)));
  header.append(prevBtn, label, nextBtn);
  card.appendChild(header);

  const chart = document.createElement('div');
  chart.className = 'bar-chart';
  dates.forEach((dateStr, i) => {
    const items = completionsForDate(dateStr, tagFilter);
    const col = document.createElement('div');
    col.className = 'bar-col';
    const dp = dailiesForOverview(dateStr, tagFilter);
    const hasBars = items.length > 0 || !!dp;
    const stack = document.createElement('div');
    stack.className = 'bar-stack' + (hasBars ? ' has-bars' : '') + (dateStr === tappedDate ? ' tapped-bar' : '');
    stack.style.height = (items.length * 24 + (dp ? 8 : 0)) + 'px';
    items.forEach(({ tags }) => {
      const seg = document.createElement('div');
      seg.className = 'bar-seg';
      seg.style.height = '24px';
      seg.style.background = colorFor(tagFilter || tags[0]);
      stack.appendChild(seg);
    });
    if (dp) {
      const seg = document.createElement('div');
      seg.className = 'bar-seg daily-seg';
      seg.style.height = '8px';
      seg.style.opacity = dailyDotOpacity(dp);
      stack.appendChild(seg);
    }
    if (hasBars) stack.addEventListener('click', () => onTapDay(dateStr));
    const dow = document.createElement('span');
    dow.className = 'bar-dow' + (dateStr === today ? ' today' : '');
    dow.textContent = WEEKDAY_LABELS[i];
    col.append(stack, dow);
    chart.appendChild(col);
  });
  card.appendChild(chart);

  if (tappedDate) {
    const pop = popoverHTML(tappedDate, tagFilter);
    if (pop) { card.insertAdjacentHTML('beforeend', pop); wirePopoverClicks(card); }
  }

  return card;
}

// ---------- tag detail ----------
function openTagDetail(tag) {
  let monthsBack = 0;
  let tapped = null;

  function renderBody() {
    const tasksWithTag = state.tasks.filter(t => t.type !== 'daily' && (t.tags.length ? t.tags : ['untagged']).includes(tag));
    const ranked = tasksWithTag
      .map(t => ({ t, count: t.completions.length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count);

    openModal(`
      <h2><span style="color:${colorFor(tag)}">●</span> ${tag}</h2>
      <div id="tag-cal-slot"></div>
      <p class="section-label">Most done</p>
      ${ranked.length ? `<div class="history-list">${ranked.map(({ t, count }) => `
        <div class="history-item" data-task-id="${t.id}"><span>${t.emoji ? t.emoji + ' ' : ''}${t.title}</span><span>${count}×</span></div>
      `).join('')}</div>` : '<p style="opacity:0.5;font-weight:600;font-size:14px">No completions logged yet.</p>'}
    `);
    document.getElementById('tag-cal-slot').appendChild(buildCalendarSection(tag, monthsBack, tapped,
      (offset) => { monthsBack = offset; tapped = null; renderBody(); },
      (dateStr) => { tapped = tapped === dateStr ? null : dateStr; renderBody(); }
    ));
    modalEl.querySelectorAll('.history-list .history-item[data-task-id]').forEach(el => {
      el.addEventListener('click', () => openDetail(el.dataset.taskId));
    });
  }

  renderBody();
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
        <button type="button" data-val="daily" class="${type === 'daily' ? 'active' : ''}">Daily</button>
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
    <div id="f-daily" class="field" style="${type === 'daily' ? '' : 'display:none'}">
      <p style="font-size:12px;opacity:0.6;font-weight:600;margin:0">Part of your Dailies checklist. Resets every day, never shows as overdue, and earns one calendar dot once you finish the whole set.</p>
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
    document.getElementById('f-daily').style.display = b.dataset.val === 'daily' ? '' : 'none';
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
      const wasDaily = editing.type === 'daily';
      editing.type = selType;
      if (selType === 'daily' && !wasDaily && !editing.archived) {
        editing.dailyPeriods = (editing.dailyPeriods || []).concat([{ from: todayStr(), to: null }]);
      } else if (selType !== 'daily' && wasDaily) {
        (editing.dailyPeriods || []).forEach(p => { if (!p.to) p.to = todayStr(); });
      }
      editing.interval = { value: intervalValue, unit: intervalUnit };
      editing.weekdays = weekdays;
    } else {
      state.tasks.push({
        id: uid(), title, emoji, tags, type: selType,
        interval: { value: intervalValue, unit: intervalUnit },
        weekdays, completions: [], createdAt: todayStr(), archived: false,
        dailyPeriods: selType === 'daily' ? [{ from: todayStr(), to: null }] : [],
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

function buildDatePickerCalendar(monthsForward, minDateStr, onNav, onPick) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthsForward);
  const year = base.getFullYear(), month = base.getMonth();
  const monthLabel = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const card = document.createElement('div');
  card.className = 'cal-card';

  const header = document.createElement('div');
  header.className = 'cal-header';
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.disabled = monthsForward <= 0;
  prevBtn.addEventListener('click', () => onNav(Math.max(0, monthsForward - 1)));
  const monthSpan = document.createElement('span');
  monthSpan.className = 'month';
  monthSpan.textContent = monthLabel;
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.addEventListener('click', () => onNav(monthsForward + 1));
  header.append(prevBtn, monthSpan, nextBtn);
  card.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  WEEKDAY_LABELS.forEach(l => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = l;
    grid.appendChild(el);
  });
  for (let i = 0; i < startPad; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }
  for (let dnum = 1; dnum <= daysInMonth; dnum++) {
    const dateStr = toISODate(new Date(year, month, dnum));
    const disabled = dateStr < minDateStr;
    const el = document.createElement('div');
    el.className = 'cal-day' + (disabled ? ' disabled' : '');
    el.textContent = String(dnum);
    if (!disabled) el.addEventListener('click', () => onPick(dateStr));
    grid.appendChild(el);
  }
  card.appendChild(grid);
  return card;
}

function pinOptionsHTML(task) {
  const opt = (action, label, when, cls) => `<button class="snooze-option ${cls || ''}" data-pin-action="${action}"><span>${label}</span><span class="when">${when}</span></button>`;
  if (!task.pin) return opt('queue', 'Queue it', 'for later', 'q') + opt('progress', 'Mark in progress', "I'm on it now", 'ip');
  if (task.pin === 'queued') return opt('progress', 'Mark in progress', 'moves up', 'ip') + opt('unpin', 'Unqueue', 'drop the pin');
  return opt('finish', 'Finished', 'clears the pin', 'fin') + opt('back', 'Back to queue', 'paused', 'q') + opt('unpin', 'Unpin', 'drop it');
}

function pinRowHTML(t) {
  if (t.archived || t.type === 'daily') return '';
  const btn = (action, label, cls) => `<button class="btn-secondary ${cls || ''}" data-pin-action="${action}">${label}</button>`;
  if (!t.pin) return `<div class="btn-row">${btn('queue', 'Queue', 'q')}${btn('progress', 'In progress', 'ip')}</div>`;
  if (t.pin === 'queued') return `<div class="btn-row">${btn('progress', 'In progress', 'ip')}${btn('unpin', 'Unqueue')}</div>`;
  return `<div class="btn-row">${btn('finish', 'Finished', 'fin')}${btn('back', 'Back to queue', 'q')}</div>`;
}

function openCardSheet(task) {
  const scheduled = task.type !== 'freeform';
  const tomorrow = addInterval(todayStr(), { value: 1, unit: 'day' });
  const weekend = nextWeekendDate();
  const nextWeek = addInterval(todayStr(), { value: 7, unit: 'day' });
  let showCustom = false;
  let monthsForward = 0;

  function render() {
    const head = `<h2>${task.emoji ? task.emoji + ' ' : ''}${task.title}</h2>`;
    if (!showCustom) {
      const sub = task.pin === 'progress' ? 'In progress' : task.pin === 'queued' ? 'Queued' : (scheduled ? 'Pin it, or snooze it out of Due' : 'Pin it to Due');
      const snoozeBlock = scheduled && !task.pin ? `
        <p class="section-label" style="margin:16px 0 8px">Snooze until</p>
        <button class="snooze-option" data-date="${tomorrow}"><span>Tomorrow</span><span class="when">${formatDateHuman(tomorrow)}</span></button>
        <button class="snooze-option" data-date="${weekend}"><span>This weekend</span><span class="when">${formatDateHuman(weekend)}</span></button>
        <button class="snooze-option" data-date="${nextWeek}"><span>Next week</span><span class="when">${formatDateHuman(nextWeek)}</span></button>
        <button class="snooze-option custom" id="snooze-custom"><span>Pick a date…</span><span class="when">📅</span></button>` : '';
      openModal(`${head}<p style="font-size:13px;font-weight:600;opacity:0.6;margin-top:-8px">${sub}</p>${pinOptionsHTML(task)}${snoozeBlock}`);
      modalEl.querySelectorAll('[data-pin-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          applyPinAction(task, btn.dataset.pinAction);
          closeModal();
        });
      });
      modalEl.querySelectorAll('.snooze-option[data-date]').forEach(btn => {
        btn.addEventListener('click', () => {
          setSnooze(task.id, btn.dataset.date);
          closeModal();
        });
      });
      const custom = document.getElementById('snooze-custom');
      if (custom) custom.addEventListener('click', () => { showCustom = true; render(); });
    } else {
      openModal(`${head}<p style="font-size:13px;font-weight:600;opacity:0.6;margin-top:-8px">Pick a date to snooze until</p><div id="snooze-cal-slot"></div>`);
      document.getElementById('snooze-cal-slot').appendChild(
        buildDatePickerCalendar(monthsForward, tomorrow,
          (offset) => { monthsForward = offset; render(); },
          (dateStr) => { setSnooze(task.id, dateStr); closeModal(); }
        )
      );
    }
  }

  render();
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
    ${t.archived ? '' : `<button class="btn-primary" id="d-done">${t.completions.includes(todayStr()) ? 'Marked done today ✓' : 'Mark done'}</button>`}
    <button class="btn-secondary" id="d-edit">Edit</button>
    ${pinRowHTML(t)}
    ${t.archived
      ? '<button class="btn-primary" id="d-unarchive">Unarchive</button>'
      : '<button class="btn-secondary" id="d-archive">Archive</button>'}
    <p class="section-label" style="margin-top:16px">History (${t.completions.length})</p>
    <div class="history-list">
      ${completions.length ? completions.map(c => `
        <div class="history-item"><input type="date" class="history-date-input" value="${c}" data-date="${c}"><button data-date="${c}">✕</button></div>
      `).join('') : '<p style="opacity:0.5;font-weight:600;font-size:14px">No completions logged yet.</p>'}
    </div>
  `);

  if (!t.archived) {
    document.getElementById('d-done').addEventListener('click', () => {
      markDone(t.id);
      closeModal();
    });
  }
  document.getElementById('d-edit').addEventListener('click', () => openForm(t.id));
  modalEl.querySelectorAll('[data-pin-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPinAction(t, btn.dataset.pinAction);
      closeModal();
    });
  });
  const archiveBtn = document.getElementById(t.archived ? 'd-unarchive' : 'd-archive');
  archiveBtn.addEventListener('click', () => {
    setArchived(t.id, !t.archived);
    closeModal();
  });
  modalEl.querySelectorAll('.history-item button').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteCompletion(t.id, btn.dataset.date);
      openDetail(t.id);
    });
  });
  modalEl.querySelectorAll('.history-date-input').forEach(input => {
    input.addEventListener('change', () => {
      if (input.value) editCompletionDate(t.id, input.dataset.date, input.value);
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
