# Regex Tester with Explanation — specification

**Tagline:** Test regular expressions live with highlighted matches and groups in your browser, no account.

**Category:** Developer Tools

**Free alternative to:** regex101 (account needed to save, sends patterns to its server, heavy and cluttered interface, ads on mirror sites)

**Search phrases:** regex tester, regex online, regex101 alternative, test regular expression, regex match highlighter, javascript regex tester, regex replace tester

**Allowed libraries:** none (browser APIs only)

**Published at:** https://turhe123.github.io/regex-tester-local/

## Acceptance checks (each must have a test)

- entering the pattern for digits with the g flag against the sample text highlights every number
- capture groups are listed per match with index and value
- the replace field with a group reference produces the replaced text below
- an invalid pattern shows an error message instead of crashing
- a catastrophic pattern is stopped by a timeout notice and the page stays responsive
- works at 390px wide

## Spec

Searches such as regex tester, regex online and test regular expression have huge steady volume. regex101 is the best known incumbent. It is excellent but needs the network, stores shared patterns on a server, wants an account for saving, and the page is dense and slow on phones. Many developers paste real log lines or customer text into it, so a local alternative has a clear privacy argument.

Our version does one job: let the user type a pattern and flags, paste test text, and see matches live. Features: a pattern field with flag toggles for g, i, m, s, u and y, a test text area with matches highlighted in alternating colors, a match list that shows for each match its index, length, full text, numbered groups and named groups, a replace field with live output supporting group references, and a split preview. A plain language token explainer lists what each part of the pattern means, built by a small hand written pattern parser covering character classes, quantifiers, anchors, groups, lookarounds and alternation. A cheat sheet drawer shows common tokens, and a few ready patterns for email like text, dates, and hex colors can be inserted with one click.

UI: pattern and flags on top in a single row, the test text below with highlight overlay, results panel under it, replace row at the bottom. On phones the panels are stacked and the cheat sheet is a bottom sheet. Defaults: flag g on, a sample sentence preloaded. Errors from an invalid pattern show in red under the pattern field with the engine message. The share action only copies a link containing the pattern in the URL fragment, which never leaves the browser. Keyboard use: focus pattern with a slash key, and Control or Command plus Enter copies the pattern as a JavaScript literal.

Technical approach: use the built in RegExp engine, so the tester explains JavaScript flavor, and say so clearly on the page. The highlight layer is a div behind a transparent textarea that mirrors scrolling and font metrics. To protect against catastrophic backtracking, run matching inside a Web Worker and terminate it if it exceeds about one second, then show a warning that the pattern may be too slow. Use the d flag where supported to get group indices for highlighting groups, with a fallback to computing match offsets only. Iterate matches with matchAll, guard against zero length matches that would loop forever by advancing the index.

Edge cases: very long test text over a few hundred thousand characters should limit highlighted matches to the first 2000 and say so. Unicode and emoji need the u flag, and the highlighter must count by code units consistently. Lookbehind support differs on older Safari, so wrap pattern creation in try and catch and tell the user. Escape HTML in the highlight layer to avoid injection. Line endings are normalized for display only.

Demo data: a fictional support log with lines like order 4821 shipped to Lena Ortiz on 2026-03-14, so patterns for dates, order numbers and names can be tried straight away.
