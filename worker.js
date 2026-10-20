// worker.js — runs the regular expression off the main thread (classic worker).
// app.js terminates this worker when a job takes longer than about one second (catastrophic backtracking).

function advance(text, index, unicode) {
  if (unicode && index < text.length) {
    const cp = text.codePointAt(index);
    if (cp > 0xffff) return index + 2;
  }
  return index + 1;
}

function span(value, ix) {
  if (value === undefined) return null;
  return { v: value, s: ix ? ix[0] : -1, e: ix ? ix[1] : -1 };
}

function serialize(m) {
  const g = [];
  for (let k = 1; k < m.length; k++) g.push(span(m[k], m.indices && m.indices[k]));
  let n = null;
  if (m.groups) {
    n = {};
    for (const [name, value] of Object.entries(m.groups)) n[name] = span(value, m.indices && m.indices.groups && m.indices.groups[name]);
  }
  return { i: m.index, t: m[0], g, n };
}

self.onmessage = (e) => {
  const { id, source, flags, text, replacement, useD, maxDetail, maxSplit } = e.data;
  const t0 = performance.now();
  let re;
  try {
    re = new RegExp(source, useD ? flags + 'd' : flags);
  } catch (err) {
    self.postMessage({ id, error: err.message });
    return;
  }
  const unicode = /[uv]/.test(flags);
  const matches = [];
  let total = 0;
  const take = (m) => { total++; if (matches.length < maxDetail) matches.push(serialize(m)); };

  re.lastIndex = 0;
  if (re.global) {
    let m;
    while ((m = re.exec(text)) !== null) {
      take(m);
      // A zero-length match leaves lastIndex where it was: step past it so the loop always ends.
      if (m[0].length === 0) re.lastIndex = advance(text, re.lastIndex, unicode);
    }
  } else {
    const m = re.exec(text);
    if (m) take(m);
  }
  const matchMs = performance.now() - t0;

  re.lastIndex = 0;
  const replaced = text.replace(re, replacement);
  const parts = text.split(re);
  self.postMessage({
    id, matches, total, matchMs,
    hasIndices: Boolean(useD),
    replaced,
    split: parts.slice(0, maxSplit),
    splitTotal: parts.length,
  });
};
