// Shared by the API routes: error type, handler wrapper and input validators.

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
    // A handler must either return a body or respond itself; never leave the request hanging.
    else if (!res.headersSent) throw new Error(`No response from ${req.method} ${req.path}`);
  } catch (err) {
    next(err);
  }
};

/** Same limits as the UI (src/lib/types.ts, maxLength on the inputs). */
export const MAX_NAME = 300;
export const MAX_NOTES = 50_000;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** YYYY-MM-DD that exists on the calendar (rejects 2026-02-30, 2026-13-45, …). */
export function isRealDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Local wall-clock 'YYYY-MM-DDTHH:MM' with a real date and a valid time. */
export function isLocalDateTime(s) {
  if (typeof s !== 'string' || s.length !== 16 || s[10] !== 'T') return false;
  return isRealDate(s.slice(0, 10)) && TIME_RE.test(s.slice(11));
}

/** Positive integer id from a route param, or 404 with `code`. */
export function idParam(value, code) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, code);
  return id;
}

/** Trimmed non-empty string up to `max` chars; throws 400 `code` otherwise. */
export function requiredText(value, max, code, tooLongCode = code) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, code);
  const v = value.trim();
  if (v.length > max) throw new HttpError(400, tooLongCode);
  return v;
}
