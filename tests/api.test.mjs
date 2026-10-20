// API tests for the phase-1 endpoints, against a real server on a fresh temporary database.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { call, startServer, tmpDir } from './helpers.mjs';

let server;
const api = (method, url, body) => call(server.url, method, url, body);

before(async () => {
  server = await startServer(path.join(tmpDir('api'), 'atlas.db'));
});
after(() => server?.stop());

describe('game config', () => {
  test('exposes every seeded value', async () => {
    const { GAME_CONFIG_DEFAULTS } = await import('../server/game/config.js');
    const { status, body } = await api('GET', '/api/game/config');
    assert.equal(status, 200);
    assert.equal(Object.keys(body).length, GAME_CONFIG_DEFAULTS.length);
    assert.equal(body['xp.task.high'], 40);
    assert.equal(body['day.boundary_minutes'], 180);
  });
});

describe('category attributes', () => {
  test('first-run categories get the design suggestions', async () => {
    const { body: cats } = await api('GET', '/api/categories');
    const { body: map } = await api('GET', '/api/category-attributes');
    const byName = Object.fromEntries(map.map((m) => [cats.find((c) => c.id === m.categoryId).name, [m.primary, m.secondary]]));
    assert.deepEqual(byName, {
      'Comp and Rhetoric II': ['SENSE', 'CHA'],
      'Intro CIS': ['INT', null],
      'Physical Science I': ['INT', 'SENSE'],
      psychology: ['SENSE', 'INT'],
    });
  });

  test('set, change, clear and validate', async () => {
    assert.deepEqual((await api('PUT', '/api/category-attributes/2', { primary: 'STR', secondary: 'AGI' })).body, {
      categoryId: 2, primary: 'STR', secondary: 'AGI',
    });
    assert.equal((await api('PUT', '/api/category-attributes/2', { primary: 'VIT' })).body.secondary, null);
    for (const [body, code] of [
      [{ primary: 'LUCK' }, 'invalid_attribute'],
      [{ primary: 'int' }, 'invalid_attribute'],
      [{}, 'invalid_attribute'],
      [{ primary: 'INT', secondary: 'INT' }, 'same_attribute'],
      [{ primary: 'INT', secondary: 3 }, 'invalid_attribute'],
    ]) {
      const r = await api('PUT', '/api/category-attributes/2', body);
      assert.deepEqual([r.status, r.body.error], [400, code], JSON.stringify(body));
    }
    for (const id of ['9999', 'abc', '-1']) {
      assert.equal((await api('PUT', `/api/category-attributes/${id}`, { primary: 'INT' })).status, 404);
    }
    assert.equal((await api('DELETE', '/api/category-attributes/2')).status, 204);
    assert.ok(!(await api('GET', '/api/category-attributes')).body.some((m) => m.categoryId === 2));
  });

  test('a created suggested category is mapped; rename keeps it; delete removes it', async () => {
    const { body: gym } = await api('POST', '/api/categories', { name: 'gym', color: '#E03E3E' });
    const find = async () => (await api('GET', '/api/category-attributes')).body.find((m) => m.categoryId === gym.id);
    assert.deepEqual(await find(), { categoryId: gym.id, primary: 'STR', secondary: 'VIT' });
    await api('PATCH', `/api/categories/${gym.id}`, { name: 'Weights' });
    assert.equal((await find()).primary, 'STR');
    await api('DELETE', `/api/categories/${gym.id}`);
    assert.equal(await find(), undefined);
  });
});

