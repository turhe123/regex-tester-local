// app.js — Regex Tester with Explanation (ES module).
// Matching runs in worker.js and is killed after TIMEOUT_MS; the explanation comes from explain.js.
// Nothing leaves the device: no network calls except the fixture that window.__demo loads.
import { toast, downloadBlob, formatBytes, wireDropzone } from './site.js';
import { explain } from './explain.js';

const SAMPLE = `Support log, week 11 (fictional data)
[2026-03-14 09:12] order 4821 shipped to Lena Ortiz
[2026-03-14 10:47] ticket 377 opened by Marco Bellini: parcel arrived damaged
[2026-03-15 08:05] order 4822 refunded to Priya Halden, amount 59.90
[2026-03-15 14:22] order 4830 shipped to Tomas Reyes, label color #3fa7c2
[2026-03-16 11:58] contact updated for Lena Ortiz: lena.ortiz@example.test
[2026-03-17 16:30] order 4835 delayed, new ETA 2026-03-21, badge #f90
`;

const TIMEOUT_MS = 1000;
const MAX_HIGHLIGHT = 2000;
const MAX_ROWS = 500;
const MAX_SPLIT = 300;
const MAX_PREVIEW = 100_000;
const LONG_TEXT = 300_000;
const MAX_FILE = 20 * 1024 * 1024;
const FLAGS = ['g', 'i', 'm', 's', 'u', 'y'];
const FLAG_INFO = {
  g: 'global: find every match, not just the first',
  i: 'ignore case: A and a are the same',
  m: 'multiline: ^ and $ match at the start and end of every line',
  s: 'dotAll: . also matches line breaks',
  u: 'unicode: count by code points, allow \\p{…}, \\u{…} and emoji',
  y: 'sticky: each match must start exactly where the previous one ended',
};
const TEXT_EXT = /\.(txt|log|csv|tsv|json|md|markdown|xml|html?|ya?ml|srt|vtt|js|mjs|ts|css|ini|conf|cfg|env|sql|sh|py|rb|go|rs|java|c|h|cpp)$/i;

