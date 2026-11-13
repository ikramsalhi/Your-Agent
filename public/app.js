const STORAGE_KEY = 'your-agent:workspace:v1';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validViews = ['overview', 'assistant', 'tasks', 'notes'];
let activeFilter = 'all';
let editingNoteId = null;
let chatBusy = false;
let toastTimeout;

function loadState() {
  const fallback = { tasks: [], notes: [], messages: [], view: 'overview' };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== 'object') return fallback;
    return {
      tasks: Array.isArray(stored.tasks) ? stored.tasks.slice(0, 400) : [],
      notes: Array.isArray(stored.notes) ? stored.notes.slice(0, 200) : [],
      messages: Array.isArray(stored.messages) ? stored.messages.slice(-100) : [],
      view: validViews.includes(stored.view) ? stored.view : 'overview',
    };
  } catch { return fallback; }
}

let state = loadState();
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { toast('Browser storage is full; your last change was not saved.'); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function formatDate(date) {
  if (!date) return 'No due date';
  const value = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(value.getTime())) return 'No due date';
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeNow() { return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function priorityLabel(priority) { return ({ high: 'High', medium: 'Medium', low: 'Low' })[priority] || 'Medium'; }
function sortedTasks(tasks) {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => (a.status === 'done') - (b.status === 'done') || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (b.createdAt || 0) - (a.createdAt || 0));
}
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.classList.remove('show'), 3000);
}
function setView(view) {
  if (!validViews.includes(view)) return;
  state.view = view;
  save();
  $$('.view').forEach((el) => { el.hidden = el.id !== `view-${view}`; });
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.nav === view));
  $('#current-page-title').textContent = ({ overview: 'Overview', assistant: 'AI Assistant', tasks: 'My Tasks', notes: 'Notes' })[view];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderOverview() {
  const open = state.tasks.filter((task) => task.status !== 'done');
  const done = state.tasks.filter((task) => task.status === 'done');
  const high = open.filter((task) => task.priority === 'high');
  $('#stat-all').textContent = state.tasks.length;
  $('#stat-done').textContent = done.length;
  $('#stat-open').textContent = open.length;
  $('#stat-high').textContent = high.length;
  const hour = new Date().getHours();
  $('#greeting').textContent = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
  $('#today-pill').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const focus = sortedTasks(open).slice(0, 4);
  $('#focus-list').innerHTML = focus.length ? focus.map((task) => `
    <label class="focus-row">
      <input type="checkbox" data-toggle-task="${escapeHtml(task.id)}" aria-label="Complete ${escapeHtml(task.title)}" />
      <span class="focus-info"><strong>${escapeHtml(task.title)}</strong><small>${task.dueDate ? `Due ${escapeHtml(formatDate(task.dueDate))}` : 'Whenever you are ready'}</small></span>
      <span class="priority-dot ${escapeHtml(task.priority)}" title="${escapeHtml(priorityLabel(task.priority))} priority"></span>
    </label>`).join('') : `<div class="empty-state"><span class="empty-symbol">✳</span><strong>A fresh start!</strong><p>No active tasks yet. Add a goal and watch your progress grow.</p></div>`;
}
function renderTasks() {
  const openCount = state.tasks.filter((task) => task.status !== 'done').length;
  $('#task-count-pill').textContent = `${openCount} active`;
  const visible = sortedTasks(state.tasks.filter((task) => activeFilter === 'all' || (activeFilter === 'done' ? task.status === 'done' : task.status !== 'done')));
  $$('.filter').forEach((button) => button.classList.toggle('active', button.dataset.filter === activeFilter));
  $('#task-list').innerHTML = visible.length ? visible.map((task) => `
    <div class="task-row">
      <input type="checkbox" data-toggle-task="${escapeHtml(task.id)}" ${task.status === 'done' ? 'checked' : ''} aria-label="Toggle ${escapeHtml(task.title)}" />
      <div class="task-main ${task.status === 'done' ? 'done' : ''}"><strong>${escapeHtml(task.title)}</strong><small>${task.dueDate ? `Due ${escapeHtml(formatDate(task.dueDate))}` : 'No due date'} · ${task.status === 'done' ? 'Completed' : 'Active'}</small></div>
      <span class="priority-tag ${escapeHtml(task.priority)}">${escapeHtml(priorityLabel(task.priority))}</span>
      <button type="button" class="delete-button" data-delete-task="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.title)}">×</button>
    </div>`).join('') : `<div class="empty-list empty-state"><span class="empty-symbol">✓</span><strong>Nothing here yet.</strong><p>${activeFilter === 'all' ? 'Your first task is just a few clicks away.' : 'No tasks match this filter.'}</p></div>`;
}
function renderNotes() {
  $('#note-count-pill').textContent = `${state.notes.length} note${state.notes.length === 1 ? '' : 's'}`;
  $('#notes-grid').innerHTML = state.notes.length ? [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt).map((note) => `
    <article class="note-card"><div class="note-card-top"><span>✎</span><span style="font-size:10px;color:#837e9a">IDEA / NOTE</span></div>
    <h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.content)}</p>
    <div class="note-card-bottom"><span>${escapeHtml(new Date(note.updatedAt || Date.now()).toLocaleDateString())}</span><div class="note-card-buttons"><button type="button" data-edit-note="${escapeHtml(note.id)}">Edit</button><button type="button" data-delete-note="${escapeHtml(note.id)}">Delete</button></div></div></article>`).join('') : `<div class="empty-list empty-state"><span class="empty-symbol">✎</span><strong>Your ideas start here.</strong><p>Write your first note to collect thoughts and inspiration.</p></div>`;
}
function actionDescription(action) {
  const verbs = { create: 'Create task', complete: 'Complete task', reopen: 'Reopen task', delete: 'Delete task' };
  const found = state.tasks.find((task) => task.id === action.taskId);
  return { label: verbs[action.type] || 'Task action', name: action.type === 'create' ? action.title : (found?.title || action.title || 'Task'), extra: action.type === 'create' ? `${priorityLabel(action.priority)} priority${action.dueDate ? ` · Due ${formatDate(action.dueDate)}` : ''}` : 'Review this change' };
}
function renderChat() {
  const list = $('#chat-messages');
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 80;
  $('#chat-suggestions').hidden = state.messages.length > 0;
  if (!state.messages.length) {
    list.innerHTML = `<div class="chat-welcome"><span class="chat-welcome-icon">✦</span><h2>Hi! I'm Your-Agent.</h2><p>Your thinking partner for the days ahead. I can help you brainstorm, plan projects, prioritize tasks, and turn thoughts into action. What are we working on?</p></div>`;
    return;
  }
  list.innerHTML = state.messages.map((message) => `
    <article class="chat-message ${message.role === 'user' ? 'user' : ''}"><span class="message-avatar">${message.role === 'user' ? 'ME' : '✦'}</span><div class="message-body">
      <div class="message-bubble">${escapeHtml(message.content)}</div><div class="message-meta">${message.role === 'user' ? 'You' : 'Your-Agent'} · ${escapeHtml(message.time || '')}</div>
      ${Array.isArray(message.actions) && message.actions.length ? `<div class="action-cards">${message.actions.map((action) => {
        const desc = actionDescription(action);
        return `<div class="action-card"><div class="action-content"><strong>${escapeHtml(desc.label)}: ${escapeHtml(desc.name)}</strong><small>${escapeHtml(desc.extra)}</small></div>${action.state === 'pending' ? `<button type="button" data-apply-action="${escapeHtml(action.id)}">Apply</button><button type="button" class="dismiss" data-dismiss-action="${escapeHtml(action.id)}">×</button>` : `<button disabled class="applied">${action.state === 'applied' ? '✓ Applied' : 'Dismissed'}</button>`}</div>`;
      }).join('')}</div>` : ''}
    </div></article>`).join('') + (chatBusy ? `<div class="chat-message"><span class="message-avatar">✦</span><div class="message-bubble">Thinking through that... ✦</div></div>` : '');
  if (atBottom || chatBusy) list.scrollTop = list.scrollHeight;
}
function renderAll() { renderOverview(); renderTasks(); renderNotes(); renderChat(); }

