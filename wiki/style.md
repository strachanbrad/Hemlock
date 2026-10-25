# Code style conventions

The conventions every change to Hemlock follows: comments, license headers,
wiki pages, commits, Ant Design usage and responsive layout. None of them is
enforced by a linter. Each entry names the rule, shows the correct and
incorrect form where that helps, and gives the reason. When a design or review
discussion produces a rule that should apply across the codebase, add an entry
here.

## Comments: default to none

Comments are rare. Code explains itself through its names and structure; a
comment earns its place only by telling a maintainer something the code cannot
show:

- an invariant or constraint that must stay true;
- a required ordering;
- library behaviour that is easy to misuse;
- an edge case, or a workaround that must stay in place;
- a parameter that is mandatory only in some circumstances;
- behaviour that fails silently when a requirement is broken.

When the code is clear, write no comment. When deleting a comment would not
lead a competent maintainer to break something, delete it.

Reason: a stale comment makes the reader trust something that is no longer
true, and no test fails when a comment lies.

### What not to write

- **What the code does.** The identifier and signature already say it.

  ```js
  // Avoid: restates the next line
  // Fetch the authors from the API.
  const authors = await fetchAuthors()
  ```

- **The story.** State the constraint that holds now, not the bug, refactor or
  conversation that produced it.

  ```js
  // Avoid: the story
  // The old carousel stopped whenever the pointer rested on a slide, so the
  // slideshow was rewritten to own its timer.

  // Preferred: the constraint
  // The cover box is sized before the image loads, so a slide never reflows.
  ```

- **History markers.** No `V2`, `Phase N`, `(was: …)`, `originally`,
  `previously`, `used to`, dates or decision attributions. Commit messages hold
  history.
- **Ancestry.** Not where code was copied or adapted from, or what it resembles.
- **Callers, tasks and tickets.** "Used by the buy list" and "fix for #12"
  belong in commit messages. A grep finds callers.
- **The interface again in prose.** No restated signatures, option lists or
  return values. Keep only a requirement the code cannot show.
- **Tutorials.** No multi-paragraph docblocks. The wiki explains subsystems.
- **Self-reference and metaphor.** No "we", "our", "the app", or "the heart
  of the slideshow". Say the literal relationship.
- **References a reader cannot follow.** No `notes/`, conversations or
  planning documents.

### How a surviving comment reads

- One or two lines; three or four only when an invariant needs them.
- Present tense, third person, or a direct technical statement.
- Exact identifiers where they make the constraint actionable.
- **No em dashes.** Use a period, comma, colon, semicolon or parentheses.
- Match the file's density; do not add a comment because another file has one.

A `CRITICAL:` prefix is reserved for a caveat whose violation is a real bug
nothing else catches.

Section dividers (`// ── routes ──────────`) are fine in long files. In tests,
a comment explains unusual setup, a non-obvious fixture, or why an assertion
holds; one that repeats the test name goes.

### Comments that are directives

Comments read by tooling are load-bearing; never delete or reword them:
`eslint-disable*`, `@vitest-environment`, `@ts-*`, `@vite-ignore`,
`@__PURE__`, coverage pragmas, shebangs, JSDoc type tags, and the license
header.

## License headers

Every maintained first-party source file that can carry a comment starts with
the Hemlock GPL header, word for word:

```text
Copyright (c) 2023 Hemlock
SPDX-License-Identifier: GPL-3.0-only
```

[`LICENSE`](../LICENSE) holds the full GPL text; a source file carries only
these two lines, in its own comment syntax.

JavaScript, JSX and CSS:

```js
/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */
```

Shell scripts, nginx and systemd files use `#` lines, SQL uses `--`:

```bash
#!/usr/bin/env bash
# Copyright (c) 2023 Hemlock
# SPDX-License-Identifier: GPL-3.0-only
```

HTML uses a comment block after the doctype:

```html
<!doctype html>
<!--
Copyright (c) 2023 Hemlock
SPDX-License-Identifier: GPL-3.0-only
-->
```

The header is the first thing in the file, except that a shebang or an HTML
doctype stays first.

Exempt: JSON, lockfiles, generated files, build output, images and other
assets, Markdown, and single-purpose dotfiles (`.gitignore`, `.nvmrc`).

## Wiki pages: how the system works now

A wiki page is a manual for the system as it stands. Someone who has never
seen the code should be able to follow it.

- **Present tense, current state only.** No "used to", "was replaced by",
  "originally" or "since 2026-…". If a constraint exists because something
  went wrong, state the constraint and why it holds, not the story.
- **Third person, impersonal.** Instructions are imperative steps: "Run
  `npm run db:reset`."
- **Followable.** Commands are complete and runnable as written, and say
  where they run (the dev machine or the box, and as which user); procedures
  are numbered steps.
- **Point at the code.** Name the real file, function or table with its path.
- **Keep the why, drop the when.** Invariants and trade-offs stay; dates and
  who decided do not.
- **Tracked links only.** Never link `notes/`, `CLAUDE.md` or `.claude/`; they
  do not exist in a fresh clone.
- **One home per fact.** Explain a mechanism on the page that owns it and link
  to it from everywhere else.