const READY = [
  { label: 'Email-like', pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', flags: 'g' },
  { label: 'Dates', pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', flags: 'g', replace: '$<day>/$<month>/$<year>' },
  { label: 'Hex colors', pattern: '#(?:[0-9a-fA-F]{3}){1,2}\\b', flags: 'g' },
  { label: 'Order numbers', pattern: 'order (\\d+)', flags: 'gi', replace: 'Order #$1' },
  { label: 'Names', pattern: '\\b([A-Z][a-z]+) ([A-Z][a-z]+)\\b', flags: 'g', replace: '$2, $1' },
];

// [token shown, text to insert before the selection, text after it, description, target]
const CHEAT = [
  ['Character classes', [
    ['.', '.', '', 'any character except a line break'],
    ['\\d', '\\d', '', 'a digit 0-9'], ['\\D', '\\D', '', 'not a digit'],
    ['\\w', '\\w', '', 'letter, digit or underscore'], ['\\W', '\\W', '', 'not a word character'],
    ['\\s', '\\s', '', 'whitespace'], ['\\S', '\\S', '', 'not whitespace'],
    ['[abc]', '[', ']', 'one of the listed characters'], ['[^abc]', '[^', ']', 'any character not listed'],
    ['[a-z]', '[a-z', ']', 'a character in a range'], ['\\p{L}', '\\p{L}', '', 'any letter (u flag)'],
  ]],
  ['Anchors', [
    ['^', '^', '', 'start of text (or line with m)'], ['$', '$', '', 'end of text (or line with m)'],
    ['\\b', '\\b', '', 'word boundary'], ['\\B', '\\B', '', 'not a word boundary'],
  ]],
  ['Quantifiers', [
    ['*', '*', '', 'zero or more'], ['+', '+', '', 'one or more'], ['?', '?', '', 'optional'],
    ['{3}', '{3}', '', 'exactly 3'], ['{2,}', '{2,}', '', '2 or more'], ['{2,5}', '{2,5}', '', 'between 2 and 5'],
    ['+?', '+?', '', 'lazy: as few as possible'],
  ]],
  ['Groups and lookarounds', [
    ['(…)', '(', ')', 'capture group'], ['(?:…)', '(?:', ')', 'group without capturing'],
    ['(?<name>…)', '(?<name>', ')', 'named capture group'], ['a|b', '|', '', 'either a or b'],
    ['\\1', '\\1', '', 'same text as group 1'], ['\\k<name>', '\\k<name>', '', 'same text as a named group'],
    ['(?=…)', '(?=', ')', 'followed by'], ['(?!…)', '(?!', ')', 'not followed by'],
    ['(?<=…)', '(?<=', ')', 'preceded by'], ['(?<!…)', '(?<!', ')', 'not preceded by'],
  ]],
  ['Escapes', [
    ['\\.', '\\.', '', 'a literal dot'], ['\\t', '\\t', '', 'tab'], ['\\n', '\\n', '', 'line feed'],
    ['\\u{1F600}', '\\u{1F600}', '', 'a code point (u flag)'],
  ]],
  ['Replacement', [
    ['$1', '$1', '', 'text of group 1', 'replace'], ['$<name>', '$<name>', '', 'text of a named group', 'replace'],
    ['$&', '$&', '', 'the whole match', 'replace'], ['$`', '$`', '', 'text before the match', 'replace'],
    ["$'", "$'", '', 'text after the match', 'replace'], ['$$', '$$', '', 'a literal $', 'replace'],
  ]],
];

const $ = (id) => document.getElementById(id);
const els = {
  pattern: $('pattern'), patternBox: $('pattern-box'), patternError: $('pattern-error'), flagsText: $('flags-text'),
  text: $('text'), highlights: $('highlights'), textHint: $('text-hint'), hl: $('hl'),
  progress: $('progress'), results: $('results'), summary: $('summary'), fileAlert: $('file-alert'), runAlert: $('run-alert'),
  matches: $('panel-matches'), explain: $('panel-explain'), split: $('panel-split'),
  replace: $('replace'), replaceOutput: $('replace-output'),
  downloadReplaced: $('download-replaced'), copyReplaced: $('copy-replaced'), downloadCsv: $('download-csv'),
  ready: $('ready'), cheat: $('cheat'), cheatBody: $('cheat-body'), cheatOpen: $('cheat-open'), cheatClose: $('cheat-close'),
  share: $('share'), copyLiteral: $('copy-literal'),
};
const flagBoxes = Object.fromEntries(FLAGS.map((f) => [f, $(`flag-${f}`)]));

const HAS_D = (() => { try { new RegExp('', 'd'); return true; } catch { return false; } })();
const HAS_LOOKBEHIND = (() => { try { new RegExp('(?<=a)b'); return true; } catch { return false; } })();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : (word.endsWith('ch') ? 'es' : 's')}`;

let worker = null;
let jobId = 0;
let busy = false;
let killTimer = 0;
let progressTimer = 0;
let debounce = 0;
let last = null; // { job, res } of the latest finished run

function getFlags() {
  return FLAGS.filter((f) => flagBoxes[f].checked).join('');
}

function setFlags(flags) {
  for (const f of FLAGS) flagBoxes[f].checked = flags.includes(f);
}

function alertHTML(kind, html) {
  return `<div class="alert alert--${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${html}</div>`;
}

/* ---------- Highlight layer ---------- */

function groupHTML(text, m, end) {
  const spans = m.g.filter((g) => g && g.s >= 0 && g.e > g.s).sort((a, b) => a.s - b.s || b.e - a.e);
  let out = '';
  let pos = m.i;
  for (const g of spans) {
    if (g.s < pos || g.e > end) continue; // nested, or inside a lookaround outside the match
    out += esc(text.slice(pos, g.s)) + `<span class="hl-g">${esc(text.slice(g.s, g.e))}</span>`;
    pos = g.e;
  }
  return out + esc(text.slice(pos, end));
}