function toggleTask(taskId, explicitDone) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const done = typeof explicitDone === 'boolean' ? explicitDone : task.status !== 'done';
  task.status = done ? 'done' : 'open';
  task.updatedAt = Date.now();
  save(); renderAll(); toast(done ? 'Nice work! Task completed ✨' : 'Task moved back to active');
}
function createTask(title, priority = 'medium', dueDate = '') {
  const task = { id: id(), title: title.trim().slice(0, 160), priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium', dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : '', status: 'open', createdAt: Date.now() };
  if (!task.title) return false;
  state.tasks.push(task); save(); renderAll(); return true;
}
function removeTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  save(); renderAll();
}
function findAction(actionId) {
  for (const message of state.messages) {
    const action = message.actions?.find((item) => item.id === actionId);
    if (action) return action;
  }
  return null;
}
function applyAction(actionId) {
  const action = findAction(actionId);
  if (!action || action.state !== 'pending') return;
  if (action.type === 'create') {
    if (!createTask(action.title, action.priority, action.dueDate)) return toast('Cannot create an empty task.');
  } else {
    const task = state.tasks.find((item) => item.id === action.taskId);
    if (!task) return toast('This task no longer exists.');
    if (action.type === 'delete') removeTask(action.taskId);
    else toggleTask(action.taskId, action.type === 'complete');
  }
  action.state = 'applied';
  save(); renderAll(); toast('AI suggestion applied ✓');
}
function dismissAction(actionId) {
  const action = findAction(actionId);
  if (!action) return;
  action.state = 'dismissed'; save(); renderChat();
}
async function checkConnection() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('server unavailable');
    const { aiConfigured } = await response.json();
    const badge = $('#connection-badge');
    badge.classList.toggle('ready', aiConfigured);
    badge.lastChild.textContent = aiConfigured ? ' AI ready' : ' Setup needed';
    badge.title = aiConfigured ? 'AI chat is configured' : 'Set OPENAI_API_KEY in .env to enable AI chat';
  } catch {
    $('#connection-badge').lastChild.textContent = ' Offline';
  }
}
async function sendChat(text) {
  const content = text.trim();
  if (!content || chatBusy) return;
  $('#chat-input').value = '';
  chatBusy = true;
  $('#send-chat').disabled = true;
  state.messages.push({ id: id(), role: 'user', content: content.slice(0, 3000), time: timeNow() });
  save(); renderChat();
  const payload = {
    messages: state.messages.slice(-20).map((message) => ({ role: message.role, content: message.content })),
    tasks: state.tasks.slice(0, 100).map(({ id, title, priority, status, dueDate }) => ({ id, title, priority, status, dueDate })),
    notes: state.notes.slice(0, 20).map(({ title, content }) => ({ title, content: content.slice(0, 1000) })),
  };
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The assistant could not respond.');
    const actions = Array.isArray(data.actions) ? data.actions.map((action) => ({ ...action, id: id(), state: 'pending' })) : [];
    state.messages.push({ id: id(), role: 'assistant', content: data.reply, time: timeNow(), actions });
  } catch (error) {
    state.messages.push({ id: id(), role: 'assistant', content: `I couldn't complete your request. ${error.message || 'Please try again.'}`, time: timeNow() });
  } finally {
    chatBusy = false;
    $('#send-chat').disabled = false;
    save(); renderChat();
    $('#chat-input').focus();
  }
}

