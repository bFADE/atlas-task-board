import Database from 'better-sqlite3';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIVE_DB = path.join(ROOT, 'data', 'atlas.db');

export const tmpDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `atlas-${name}-`));

/** Consistent copy (includes WAL content) taken through a read-only connection. */
export function snapshot(src, dest) {
  const db = new Database(src, { readonly: true, fileMustExist: true });
  try {
    db.prepare('VACUUM INTO ?').run(dest);
  } finally {
    db.close();
  }
  return dest;
}

/** Imports server/db.js against `dbPath` in a child process (fresh module state), like an app start. */
export function openWithApp(dbPath) {
  return execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(path.join(ROOT, 'server', 'db.js'))});`],
    { env: { ...process.env, ATLAS_DB_PATH: dbPath }, encoding: 'utf8' },
  );
}

/**
 * Builds a database exactly as v1 (branch main) creates it: runs main's server/db.js from a temp
 * folder. Returns the path, or null when git/main isn't available.
 */
export function makeV1Database() {
  let source;
  try {
    source = execFileSync('git', ['show', 'main:server/db.js'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return null;
  }
  const dir = tmpDir('v1');
  fs.mkdirSync(path.join(dir, 'server'));
  fs.writeFileSync(path.join(dir, 'server', 'db.js'), source);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  execFileSync(process.execPath, ['--input-type=module', '-e', "await import('./server/db.js');"], { cwd: dir });
  return path.join(dir, 'data', 'atlas.db');
}

export const tables = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);

export const count = (db, table) => db.prepare(`SELECT COUNT(*) AS c FROM "${table.replace(/"/g, '')}"`).get().c;

/** Starts the API on a free port against `dbPath`; resolves { url, stop }. */
export async function startServer(dbPath) {
  const port = 39000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, ATLAS_DB_PATH: dbPath, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not start:\n${output}`)), 10000);
    child.stdout.on('data', () => {
      if (output.includes('API listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`API exited (${code}):\n${output}`)));
  });
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    output: () => output,
    stop: () => new Promise((r) => { child.once('exit', r); child.kill(); }),
  };
}

/** fetch wrapper returning { status, body } with JSON parsed when possible. */
export async function call(base, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, body: parsed };
}