// Offsets are UTF-16 code units, the same unit the RegExp engine and String#slice use.
function highlightHTML(text, matches) {
  let out = '';
  let pos = 0;
  matches.forEach((m, k) => {
    if (m.i < pos) return;
    out += esc(text.slice(pos, m.i));
    if (!m.t.length) {
      out += '<mark class="hl-m hl-zero"></mark>';
      pos = m.i;
      return;
    }
    const end = m.i + m.t.length;
    out += `<mark class="hl-m hl-m${k % 2}">${groupHTML(text, m, end)}</mark>`;
    pos = end;
  });
  // The trailing space lets a final empty line take up room, like it does in the textarea.
  return out + esc(text.slice(pos)) + ' ';
}

function setHighlights(html) {
  els.highlights.innerHTML = html;
  syncBackdrop();
}

function syncBackdrop() {
  const ta = els.text;
  els.highlights.style.width = `${ta.clientWidth}px`;
  els.highlights.style.height = `${ta.clientHeight}px`;
  els.highlights.scrollTop = ta.scrollTop;
  els.highlights.scrollLeft = ta.scrollLeft;
}

/* ---------- Running the pattern ---------- */

function schedule() {
  clearTimeout(debounce);
  debounce = setTimeout(run, 80);
}

function updateTextHint(text) {
  const long = text.length > LONG_TEXT ? ` · long text: only the first ${MAX_HIGHLIGHT.toLocaleString('en-US')} matches are highlighted` : '';
  els.textHint.textContent = `${plural(text.length, 'character')} (UTF-16 code units)${long}`;
}

function run() {
  const source = els.pattern.value;
  const flags = getFlags();
  const text = els.text.value; // textareas already normalize line endings to \n, so offsets match what you see
  els.flagsText.textContent = flags;
  updateTextHint(text);
  renderExplain(source, flags);
  try {
    new RegExp(source, flags);
  } catch (err) {
    stopWorker();
    showPatternError(err.message, source);
    return;
  }
  clearPatternError();
  startJob({ source, flags, text, replacement: els.replace.value });
}

// Ends the current job; a worker that is still busy is terminated, since that is the only way to stop a RegExp.
function stopWorker() {
  clearTimeout(killTimer);
  clearTimeout(progressTimer);
  els.progress.hidden = true;
  if (busy && worker) { worker.terminate(); worker = null; }
  busy = false;
}

function startJob(job) {
  stopWorker();
  if (!worker) worker = new Worker('./worker.js');
  const id = ++jobId;
  busy = true;
  worker.onmessage = (e) => {
    if (e.data.id !== id) return;
    busy = false; // finished normally: keep the worker for the next job
    stopWorker();
    if (e.data.error) showPatternError(e.data.error, job.source);
    else render(job, e.data);
  };
  worker.onerror = (e) => {
    e.preventDefault();
    busy = false;
    worker = null;
    stopWorker();
    showRunFailure(`The matcher stopped unexpectedly: ${esc(e.message || 'unknown error')}`);
  };
  progressTimer = setTimeout(() => { els.progress.hidden = false; }, 150);
  killTimer = setTimeout(() => {
    if (id !== jobId) return;
    worker.terminate();
    worker = null;
    busy = false;
    clearTimeout(progressTimer);
    els.progress.hidden = true;
    renderTimeout(job);
  }, TIMEOUT_MS);
  worker.postMessage({ id, ...job, useD: HAS_D, maxDetail: MAX_HIGHLIGHT, maxSplit: MAX_SPLIT });
}

function clearOutputs(note) {
  last = null;
  setHighlights(highlightHTML(els.text.value, []));
  els.matches.innerHTML = `<p class="field__hint">${note}</p>`;
  els.split.innerHTML = `<p class="field__hint">${note}</p>`;
  els.replaceOutput.textContent = '';
  setOutputButtons(false);
}

