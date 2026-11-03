// TEMPORARY diagnostics for the iPhone freeze. Records focus, taps, viewport changes, and any stall of
// the JavaScript thread (a heartbeat that reports a gap). Set ENABLED to false, or delete this folder,
// once the cause is found.
export const ENABLED = true;

const HEARTBEAT_MS = 250;
const STALL_MS = 300;
const MAX_LINES = 200;

const lines: string[] = [];
const subscribers = new Set<() => void>();

const stamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

export const logEvent = (text: string) => {
  lines.push(`${stamp()} ${text}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  subscribers.forEach((s) => s());
};

export const recentLines = (count: number): string[] => lines.slice(-count);

export const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

const describe = (target: EventTarget | null): string => {
  if (!(target instanceof HTMLElement)) return String(target);
  const label = target.getAttribute('aria-label') ?? target.getAttribute('placeholder') ?? target.textContent?.trim().slice(0, 24) ?? '';
  return `<${target.tagName.toLowerCase()}${target.id ? '#' + target.id : ''}> "${label}"`;
};

let started = false;
export const startFreezeLog = () => {
  if (!ENABLED || started) return;
  started = true;

  let last = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const gap = now - last - HEARTBEAT_MS;
    last = now;
    if (gap > STALL_MS) logEvent(`STALL: JS thread did not run for ${Math.round(gap)} ms`);
  }, HEARTBEAT_MS);

  document.addEventListener('pointerdown', (e) => logEvent(`tap ${describe(e.target)}`), true);
  document.addEventListener('focusin', (e) => logEvent(`focus in ${describe(e.target)}`), true);
  document.addEventListener('focusout', (e) => logEvent(`focus out ${describe(e.target)}`), true);
  window.addEventListener('resize', () => logEvent(`window ${window.innerWidth}x${window.innerHeight}`));
  window.visualViewport?.addEventListener('resize', () => {
    const vv = window.visualViewport!;
    logEvent(`visual viewport ${Math.round(vv.width)}x${Math.round(vv.height)} offset ${Math.round(vv.offsetTop)}`);
  });
  logEvent(`started, window ${window.innerWidth}x${window.innerHeight}`);
};