describe('stages', () => {
  const titles = (task) => task.stages.map((s) => `${s.done ? 'x' : '-'}${s.title}`);

  test('create with stages, add, mark, rename, reorder, delete', async () => {
    let { status, body: task } = await api('POST', '/api/tasks', { name: 'With stages', stages: ['A', ' B ', 'C'] });
    assert.equal(status, 201);
    assert.deepEqual(titles(task), ['-A', '-B', '-C']);
    const [a, b, c] = task.stages.map((s) => s.id);

    ({ status, body: task } = await api('POST', `/api/tasks/${task.id}/stages`, { title: 'D' }));
    assert.equal(status, 201);
    const d = task.stages[3].id;

    task = (await api('PATCH', `/api/stages/${a}`, { done: true })).body;
    assert.equal(task.stages[0].done, true);
    assert.ok(task.stages[0].completedAt);
    task = (await api('PATCH', `/api/stages/${a}`, { done: false })).body;
    assert.equal(task.stages[0].completedAt, null);

    task = (await api('PATCH', `/api/stages/${b}`, { title: 'B2', done: true })).body;
    task = (await api('PUT', `/api/tasks/${task.id}/stages/order`, { ids: [d, c, b, a] })).body;
    assert.deepEqual(titles(task), ['-D', '-C', 'xB2', '-A']);
    task = (await api('DELETE', `/api/stages/${c}`)).body;
    assert.deepEqual(titles(task), ['-D', 'xB2', '-A']);
    // Reload shows the same order
    const listed = (await api('GET', '/api/tasks')).body.find((t) => t.id === task.id);
    assert.deepEqual(titles(listed), ['-D', 'xB2', '-A']);
  });

  test('validation', async () => {
    const { body: task } = await api('POST', '/api/tasks', { name: 'V', stages: ['one', 'two'] });
    const [one, two] = task.stages.map((s) => s.id);
    const cases = [
      ['POST', '/api/tasks', { name: 'x', stages: 'a' }, 400, 'invalid_stages'],
      ['POST', '/api/tasks', { name: 'x', stages: [''] }, 400, 'stage_title_required'],
      ['POST', '/api/tasks', { name: 'x', stages: Array(101).fill('s') }, 400, 'too_many_stages'],
      ['POST', `/api/tasks/${task.id}/stages`, { title: 'x'.repeat(201) }, 400, 'stage_title_too_long'],
      ['POST', `/api/tasks/${task.id}/stages`, { title: 5 }, 400, 'stage_title_required'],
      ['POST', '/api/tasks/99999/stages', { title: 'x' }, 404, 'task_not_found'],
      ['PATCH', `/api/stages/${one}`, { done: 'yes' }, 400, 'invalid_stage_done'],
      ['PATCH', `/api/stages/${one}`, { title: '   ' }, 400, 'stage_title_required'],
      ['PATCH', '/api/stages/99999', { done: true }, 404, 'stage_not_found'],
      ['PATCH', '/api/stages/abc', { done: true }, 404, 'stage_not_found'],
      ['PUT', `/api/tasks/${task.id}/stages/order`, { ids: [one] }, 400, 'invalid_stage_order'],
      ['PUT', `/api/tasks/${task.id}/stages/order`, { ids: [one, one] }, 400, 'invalid_stage_order'],
      ['PUT', `/api/tasks/${task.id}/stages/order`, { ids: [one, 99999] }, 400, 'invalid_stage_order'],
      ['PUT', `/api/tasks/${task.id}/stages/order`, { ids: 'x' }, 400, 'invalid_stage_order'],
    ];
    for (const [m, url, body, status, code] of cases) {
      const r = await api(m, url, body);
      assert.deepEqual([r.status, r.body?.error], [status, code], `${m} ${url} ${JSON.stringify(body).slice(0, 60)}`);
    }
    // A failed create inserts nothing
    assert.ok(!(await api('GET', '/api/tasks')).body.some((t) => t.name === 'x'));
    // Order of a different task's stages is rejected
    const other = (await api('POST', '/api/tasks', { name: 'Other', stages: ['z'] })).body;
    assert.equal((await api('PUT', `/api/tasks/${other.id}/stages/order`, { ids: [one, two] })).status, 400);
  });

  test('limit of 100 stages per task, cascade on task delete, sample becomes the user’s', async () => {
    const { body: task } = await api('POST', '/api/tasks', { name: 'Many', stages: Array(100).fill('s') });
    assert.equal(task.stages.length, 100);
    assert.equal((await api('POST', `/api/tasks/${task.id}/stages`, { title: 'one more' })).body.error, 'too_many_stages');
    const stageId = task.stages[0].id;
    assert.equal((await api('DELETE', `/api/tasks/${task.id}`)).status, 204);
    assert.equal((await api('DELETE', `/api/stages/${stageId}`)).status, 404);

    const sample = (await api('GET', '/api/tasks')).body.find((t) => t.isSample);
    const updated = (await api('POST', `/api/tasks/${sample.id}/stages`, { title: 'mine now' })).body;
    assert.equal(updated.isSample, false);
  });
});