function showPatternError(message, source) {
  let hint = '';
  if (/\(\?<[=!]/.test(source) && !HAS_LOOKBEHIND) hint = ' This browser does not support lookbehind (?<= …) or (?<! …); older Safari versions lack it.';
  els.patternError.textContent = message + hint;
  els.patternError.hidden = false;
  els.patternBox.classList.add('is-invalid');
  els.pattern.setAttribute('aria-invalid', 'true');
  els.summary.innerHTML = '<span class="rx-count stat--danger">Invalid pattern</span><span class="rx-meta">nothing was matched</span>';
  els.runAlert.innerHTML = alertHTML('error', `The pattern is not valid JavaScript regex, so nothing was matched. The engine says: <code>${esc(message)}</code>${esc(hint)}`);
  clearOutputs('Fix the pattern to see matches.');
}

function clearPatternError() {
  els.patternError.hidden = true;
  els.patternError.textContent = '';
  els.patternBox.classList.remove('is-invalid');
  els.pattern.removeAttribute('aria-invalid');
}

function showRunFailure(html) {
  els.summary.innerHTML = '<span class="rx-count stat--danger">No result</span>';
  els.runAlert.innerHTML = alertHTML('error', html);
  clearOutputs('No result.');
}

function renderTimeout(job) {
  els.summary.innerHTML = `<span class="rx-count stat--warn">Stopped after ${TIMEOUT_MS / 1000} s</span><span class="rx-meta">the page is still yours, edit the pattern to try again</span>`;
  els.runAlert.innerHTML = alertHTML('warn', `<strong>This pattern may be too slow.</strong> Matching <code>${esc(toLiteral(job.source, job.flags))}</code> against this text took longer than ${TIMEOUT_MS / 1000} second, so it was stopped. This is usually catastrophic backtracking from nested quantifiers such as <code>(a+)+</code> or overlapping alternatives such as <code>(a|a)*</code>. Make the inner part more specific or anchor it.`);
  clearOutputs('Matching was stopped because it took too long.');
}

function setOutputButtons(on) {
  els.downloadReplaced.disabled = !on;
  els.copyReplaced.disabled = !on;
  els.downloadCsv.disabled = !on || !last || !last.res.matches.length;
}

/* ---------- Rendering results ---------- */

function valueHTML(v) {
  if (v === '') return '<em class="rx-empty">(empty)</em>';
  const cut = v.length > 200 ? v.slice(0, 200) : v;
  return `<code class="rx-val">${esc(cut)}</code>${cut !== v ? '<span class="rx-pos">…</span>' : ''}`;
}

function groupItem(label, g) {
  if (!g) return `<li><span class="rx-gname">${esc(label)}</span> <em class="rx-empty">did not take part</em></li>`;
  const pos = g.s >= 0 ? ` <span class="rx-pos">${g.s}–${g.e}</span>` : '';
  return `<li><span class="rx-gname">${esc(label)}</span> ${valueHTML(g.v)}${pos}</li>`;
}

function renderMatches(res) {
  if (!res.matches.length) {
    els.matches.innerHTML = '<p class="field__hint">No match in the test text.</p>';
    return;
  }
  const rows = res.matches.slice(0, MAX_ROWS).map((m, k) => {
    const items = m.g.map((g, gi) => groupItem(`$${gi + 1}`, g));
    if (m.n) for (const [name, g] of Object.entries(m.n)) items.push(groupItem(name, g));
    const groups = items.length ? `<ul class="rx-groups">${items.join('')}</ul>` : '<span class="rx-pos">no groups</span>';
    return `<tr class="rx-row"><td class="rx-num">${k + 1}</td><td class="rx-index">${m.i}</td><td class="rx-len">${m.t.length}</td><td class="rx-text">${valueHTML(m.t)}</td><td class="rx-gcell">${groups}</td></tr>`;
  }).join('');
  const more = res.total > MAX_ROWS ? `<p class="field__hint">Listing the first ${MAX_ROWS.toLocaleString('en-US')} of ${plural(res.total, 'match')}.</p>` : '';
  const fallback = res.hasIndices ? '' : '<p class="field__hint">This browser has no d flag, so group positions are not shown.</p>';
  els.matches.innerHTML = `<div class="table-wrap rx-table-wrap"><table class="rx-table" id="match-table">
    <thead><tr><th scope="col">#</th><th scope="col">Index</th><th scope="col">Length</th><th scope="col">Match</th><th scope="col">Groups</th></tr></thead>
    <tbody>${rows}</tbody></table></div>${more}${fallback}`;
}

function renderSplit(res) {
  const items = res.split.map((p) => `<li>${p === undefined ? '<em class="rx-empty">undefined</em>' : valueHTML(p)}</li>`).join('');
  const more = res.splitTotal > res.split.length ? `<p class="field__hint">Showing the first ${res.split.length} of ${res.splitTotal.toLocaleString('en-US')} parts.</p>` : '';
  els.split.innerHTML = `<p class="field__hint"><code>text.split(${esc(toLiteral(last.job.source, last.job.flags))})</code> gives ${plural(res.splitTotal, 'part')}. Capture groups are included between the parts.</p>
    <ol class="rx-split">${items}</ol>${more}`;
}

function renderReplace(res) {
  const out = res.replaced;
  els.replaceOutput.textContent = out.length > MAX_PREVIEW ? out.slice(0, MAX_PREVIEW) + `\n… (preview cut at ${MAX_PREVIEW.toLocaleString('en-US')} characters, the download has everything)` : out;
}

function render(job, res) {
  last = { job, res };
  els.runAlert.innerHTML = '';
  setHighlights(highlightHTML(job.text, res.matches));
  const ms = res.matchMs < 1 ? '<1 ms' : `${Math.round(res.matchMs)} ms`;
  const capped = res.total > MAX_HIGHLIGHT ? `<span class="rx-meta stat--warn">highlighting the first ${MAX_HIGHLIGHT.toLocaleString('en-US')} only</span>` : '';
  const noG = !job.flags.includes('g') && res.total ? '<span class="rx-meta">g is off, so only the first match counts</span>' : '';
  els.summary.innerHTML = `<span class="rx-count" id="match-count">${plural(res.total, 'match')}</span>${capped}${noG}<span class="rx-meta"><code>${esc(toLiteral(job.source, job.flags))}</code> · ${ms}</span>`;
  renderMatches(res);
  renderSplit(res);
  renderReplace(res);
  setOutputButtons(true);
}

const KIND_LABEL = { literal: 'literal', class: 'class', anchor: 'anchor', group: 'group', look: 'lookaround', quant: 'quantifier', alt: 'alternation', escape: 'escape', error: 'problem' };

function renderExplain(source, flags) {
  if (!source) {
    els.explain.innerHTML = '<p class="field__hint">An empty pattern matches the empty string at every position.</p>';
    return;
  }
  const rows = explain(source, flags);
  const list = rows.map((r) => `<li class="k-${r.kind}" style="--depth:${Math.min(r.depth, 6)}"><code>${esc(r.token)}</code><span><span class="rx-kind">${KIND_LABEL[r.kind]}</span> ${esc(r.desc)}</span></li>`).join('');
  const flagList = flags ? `<ul class="rx-flaglist">${[...flags].map((f) => `<li><code>${f}</code> ${esc(FLAG_INFO[f])}</li>`).join('')}</ul>` : '<p class="field__hint">No flags: only the first match is found and case matters.</p>';
  els.explain.innerHTML = `<p class="field__hint">Read top to bottom. Indented rows belong to the group above them. This explains the JavaScript (ECMAScript) flavor.</p>
    <ol class="rx-explain">${list}</ol><h3 class="rx-subtitle">Flags</h3>${flagList}`;
}

/* ---------- Copy, share, download ---------- */

function toLiteral(src, flags) {
  if (!src) return `/(?:)/${flags}`;
  let out = '';
  let inClass = false;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '\\') { out += c + (src[k + 1] ?? ''); k++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    out += c === '/' && !inClass ? '\\/' : c;
  }
  return `/${out}/${flags}`;
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    const back = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (back && back.focus) back.focus();
    toast(ok ? okMessage : 'Copy is blocked here, select the text and copy it by hand');
  }
}

