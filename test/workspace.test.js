import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, filterTasks, dueSummary, localDateKey, validDate } from '../public/workspace-utils.js';

const date = new Date(2026, 10, 14, 12);
const sample = { tasks: [
  { id: 'a', title: 'Study networks', status: 'open', priority: 'high', dueDate: '2026-11-14' },
  { id: 'b', title: 'Send proposal', status: 'open', priority: 'medium', dueDate: '2026-11-12' },
  { id: 'c', title: 'Read paper', status: 'done', priority: 'low', dueDate: '2026-11-10' },
], notes: [{ id: 'n1', title: 'Research', content: 'Interesting topic', pinned: true }], messages: [], view: 'tasks' };

test('validates actual calendar dates and formats local dates', () => {
  assert.equal(localDateKey(date), '2026-11-14');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-11-14'), true);
});

test('searches tasks and filters due today and overdue without completed tasks', () => {
  assert.deepEqual(filterTasks(sample.tasks, 'today', '', date).map(t => t.id), ['a']);
  assert.deepEqual(filterTasks(sample.tasks, 'overdue', '', date).map(t => t.id), ['b']);
  assert.deepEqual(filterTasks(sample.tasks, 'all', 'NETWORKS', date).map(t => t.id), ['a']);
  assert.deepEqual(dueSummary(sample.tasks, date), { today: 1, overdue: 1 });
});

test('round trips a backup and preserves pinned notes', () => {
  const parsed = parseBackup(buildBackup(sample));
  assert.equal(parsed.tasks.length, 3);
  assert.equal(parsed.notes[0].pinned, true);
  assert.equal(parsed.view, 'tasks');
});

test('rejects unrelated documents and excessive imports', () => {
  assert.throws(() => parseBackup({ workspace: sample }), /supported/);
  const backup = buildBackup(sample);
  backup.workspace.tasks = Array.from({ length: 401 }, (_, i) => ({ id: String(i), title: 'test' }));
  assert.throws(() => parseBackup(backup), /limits/);
});

test('restored assistant messages cannot apply old suggested actions', () => {
  const backup = buildBackup({ ...sample, messages: [
    { id: 'a', role: 'assistant', content: 'Delete a task?', actions: [{ id: 'danger', state: 'pending', type: 'delete', taskId: 'a' }] },
  ] });
  assert.deepEqual(parseBackup(backup).messages[0].actions, []);
});
