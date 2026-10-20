// explain.js — a small hand-written parser that turns a JavaScript regular expression into plain-language rows.
// It only explains; the browser's RegExp engine stays the judge of what is valid.
// Each row: { token, desc, depth, kind } where kind is literal | class | anchor | group | look | quant | alt | escape | error.

const ESC_CLASS = {
  d: 'a digit (0-9)',
  D: 'any character that is not a digit',
  w: 'a word character (letter, digit or underscore)',
  W: 'any character that is not a word character',
  s: 'a whitespace character (space, tab, line break…)',
  S: 'any character that is not whitespace',
};
const ESC_CHAR = { t: ['tab', '\t'], n: ['line feed (new line)', '\n'], r: ['carriage return', '\r'], v: ['vertical tab', '\v'], f: ['form feed', '\f'], 0: ['null', '\0'] };
const SYNTAX = '\\^$.|?*+()[]{}/-';

function showChar(ch) {
  if (ch === ' ') return 'a space';
  const cp = ch.codePointAt(0);
  if (cp < 32 || cp === 127) return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  return `"${ch}"`;
}

function joinList(items) {
  const shown = items.slice(0, 8);
  const more = items.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` and ${more} more` : '');
}

export function explain(src, flags = '') {
  const rows = [];
  const unicode = /[uv]/.test(flags);
  const ci = flags.includes('i');
  const multiline = flags.includes('m');
  const dotAll = flags.includes('s');
  const caseNote = ci ? ' (any letter case, i flag)' : '';
  let i = 0;
  let groups = 0;
  const add = (token, desc, depth, kind) => rows.push({ token, desc, depth, kind });

  function quantAt(k) {
    const c = src[k];
    if (c === '*' || c === '+' || c === '?') return { len: 1, c };
    if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(k, k + 24));
      if (m) return { len: m[0].length, c, m };
    }
    return null;
  }

  function readQuantifier(depth) {
    const q = quantAt(i);
    if (!q) return;
    let token = src.slice(i, i + q.len);
    i += q.len;
    let desc;
    let exact = false;
    if (q.c === '*') desc = 'zero or more times';
    else if (q.c === '+') desc = 'one or more times';
    else if (q.c === '?') desc = 'zero or one time (optional)';
    else {
      const [, n, comma, m] = q.m;
      if (!comma) { desc = `exactly ${n} time${n === '1' ? '' : 's'}`; exact = true; }
      else if (m === '') desc = `${n} or more times`;
      else desc = `between ${n} and ${m} times`;
    }
    let lazy = false;
    if (src[i] === '?') { lazy = true; token += '?'; i++; }
    const mode = exact ? '' : lazy ? ', as few as possible (lazy)' : ', as many as possible (greedy)';
    add(token, `repeat the previous item ${desc}${mode}`, depth, 'quant');
    if (quantAt(i)) {
      const q2 = quantAt(i);
      add(src.slice(i, i + q2.len), 'a second quantifier in a row: nothing to repeat (the engine rejects this)', depth, 'error');
      i += q2.len;
    }
  }

  // A plain or escaped literal character at k, or null when k starts some other construct.
  function literalAt(k) {
    const c = src[k];
    if (c === undefined) return null;
    if (c === '\\') {
      const n = src[k + 1];
      if (n !== undefined && SYNTAX.includes(n)) return { len: 2, ch: n };
      return null;
    }
    if ('^$.|?*+()['.includes(c)) return null;
    if (c === '{' && quantAt(k)) return null;
    const cp = src.codePointAt(k);
    const ch = String.fromCodePoint(cp);
    return { len: ch.length, ch };
  }

  // Escapes valid both inside and outside character classes.
  function escapeInfo(k) {
    const n = src[k + 1];
    const rest = src.slice(k, k + 40);
    let m;
    if (ESC_CLASS[n]) return { len: 2, desc: ESC_CLASS[n], kind: 'class', ch: null };
    if (ESC_CHAR[n] && !(n === '0' && /\d/.test(src[k + 2] || ''))) {
      return { len: 2, desc: `a ${ESC_CHAR[n][0]} character`, kind: 'escape', ch: ESC_CHAR[n][1] };
    }
    if ((m = /^\\x([0-9a-fA-F]{2})/.exec(rest))) {
      const ch = String.fromCharCode(parseInt(m[1], 16));
      return { len: 4, desc: `the character with code 0x${m[1].toUpperCase()} (${showChar(ch)})`, kind: 'escape', ch };
    }
    if ((m = /^\\u\{([0-9a-fA-F]{1,6})\}/.exec(rest))) {
      if (unicode) {
        const cp = parseInt(m[1], 16);
        const ch = cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
        return { len: m[0].length, desc: `the code point U+${m[1].toUpperCase()}${ch ? ` (${showChar(ch)})` : ''}`, kind: 'escape', ch };
      }
      return { len: 2, desc: 'the letter "u": \\u{…} only means a code point with the u flag on', kind: 'error', ch: 'u' };
    }
    if ((m = /^\\u([0-9a-fA-F]{4})/.exec(rest))) {
      const ch = String.fromCharCode(parseInt(m[1], 16));
      return { len: 6, desc: `the UTF-16 code unit U+${m[1].toUpperCase()} (${showChar(ch)})`, kind: 'escape', ch };
    }
    if ((m = /^\\c([A-Za-z])/.exec(rest))) {
      return { len: 3, desc: `the control character Ctrl+${m[1].toUpperCase()}`, kind: 'escape', ch: String.fromCharCode(m[1].toUpperCase().charCodeAt(0) - 64) };
    }
    if ((m = /^\\([pP])\{([^}]*)\}/.exec(rest))) {
      const base = m[1] === 'P' ? 'any character that does not have' : 'a character with';
      if (unicode) return { len: m[0].length, desc: `${base} the Unicode property ${m[2]}`, kind: 'class', ch: null };
      return { len: 2, desc: `the letter "${m[1]}": \\${m[1]}{…} needs the u flag`, kind: 'error', ch: m[1] };
    }
    return { len: 2, desc: `the character ${showChar(n)}`, kind: 'literal', ch: n };
  }

  function parseEscape(depth) {
    const n = src[i + 1];
    if (n === undefined) { add('\\', 'a trailing backslash with nothing to escape (the engine rejects this)', depth, 'error'); i++; return; }
    if (n === 'b') { add('\\b', 'a word boundary: the edge between a word character and a non-word character', depth, 'anchor'); i += 2; return; }
    if (n === 'B') { add('\\B', 'not a word boundary', depth, 'anchor'); i += 2; return; }
    if (/[1-9]/.test(n)) {
      const num = /^\d+/.exec(src.slice(i + 1))[0];
      add('\\' + num, `back-reference: the same text that capture group ${num} matched`, depth, 'group');
      i += 1 + num.length;
      return;
    }
    if (n === 'k' && src[i + 2] === '<') {
      const end = src.indexOf('>', i);
      if (end > 0) {
        const name = src.slice(i + 3, end);
        add(src.slice(i, end + 1), `back-reference: the same text that the group named "${name}" matched`, depth, 'group');
        i = end + 1;
        return;
      }
    }
    const r = escapeInfo(i);
    add(src.slice(i, i + r.len), r.desc, depth, r.kind);
    i += r.len;
  }

  function classItem() {
    if (src[i] === '\\') {
      const n = src[i + 1];
      if (n === undefined) { i++; return { label: 'a backslash', ch: '\\' }; }
      if (n === 'b') { i += 2; return { label: 'a backspace character', ch: '\b' }; }
      const r = escapeInfo(i);
      i += r.len;
      return { label: r.kind === 'literal' ? showChar(r.ch) : r.desc, ch: r.ch };
    }
    const ch = String.fromCodePoint(src.codePointAt(i));
    i += ch.length;
    return { label: showChar(ch), ch };
  }

  function parseClass(depth) {
    const start = i;
    i++;
    let negated = false;
    if (src[i] === '^') { negated = true; i++; }
    const items = [];
    while (i < src.length && src[i] !== ']') {
      const a = classItem();
      if (src[i] === '-' && src[i + 1] !== undefined && src[i + 1] !== ']' && a.ch != null) {
        i++;
        const b = classItem();
        items.push(b.ch != null ? `${showChar(a.ch)} to ${showChar(b.ch)}` : `${a.label}, "-", ${b.label}`);
      } else {
        items.push(a.label);
      }
    }
    if (src[i] !== ']') { add(src.slice(start), 'an unclosed character class: "]" is missing', depth, 'error'); return; }
    i++;
    const list = joinList(items);
    let desc;
    if (negated) desc = items.length ? `any one character except ${list}` : 'any character at all, including line breaks';
    else desc = items.length ? `one character from: ${list}` : 'an empty class that never matches';
    add(src.slice(start, i), desc + caseNote, depth, 'class');
  }

  function parseGroup(depth) {
    const rest = src.slice(i, i + 80);
    let token;
    let desc;
    let kind = 'group';
    let m;
    if (rest.startsWith('(?:')) { token = '(?:'; desc = 'non-capturing group: bundles the parts below without saving them'; }
    else if (rest.startsWith('(?=')) { token = '(?='; desc = 'lookahead: what follows must match the parts below (nothing is consumed)'; kind = 'look'; }
    else if (rest.startsWith('(?!')) { token = '(?!'; desc = 'negative lookahead: what follows must NOT match the parts below'; kind = 'look'; }
    else if (rest.startsWith('(?<=')) { token = '(?<='; desc = 'lookbehind: the text just before must match the parts below (missing in older Safari)'; kind = 'look'; }
    else if (rest.startsWith('(?<!')) { token = '(?<!'; desc = 'negative lookbehind: the text just before must NOT match the parts below (missing in older Safari)'; kind = 'look'; }
    else if ((m = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(rest))) { groups++; token = m[0]; desc = `capture group ${groups}, named "${m[1]}": saves what the parts below match`; }
    else if ((m = /^\(\?([ims]*-?[ims]*):/.exec(rest)) && m[1]) { token = m[0]; desc = `group with its own flags (${m[1]}), supported by newer browsers only`; }
    else if (rest.startsWith('(?')) { token = '(?'; desc = 'an unknown group type (the engine will probably reject this)'; kind = 'error'; }
    else { groups++; token = '('; desc = `capture group ${groups}: saves what the parts below match, use $${groups} in a replacement`; }
    i += token.length;
    const row = rows.length;
    add(token, desc, depth, kind);
    parseSeq(depth + 1);
    if (src[i] === ')') { i++; rows[row].token = token + '…)'; }
    else add(token, 'an unclosed group: ")" is missing', depth, 'error');
  }

  function parseAtom(depth) {
    const c = src[i];
    if (c === '.') { add('.', dotAll ? 'any single character, line breaks included (s flag)' : 'any single character except a line break', depth, 'class'); i++; return; }
    if (c === '^') { add('^', multiline ? 'the start of a line (m flag)' : 'the start of the text', depth, 'anchor'); i++; return; }
    if (c === '$') { add('$', multiline ? 'the end of a line (m flag)' : 'the end of the text', depth, 'anchor'); i++; return; }
    if (c === '[') { parseClass(depth); return; }
    if (c === '(') { parseGroup(depth); return; }
    if (c === '\\') { parseEscape(depth); return; }
    add(c, `the character ${showChar(c)}`, depth, 'literal');
    i++;
  }

  function parseSeq(depth) {
    while (i < src.length && src[i] !== ')') {
      if (src[i] === '|') {
        add('|', depth === 0 ? 'OR: match everything before this bar or everything after it' : 'OR: inside this group, the part before or the part after', depth, 'alt');
        i++;
        continue;
      }
      const q = quantAt(i);
      if (q) {
        add(src.slice(i, i + q.len), 'a quantifier with nothing to repeat (the engine rejects this)', depth, 'error');
        i += q.len;
        continue;
      }
      if (literalAt(i)) {
        // Merge a run of literal characters, but leave the last one alone if a quantifier follows it.
        let tok = '';
        let text = '';
        let k = i;
        for (let l = literalAt(k); l; l = literalAt(k)) {
          if (tok && quantAt(k + l.len)) break;
          tok += src.slice(k, k + l.len);
          text += l.ch;
          k += l.len;
          if (quantAt(k)) break;
        }
        i = k;
        const desc = text.length === 1 || [...text].length === 1 ? `the character ${showChar(text)}` : `the text "${text}"`;
        add(tok, desc + caseNote, depth, 'literal');
      } else {
        parseAtom(depth);
      }
      readQuantifier(depth);
    }
  }

  while (i < src.length) {
    parseSeq(0);
    if (src[i] === ')') { add(')', 'an unmatched ")": there is no open group to close (the engine rejects this)', 0, 'error'); i++; }
  }

  if (!unicode && /\\[pP]\{|\\u\{|[\u{10000}-\u{10FFFF}]/u.test(src)) {
    add('u', 'tip: this pattern uses Unicode escapes or emoji, turn on the u flag so they count as single characters', 0, 'error');
  }
  return rows;
}
