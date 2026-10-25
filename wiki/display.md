# TV display

`/display` shows the library on a television as a slideshow, one book at a
time. It is the one page outside the shell: no navigation, no Ant Design
components, its own stylesheet, and its own timer. Its data comes from
`GET /api/display`, an endpoint shaped so that a later Roku channel can use it
too.

## The endpoint

```
GET /api/display?filter=all|read|unread|owned        (default owned)
  200 [{ id, title, author, synopsis, cover_url, format, read, star_rating, spice_rating, gore_rating }]
  400 { error }                                       any other filter
```

`server/src/routes/display.js` validates `filter` and answers the array that
`listDisplayBooks(db, filter)` returns. Every record is flat, so a client never
joins anything:

| Field | Value |
|---|---|
| `id` | Opaque, unique within the response. Clients only compare it. |
| `title` | A string. |
| `author` | The author's name, or null. |
| `synopsis` | A string, `''` when there is none. |
| `cover_url` | `/covers/<file>`, relative to the server's origin, or null when there is no cover file. |
| `format` | `hardcover`, `paperback`, `ebook`, or null. |
| `read` | `true` or `false`. |
| `star_rating`, `spice_rating`, `gore_rating` | Integers, `0` when unrated. |

The filters: `all` and `owned` list every book, `read` and `unread` split them
by read status. The order is `title COLLATE NOCASE, id`, the same on every
call, which the slideshow relies on to keep its place.

To see what the page receives, with `npm run dev` running on the dev machine:

```bash
curl -s 'http://localhost:5173/api/display?filter=unread'
```

## The query

`listDisplayBooks(db, filter)` is the only code that knows the schema; the
route handler around it stays the same when the schema changes. Against the
`Authors`, `Books` and `EBooks` tables of `server/migrations/001_init.sql`:

- It is a `UNION ALL` of `Books` and `EBooks`, each with a `LEFT JOIN` on
  `Authors`, so a book whose author row is missing still shows, with a null
  author.
- `id` is `b` or `e` followed by the ISBN, because the same ISBN can be in
  both tables.
- The columns are loosely typed, so the query normalises them: a null rating
  becomes `0` and a string rating an integer; `read` is true for `1`, `'1'` or
  `'true'`; `media` becomes `hardcover` or `paperback` for a `Books` row, and
  every `EBooks` row is `ebook`.
- Every row is an owned copy, so `owned` lists the same books as `all`.
- `cover_url` is `/covers/<isbn>.jpg` when that file is in `DATA_DIR/covers/`
  (one directory listing per request) and null otherwise, so the page never
  requests a cover that does not exist.

## The page

| File | Holds |
|---|---|
| `client/src/pages/Display/Display.jsx` | The page, loaded lazily by the `/display` route in `client/src/App.jsx`. |
| `client/src/pages/Display/slideshow.js` | The timing functions (`createShow`, `currentIndex`, `applyBooks`, `step`, `togglePause`) and `readOptions` for the address parameters. Pure: every function takes the time as an argument. |
| `client/src/pages/Display/display.css` | The stage, the slide layout and the palette. |
| `client/src/api/display.js` | `fetchDisplayBooks(filter)`, the page's only request. |

The shell's **Display** menu item opens `/display` in a new tab.

### A slide

- The cover sits on the left in a 2:3 box that is sized before the image
  loads, so a slide never reflows. The image is scaled to fit inside the box.
  When a book has no cover, or its image fails to load, the box shows the
  title instead.
- On the right: the title (at most 3 lines), the author, the format and the
  stars, and the synopsis (at most 8 lines). Spice and gore show only with
  `?ratings=all`.
- The slide sits on a letterboxed 16:9 stage. Every size is in stage units
  (`--u`, a hundredth of the stage width), so 720p, 1080p and 4K look the same
  and nothing passes the edge of the screen. A portrait phone shows the same
  stage, small; there is no portrait layout.
- `display.css` sets its own dark background, text colours and font. It has
  to: Ant Design's `App` wrapper sets the shell's text colour and font on
  everything beneath it. The accent (the border of a missing cover) is the
  theme's `colorPrimary`, passed in as the `--display-accent` custom property.
- Slides crossfade over one second; `prefers-reduced-motion` turns that off.

### Address parameters

| Parameter | Effect |
|---|---|
| `seconds` | Seconds per book: default 10, clamped to 5 through 3600. |
| `ratings=all` | Show spice and gore as well as the stars. |
| `filter` | `all`, `read`, `unread` or `owned`, passed to the endpoint. Any other value is ignored and the endpoint's default applies. |