- **Planning pages are the exception in kind, not in voice.**
  [roadmap.md](roadmap.md) describes work that does not exist yet, in the same
  present-tense voice. Built work leaves it and is described on its own page.
- Every page is listed in [README.md](README.md).

## Commits: one checkpoint per capability

The first-parent line of `main` is a history of checkpoints: every commit on
it is a coherent state of the system (a capability, a schema change, a
security fix, an infrastructure change). It is not a diary.

### Landing work

- Work happens on a `feature-*` branch from `main`. Commit there as often as
  the work needs.
- Land the branch with a merge commit, `git merge --no-ff feature-x`, whose
  message follows the rules below; it is the checkpoint's message. Then
  delete the branch. Never fast-forward.
- A small change with no branch of its own (a docs correction) is one commit
  straight on `main`, in the same style.
- Land a branch as two merges only when the parts are independently
  understandable or revertible (a security fix found while building a
  feature, say). Follow-up fixes, review fixes, lint and docs for the
  branch's own work are part of the branch, described once in the merge
  message.
- A fix found by reviewing an unmerged branch folds into the commit it
  corrects (`git commit --fixup=<sha>`, then
  `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash main`). Never rewrite
  `main`.

### The message

Subject: one line, `Area: concise technical change`, 50–80 characters,
stating the primary outcome. Areas read like `Books:`, `Authors:`, `Display:`,
`Lookup:`, `Frontend:`, `Server:`, `Database:`, `Deploy:`, `Docs:`, `Infra:`.

Body: optional for a small change; for a substantial one, 2–5 bullets, each
one capability, behaviour or rule, one sentence, not repeating the subject.

Describe what the code now does. Leave out: how the work was found or done;
prior designs and "previously"; test counts and lint or CI results; words like
"verified"; prose transitions ("also", "as part of this"); promotional
language; attribution trailers (`Co-Authored-By`) and session links. Use
direct verbs: add, enforce, prevent, support, render, persist, validate, move,
remove.

```
Books: store each format of a book as its own edition

- Keep ratings, read status, synopsis and the wishlist flag on the book; format, ISBN and cover on each edition the household owns.
- Mark a wishlisted book purchased by scanning the physical copy, which adds its edition and clears the flag.
- Allow an edition without an ISBN for store-only ebooks.
```

```
Deploy: serve the client from nginx and run the server under systemd

- Build the client with Vite into client/dist, served by nginx with /api proxied to Express and /covers served from the data directory.
- Keep the database and covers under /var/lib/hemlock, which a redeploy never touches.
- Apply pending migrations when the server starts.
```

The test for every line: would someone reading `git log` six months from now
need it to understand what changed? If not, remove it.

## Ant Design

- **Themed feedback comes from `App.useApp()`.** `message`, `modal` and
  `notification` from the hook follow the `ConfigProvider` theme; the static
  `message.success` and `Modal.confirm` imports ignore it. The tree renders
  inside `<App>` for the hook to work.
- **Confirmations.** `Popconfirm` with `okType="danger"` for a row's delete
  (an edition, an author with no books); `modal.confirm` for a delete that
  takes other records with it (a book with its editions and covers). An
  author with books cannot be deleted; the server refuses.
- **Every request goes through `client/src/api/<resource>.js`.** A page
  never calls `fetch`; after a write it uses the returned record or refetches
  what it shows. An error response may be HTML (nginx's 413 and 502), so a
  wrapper never assumes JSON on failure.
- **Styling lives in CSS and theme tokens.** Colours, spacing and type come
  from the `ConfigProvider` theme tokens; layout rules live in a stylesheet
  with class names. An inline `style` object is for a value computed at
  runtime, not for layout.
- **No JavaScript measurement for layout.** Heights fill with CSS flex;
  `ResizeObserver` is only for computing a number.

## Responsive layout: every page works on a phone

Hemlock uses Ant Design's breakpoints: **phone** below 768px (`md`),
**tablet** from 768px to 992px (`lg`), **desktop** above. Adding a book,
scanning a barcode and browsing the library are designed for a phone; every
other page reflows so nothing is out of reach.

- **CSS first.** Layout that CSS can express uses media queries on the same
  breakpoints (`@media (max-width: 767.98px)` for a phone).
- **Structure swaps read `matchMedia` synchronously.** When a phone needs a
  different component tree (a card list instead of a table, a drawer instead
  of a sider), read the viewport with `window.matchMedia` so the first render
  is already right. `Grid.useBreakpoint` starts empty and flashes the phone
  layout on a desktop.
- **Wide content scrolls inside its own box.** A table wider than the screen
  scrolls sideways in its container, never the page.
- **Phone lists are one column.** A multi-column table becomes one column of
  rows (title, author, the ratings beneath) with the header hidden, keeping
  the desktop's default sort.
- **Touch targets.** Rating icons and toggles are at least 32px to tap.

Verify a responsive change in a real browser engine, never jsdom (it does no
layout): load the page in headless Firefox at 390, 768 and 1440px and count
elements that extend past the viewport with no horizontally scrolling
ancestor. A page passes at zero.
