// Pure workspace helpers: shared by browser UI and Node's built-in test runner.
export const BACKUP_FORMAT = 'your-agent-workspace';
export const BACKUP_VERSION = 1;
const MAX_TASKS = 400;
const MAX_NOTES = 200;
const MAX_MESSAGES = 100;
const priorities = new Set(['low', 'medium', 'high']);
const validViews = new Set(['overview', 'assistant', 'tasks', 'notes']);

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeId(value) {
  return clean(value, 80);
}

export function localDateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid date');
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

export function dueSummary(tasks, now = new Date()) {
  const today = localDateKey(now);
  return tasks.reduce((counts, task) => {
    if (task.status !== 'done' && validDate(task.dueDate)) {
      if (task.dueDate === today) counts.today++;
      else if (task.dueDate < today) counts.overdue++;
    }
    return counts;
  }, { today: 0, overdue: 0 });
}

export function filterTasks(tasks, filter = 'all', query = '', now = new Date()) {
  const search = String(query).trim().toLocaleLowerCase();
  const today = localDateKey(now);
  return tasks.filter((task) => {
    if (search && !String(task.title || '').toLocaleLowerCase().includes(search)) return false;
    switch (filter) {
      case 'open': return task.status !== 'done';
      case 'done': return task.status === 'done';
      case 'today': return task.status !== 'done' && task.dueDate === today;
      case 'overdue': return task.status !== 'done' && validDate(task.dueDate) && task.dueDate < today;
      default: return true;
    }
  });
}

export function buildBackup(workspace) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: {
      tasks: workspace.tasks,
      notes: workspace.notes,
      messages: workspace.messages,
      view: workspace.view,
    },
  };
}

export function parseBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION) {
    throw new Error('This is not a supported Your-Agent backup.');
  }
  const workspace = data.workspace;
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace) ||
      !Array.isArray(workspace.tasks) || !Array.isArray(workspace.notes) ||
      !Array.isArray(workspace.messages) ||
      workspace.tasks.length > MAX_TASKS || workspace.notes.length > MAX_NOTES ||
      workspace.messages.length > MAX_MESSAGES) {
    throw new Error('Backup is invalid or exceeds the supported limits.');
  }
  const taskIds = new Set();
  const tasks = [];
  for (const task of workspace.tasks) {
    const id = safeId(task?.id);
    const title = clean(task?.title, 160);
    if (!id || !title || taskIds.has(id)) continue;
    taskIds.add(id);
    tasks.push({
      id, title,
      priority: priorities.has(task.priority) ? task.priority : 'medium',
      status: task.status === 'done' ? 'done' : 'open',
      dueDate: validDate(task.dueDate) ? task.dueDate : '',
      createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now(),
      updatedAt: Number.isFinite(task.updatedAt) ? task.updatedAt : Date.now(),
    });
  }
  const noteIds = new Set();
  const notes = [];
  for (const note of workspace.notes) {
    const id = safeId(note?.id);
    const title = clean(note?.title, 100);
    const content = clean(note?.content, 5000);
    if (!id || !title || !content || noteIds.has(id)) continue;
    noteIds.add(id);
    notes.push({
      id, title, content, pinned: note.pinned === true,
      updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.now(),
    });
  }
  const messages = workspace.messages.flatMap((message) => {
    if (!message || !['user', 'assistant'].includes(message.role)) return [];
    const content = clean(message.content, 6000);
    if (!content) return [];
    return [{
      id: safeId(message.id) || 'imported-' + messages.length,
      role: message.role, content, time: clean(message.time, 40),
      // A restored backup must never re-enable old, unreviewed AI actions.
      actions: [],
    }];
  });
  return { tasks, notes, messages, view: validViews.has(workspace.view) ? workspace.view : 'overview' };
}