describe('appointments', () => {
  const base = { title: 'Dentist', start: '2026-10-22T09:00', end: '2026-10-22T10:00' };

  test('create, read, update, delete', async () => {
    let r = await api('POST', '/api/appointments', { ...base, categoryId: 1, location: 'Clinic', notes: 'bring card' });
    assert.equal(r.status, 201);
    const a = r.body;
    assert.deepEqual(
      [a.title, a.categoryId, a.start, a.end, a.location, a.notes, a.status],
      ['Dentist', 1, '2026-10-22T09:00', '2026-10-22T10:00', 'Clinic', 'bring card', 'planned'],
    );
    r = await api('PATCH', `/api/appointments/${a.id}`, { status: 'attended', start: '2026-10-22T08:30' });
    assert.deepEqual([r.body.status, r.body.start], ['attended', '2026-10-22T08:30']);
    assert.equal((await api('GET', `/api/appointments/${a.id}`)).body.status, 'attended');
    assert.equal((await api('DELETE', `/api/appointments/${a.id}`)).status, 204);
    assert.equal((await api('GET', `/api/appointments/${a.id}`)).status, 404);
    assert.equal((await api('DELETE', `/api/appointments/${a.id}`)).status, 404);
  });

  test('rejects invalid input', async () => {
    const cases = [
      [{ ...base, end: '2026-10-22T08:59' }, 'end_before_start'],
      [{ ...base, end: base.start }, 'end_before_start'],
      [{ ...base, start: '2026-02-30T09:00' }, 'invalid_start'],
      [{ ...base, start: '2026-10-22T24:00' }, 'invalid_start'],
      [{ ...base, start: '2026-10-22 09:00' }, 'invalid_start'],
      [{ ...base, start: 20261022 }, 'invalid_start'],
      [{ ...base, end: '2026-10-22T10:60' }, 'invalid_end'],
      [{ ...base, title: '' }, 'appointment_title_required'],
      [{ ...base, title: 'x'.repeat(201) }, 'appointment_title_too_long'],
      [{ ...base, status: 'done' }, 'invalid_appointment_status'],
      [{ ...base, categoryId: 999 }, 'invalid_category'],
      [{ ...base, categoryId: '1' }, 'invalid_category'],
      [{ ...base, location: { a: 1 } }, 'invalid_location'],
      [{ ...base, location: 'x'.repeat(201) }, 'location_too_long'],
      [{ ...base, notes: 5 }, 'invalid_notes'],
      [{ title: 'x' }, 'invalid_start'],
    ];
    for (const [body, code] of cases) {
      const r = await api('POST', '/api/appointments', body);
      assert.deepEqual([r.status, r.body.error], [400, code], JSON.stringify(body).slice(0, 80));
    }
  });

  test('PATCH checks end > start against the stored values', async () => {
    const { body: a } = await api('POST', '/api/appointments', base);
    assert.equal((await api('PATCH', `/api/appointments/${a.id}`, { end: '2026-10-22T08:00' })).body.error, 'end_before_start');
    assert.equal((await api('PATCH', `/api/appointments/${a.id}`, { start: '2026-10-22T11:00' })).body.error, 'end_before_start');
    const ok = await api('PATCH', `/api/appointments/${a.id}`, { start: '2026-10-22T11:00', end: '2026-10-22T12:00' });
    assert.equal(ok.status, 200);
    await api('DELETE', `/api/appointments/${a.id}`);
  });

  test('range filter, sorting and category delete', async () => {
    const { body: cat } = await api('POST', '/api/categories', { name: 'Temp cat', color: '#123456' });
    const ids = [];
    for (const [start, end] of [
      ['2026-10-23T09:00', '2026-10-23T10:00'],
      ['2026-10-21T18:00', '2026-10-21T19:00'],
      ['2026-10-22T23:30', '2026-10-23T00:30'],
    ]) {
      ids.push((await api('POST', '/api/appointments', { title: start, start, end, categoryId: cat.id })).body.id);
    }
    const all = (await api('GET', '/api/appointments')).body.map((a) => a.start);
    assert.deepEqual(all, [...all].sort(), 'sorted by start');
    const day22 = (await api('GET', '/api/appointments?from=2026-10-22&to=2026-10-22')).body.map((a) => a.start);
    assert.deepEqual(day22, ['2026-10-22T23:30']);
    assert.equal((await api('GET', '/api/appointments?from=2026-13-01')).status, 400);
    await api('DELETE', `/api/categories/${cat.id}`);
    const after = (await api('GET', '/api/appointments')).body.filter((a) => ids.includes(a.id));
    assert.ok(after.every((a) => a.categoryId === null), 'category removed, appointments kept');
  });
});

describe('v1 behaviour is unchanged', () => {
  test('tasks CRUD and validation still work', async () => {
    const { status, body } = await api('POST', '/api/tasks', { name: 'v1', dueDate: '2026-10-22', dueTime: '10:00' });
    assert.equal(status, 201);
    assert.deepEqual(body.stages, []);
    assert.equal((await api('POST', '/api/tasks', { name: 'bad', dueDate: '2026-02-30' })).body.error, 'invalid_date');
    assert.equal((await api('PATCH', `/api/tasks/${body.id}`, { status: 'done' })).body.status, 'done');
    assert.equal((await api('DELETE', `/api/tasks/${body.id}`)).status, 204);
  });

  test('rejects a foreign Host header', async () => {
    // fetch() drops a custom Host header, so use node:http directly.
    const { port } = new URL(server.url);
    const status = await new Promise((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/api/appointments', headers: { Host: 'attacker.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(status, 403);
  });
});