function copyLiteral() {
  const lit = toLiteral(els.pattern.value, getFlags());
  copyText(lit, `Copied ${lit.length > 60 ? lit.slice(0, 60) + '…' : lit}`);
}

function shareLink() {
  const params = new URLSearchParams({ p: els.pattern.value, f: getFlags() });
  if (els.replace.value) params.set('r', els.replace.value);
  const url = `${location.origin}${location.pathname}#${params.toString()}`;
  copyText(url, 'Link copied: the pattern sits after #, which browsers never send to a server');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv() {
  if (!last || !last.res.matches.length) return;
  const { matches, total } = last.res;
  const groupCount = Math.max(0, ...matches.map((m) => m.g.length));
  const names = [...new Set(matches.flatMap((m) => (m.n ? Object.keys(m.n) : [])))];
  const head = ['match', 'index', 'length', 'text', ...Array.from({ length: groupCount }, (_, k) => `group${k + 1}`), ...names];
  const lines = [head.map(csvCell).join(',')];
  matches.forEach((m, k) => {
    const cells = [k + 1, m.i, m.t.length, m.t, ...Array.from({ length: groupCount }, (_, g) => m.g[g]?.v), ...names.map((n) => m.n?.[n]?.v)];
    lines.push(cells.map(csvCell).join(','));
  });
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, 'matches.csv');
  toast(total > matches.length ? `Saved the first ${matches.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} matches (${formatBytes(blob.size)})` : `Saved matches.csv (${formatBytes(blob.size)})`);
}