For example, `/display?seconds=20&filter=unread` shows the unread books for 20
seconds each.

### Timing

The page holds an anchor: the book at index `anchorIndex` started showing at
`anchorAt`. The book on screen at time `t` is
`(anchorIndex + floor((t - anchorAt) / interval)) mod n`, so the slide is
computed from the clock rather than counted by a timer:

- A 500 ms tick and every `visibilitychange` recompute it. A tab the browser
  has throttled or hidden catches up at once instead of drifting.
- The previous slide (fading out), the current one and the next one are in the
  page, so the next cover is already loaded when it is shown.
- The list is fetched again every 5 minutes, or 30 seconds after a failed
  fetch. A refetch keeps the book on screen, matched by `id`, for the rest of
  its time; if that book is gone, the book now at its position takes over its
  remaining time. A failed refetch keeps the last list.
- An empty list shows "No books to show."; a first load that fails shows
  "Cannot reach the library. Retrying."
- A clock that jumps backwards re-anchors instead of showing an invalid slide.
- The page reloads itself 24 hours after it loaded, so a redeploy reaches a
  television that is left on.

### Controls

| Input | Effect |
|---|---|
| Right, Left | The next or previous book, which then gets a full interval. |
| Space, Enter, MediaPlayPause | Pause and resume. "Paused" shows while paused; resuming keeps the time that remained. |
| F, or the **Full screen** button | Toggle fullscreen on the whole page. The button exists only where the browser offers the Fullscreen API (iPhone Safari does not). |
| Moving the pointer, or a tap | Shows the cursor and the button; both hide after 3 seconds without pointer movement. |

Nothing pauses on hover: a pointer left resting over the slide changes
nothing.

While the page is visible it holds a Screen Wake Lock, so the computer showing
it does not sleep, and requests it again whenever the page becomes visible.
Browsers grant a wake lock only on a secure origin (HTTPS, or `localhost`);
where it is refused or unsupported, the page carries on without it.

## Getting the page onto a television

A Roku TV has no web browser, so the page reaches the screen in one of three
ways:

1. **HDMI from a laptop or mini PC.** Plug it into one of the TV's inputs,
   open `/display` in a browser and press F.
2. **Screen mirroring to the Roku.** Windows 10 and 11 (Win+K) and Android 10
   or later mirror to most current Roku players and TVs; iOS 12.3 or later and
   macOS 10.14.5 or later use AirPlay on the Roku TV models that support it.
   Google Cast does not work. Mirroring ends when the sender sleeps, so the
   sender must stay awake for the whole session; the wake lock covers that only
   while the page is visible in the sender's browser over HTTPS.
3. **A streaming stick's browser** on another input, such as the Silk browser
   on a Fire TV stick.

Whichever way, the browser opens `/display` without an interactive login, so
the reverse proxy has to let the page, `/api/display` and `/covers/` through
([Deployment § The reverse proxy](deployment.md#the-reverse-proxy)).

The browser must meet Vite's default build target: Chrome or Edge 111,
Firefox 114, Safari 16.4. A built-in smart-TV browser older than that shows a
blank page and is not supported.

Some televisions crop the edges of an HDMI input by about 5% (overscan). The
stage's margins keep the text inside that border, but set the input's picture
size to "Just Scan", "Fit" or "Screen Fit" (the name depends on the maker) so
the whole picture shows.

## A Roku channel

A native Roku channel is a possible later client of the same endpoint: a
SceneGraph channel sideloaded in developer mode (one sideloaded channel per
device). It prefixes each `cover_url` with its configured base URL, and Roku's
image node loads the JPEG, PNG and WebP covers the server stores. It needs
`/api/display` and `/covers/` reachable without an interactive login, as the
television's browser does
([Deployment § The reverse proxy](deployment.md#the-reverse-proxy)).

## Tests

- `server/test/display.test.js`: the record shape, each filter and the
  default, the order, a missing cover file or directory, and the 400.
- `client/test/slideshow.test.js`: the timing functions with explicit times
  (wrap, catch-up, refetch, deletion, keys, pause, a backward clock, an empty
  list) and the address parameters.
- `client/test/Display.test.jsx`: the page under `StrictMode` with fake
  timers: the schedule, catch-up on `visibilitychange`, the refetch, the
  notices, the keys, fullscreen, the idle cursor, and no interval, timer,
  listener or wake lock left behind after an unmount.

jsdom does no layout: check a change to the stage in a real browser at
1920×1080, 1280×720 and 3840×2160 as well as at 1440, 768 and 390 pixels wide.