// Navigation and action delegation
// Using event delegation keeps newly rendered buttons interactive without attaching duplicate listeners.
document.addEventListener('click', (event) => {
  const navigation = event.target.closest('[data-nav]');
  if (navigation) { event.preventDefault(); setView(navigation.dataset.nav); return; }
  const quickPrompt = event.target.closest('[data-prompt]');
  if (quickPrompt) { setView('assistant'); sendChat(quickPrompt.dataset.prompt); return; }
  const deleteTaskButton = event.target.closest('[data-delete-task]');
  if (deleteTaskButton) { removeTask(deleteTaskButton.dataset.deleteTask); toast('Task deleted'); return; }
  const filter = event.target.closest('[data-filter]');
  if (filter) { activeFilter = filter.dataset.filter; renderTasks(); return; }
  const apply = event.target.closest('[data-apply-action]');
  if (apply) { applyAction(apply.dataset.applyAction); return; }
  const dismiss = event.target.closest('[data-dismiss-action]');
  if (dismiss) { dismissAction(dismiss.dataset.dismissAction); return; }
  const editNote = event.target.closest('[data-edit-note]');
  if (editNote) {
    const note = state.notes.find((item) => item.id === editNote.dataset.editNote);
    if (!note) return;
    editingNoteId = note.id;
    $('#note-title').value = note.title;
    $('#note-content').value = note.content;
    $('#note-form-title').textContent = 'Edit your note';
    $('#save-note-button').textContent = 'Save changes ↗';
    $('#cancel-edit-note').hidden = false;
    setView('notes'); $('#note-title').focus(); return;
  }
  const deleteNote = event.target.closest('[data-delete-note]');
  if (deleteNote) {
    state.notes = state.notes.filter((item) => item.id !== deleteNote.dataset.deleteNote);
    if (editingNoteId === deleteNote.dataset.deleteNote) clearNoteEditor();
    save(); renderNotes(); toast('Note deleted');
  }
});
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-toggle-task]')) toggleTask(event.target.dataset.toggleTask, event.target.checked);
});

$('#task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (createTask($('#task-title').value, $('#task-priority').value, $('#task-date').value)) {
    $('#task-form').reset(); toast('Task added! You’ve got this ✨');
  }
});
function clearNoteEditor() {
  editingNoteId = null;
  $('#note-form').reset();
  $('#note-form-title').textContent = 'Write something down';
  $('#save-note-button').textContent = 'Save note ↗';
  $('#cancel-edit-note').hidden = true;
}
$('#cancel-edit-note').addEventListener('click', clearNoteEditor);
$('#note-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('#note-title').value.trim();
  const content = $('#note-content').value.trim();
  if (!title || !content) return;
  if (editingNoteId) {
    const note = state.notes.find((item) => item.id === editingNoteId);
    if (note) Object.assign(note, { title, content, updatedAt: Date.now() });
  } else state.notes.push({ id: id(), title, content, updatedAt: Date.now() });
  save(); renderNotes(); clearNoteEditor(); toast('Note saved ✨');
});
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); sendChat($('#chat-input').value); });
$('#chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat($('#chat-input').value); }
});
$('#clear-chat').addEventListener('click', () => {
  state.messages = [];
  save(); renderChat();
  toast('New conversation started');
});

renderAll();
setView(state.view);
checkConnection();