function downloadReplaced() {
  if (!last) return;
  const blob = new Blob([last.res.replaced], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'replaced.txt');
  toast(`Saved replaced.txt (${formatBytes(blob.size)})`);
}

/* ---------- Files ---------- */

function isText(file) {
  return file.type.startsWith('text/') || /json|xml|yaml|javascript|csv/.test(file.type) || TEXT_EXT.test(file.name);
}

async function handleFiles(files) {
  const good = [];
  const problems = [];
  for (const f of files) {
    if (!isText(f)) problems.push(`${esc(f.name)} is not a text file (${esc(f.type || 'unknown type')})`);
    else if (f.size > MAX_FILE) problems.push(`${esc(f.name)} is ${formatBytes(f.size)}, over the ${formatBytes(MAX_FILE)} limit`);
    else good.push(f);
  }
  els.fileAlert.innerHTML = problems.length ? alertHTML('error', `Skipped: ${problems.join('; ')}. Only plain text files such as .txt, .log, .csv or .json can be tested.`) : '';
  if (!good.length) { reveal(); return; }
  const texts = await Promise.all(good.map((f) => f.text()));
  els.text.value = texts.join('\n');
  els.text.scrollTop = 0;
  toast(`Loaded ${good.length === 1 ? good[0].name : `${good.length} files`} (${formatBytes(good.reduce((n, f) => n + f.size, 0))}), nothing was uploaded`);
  run();
  reveal();
}

function reveal() {
  requestAnimationFrame(() => els.summary.scrollIntoView({ block: 'nearest' }));
}

/* ---------- Cheat sheet, ready patterns, tabs ---------- */

// The cheat sheet keeps focus, so remember where the caret was in each field when it last had focus.
const carets = new WeakMap();
function trackCaret(el) {
  const save = () => carets.set(el, [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]);
  for (const t of ['blur', 'input', 'keyup', 'mouseup', 'select']) el.addEventListener(t, save);
}

function insertToken(target, open, close) {
  const el = target === 'replace' ? els.replace : els.pattern;
  const [s, e] = (carets.get(el) || [el.value.length, el.value.length]).map((n) => Math.min(n, el.value.length));
  const sel = el.value.slice(s, e);
  el.value = el.value.slice(0, s) + open + sel + close + el.value.slice(e);
  const caret = s + open.length + sel.length;
  el.setSelectionRange(caret, caret);
  carets.set(el, [caret, caret]);
  toast(`Inserted ${open + sel + close} into the ${target === 'replace' ? 'replacement' : 'pattern'}`);
  schedule();
}

function buildCheat() {
  const html = CHEAT.map(([title, items]) => `<h4>${esc(title)}</h4><ul>${items.map(([tok, open, close, desc, target = 'pattern'], k) =>
    `<li><button type="button" data-open="${esc(open)}" data-close="${esc(close)}" data-target="${target}"><code>${esc(tok)}</code><span>${esc(desc)}</span></button></li>`).join('')}</ul>`).join('');
  els.cheatBody.insertAdjacentHTML('beforeend', html);
  els.cheatBody.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-open]');
    if (b) insertToken(b.dataset.target, b.dataset.open, b.dataset.close);
  });
}

function closeCheat() {
  if (!els.cheat.open) return;
  els.cheat.close();
  els.cheatOpen.setAttribute('aria-expanded', 'false');
  els.cheatOpen.focus();
}

function buildReady() {
  READY.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--small btn--ghost rx-chip';
    b.textContent = r.label;
    b.title = toLiteral(r.pattern, r.flags);
    b.addEventListener('click', () => applyPattern(r));
    els.ready.appendChild(b);
  });
}

function applyPattern({ pattern, flags, replace }) {
  els.pattern.value = pattern;
  setFlags(flags);
  if (replace !== undefined) els.replace.value = replace;
  run();
  reveal();
}

function wireTabs() {
  const tabs = [...document.querySelectorAll('#results [role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(k + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

/* ---------- Wiring ---------- */

function readHash() {
  if (!location.hash.startsWith('#')) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has('p')) return false;
  els.pattern.value = params.get('p');
  setFlags((params.get('f') || '').replace(/[^gimsuy]/g, ''));
  if (params.has('r')) els.replace.value = params.get('r');
  return true;
}

function init() {
  buildReady();
  buildCheat();
  wireTabs();
  els.text.value = SAMPLE;
  if (!readHash()) {
    els.pattern.value = 'order (\\d+)';
    els.replace.value = 'Order #$1';
  }

  trackCaret(els.pattern);
  trackCaret(els.replace);
  els.pattern.addEventListener('input', schedule);
  els.text.addEventListener('input', schedule);
  els.replace.addEventListener('input', schedule);
  for (const f of FLAGS) flagBoxes[f].addEventListener('change', run);
  els.text.addEventListener('scroll', syncBackdrop);
  new ResizeObserver(syncBackdrop).observe(els.text);

  els.hl.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  els.hl.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { e.preventDefault(); handleFiles(files); }
  });
  wireDropzone($('dropzone'), $('file-input'), handleFiles);

  els.copyLiteral.addEventListener('click', copyLiteral);
  els.share.addEventListener('click', shareLink);
  els.downloadReplaced.addEventListener('click', downloadReplaced);
  els.downloadCsv.addEventListener('click', downloadCsv);
  els.copyReplaced.addEventListener('click', () => last && copyText(last.res.replaced, 'Replaced text copied'));
  els.cheatOpen.setAttribute('aria-expanded', 'false');
  els.cheatOpen.addEventListener('click', () => {
    if (els.cheat.open) { closeCheat(); return; }
    els.cheat.show();
    els.cheatOpen.setAttribute('aria-expanded', 'true');
    els.cheatClose.focus();
  });
  els.cheatClose.addEventListener('click', closeCheat);
  els.cheat.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeCheat(); } });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      copyLiteral();
      return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      els.pattern.focus();
      els.pattern.select();
    }
  });

  run();
}

init();

// Called by the factory's screenshot script: loads the fictional support log and shows a finished result.
window.__demo = async () => {
  const res = await fetch('./tests/fixtures/support-log.txt');
  els.text.value = await res.text();
  els.fileAlert.innerHTML = '';
  applyPattern(READY[1]);
  await new Promise((resolve) => {
    const check = () => (busy ? setTimeout(check, 30) : resolve());
    check();
  });
};

export { explain, toLiteral, handleFiles };
