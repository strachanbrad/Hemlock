# TV display

`/display` shows the library on a television as a slideshow, one book at a
time. It is the one page outside the shell: no navigation, no Ant Design
components, its own stylesheet, and its own timer. Its data comes from
`GET /api/display`, which the [Roku channel](roku.md) reads too.

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
| `id` | The book's id (`books.id`). The page only compares it; the [Roku channel](roku.md) also sends its rating edits to `PATCH /api/books/:id`. |
| `title` | A string. |
| `author` | The author's name, or null. |
| `synopsis` | A string, `''` when there is none. |
| `cover_url` | `/covers/<file>`, relative to the server's origin, or null when the book has no cover. |
| `format` | The format of the edition whose cover is shown (`hardcover`, `paperback` or `ebook`), or null for a book with no edition. |
| `read` | `true` or `false`. |
| `star_rating`, `spice_rating`, `gore_rating` | Integers, `0` when unrated. |

The filters: `all` lists every book, `owned` (the default) every book with at
least one edition, so a book only wanted stays off the television; `read` and
`unread` split every book by read status. The order is `title COLLATE NOCASE, id`, the same on every
call, which the slideshow relies on to keep its place.

To see what the page receives, with `npm run dev` running on the dev machine:

```bash
curl -s 'http://localhost:5173/api/display?filter=unread'
```

## The query

`listDisplayBooks(db, filter)` in `server/src/routes/display.js` is the only
code here that knows the schema; the route handler around it stays the same
when the schema changes. It reads the `books`, `authors` and `editions`
tables ([Library § The model](library.md#the-model)):

- One row per book, joined to its author; `id` is `books.id`.
- `cover_url` and `format` come from the cover rule
  ([Library § The cover rule](library.md#the-cover-rule)): `bookCover()` and
  `pickedEdition()` in `server/src/library.js`, the same SQL `/api/books`
  uses, so the television and the library always show the same cover.
- `owned` keeps the books with at least one edition.

## The page

| File | Holds |
|---|---|
| `client/src/pages/Display/Display.jsx` | The page, loaded lazily by the `/display` route in `client/src/App.jsx`. |
| `client/src/pages/Display/slideshow.js` | The timing functions (`createShow`, `currentIndex`, `applyBooks`, `step`, `togglePause`) and `readOptions` for the address parameters. Pure: every function takes the time as an argument. |
| `client/src/pages/Display/effects.js` | The geometry of the cover effects: `bloodOf(gore, seed, height)` lays out the blood for a level, `seedOf(id)` seeds it per book, `faceHeight` sizes the cover's face, the path builders draw it, and `CHILLI` holds the chilli's paths and level lines. `bloodMarkup` and `chilliMarkup` build the SVG of each effect, with the class names `display.css` styles; the [Roku channel](roku.md) draws the same markup. Pure. |
| `client/src/pages/Display/CoverEffects.jsx` | The blood and the chilli: the markup of `effects.js` in an svg over the cover. |
| `client/src/pages/Display/display.css` | The stage, the slide layout, the effects' colours and motion, and the palette. |
| `client/src/api/display.js` | `fetchDisplayBooks(filter)`, the page's only request besides the live updates stream it holds through `useChanges()` ([Library § Live updates](library.md#live-updates)). |

The shell's **Display** menu item opens `/display` in a new tab.

### A slide

- The cover sits on the left in a 2:3 box that is sized before the image
  loads, so a slide never reflows. The image is scaled to fit inside the box.
  When a book has no cover, or its image fails to load, the box shows a cloth
  cover with the title and a small umbel instead.
- On the right: the title (at most 3 lines), the author, the format and the
  stars, and the synopsis (at most 8 lines). Spice and gore show in this
  line only with `?ratings=all`.
- Gore and spice also show on the cover itself (see below), unless the
  address says `?effects=off`.
- The slide sits on a letterboxed 16:9 stage. Every size is in stage units
  (`--u`, a hundredth of the stage width), so 720p, 1080p and 4K look the same
  and nothing passes the edge of the screen. A portrait phone shows the same
  stage, small; there is no portrait layout.
- `display.css` sets its own background, text colours and fonts. It has to:
  Ant Design's `App` wrapper sets the shell's text colour and font on
  everything beneath it. It takes them from the palette's custom properties
  on `:root` in `client/src/styles/index.css` ([Theme](theme.md)): ink with a
  vignette, cream text, the title in Cormorant Garamond, the author in Lora
  italic and dusty rose, the synopsis in Lora.
- "Hemlock" sits small in brass in the stage's lower right corner, with
  an umbel.
- Slides crossfade over one second; `prefers-reduced-motion` turns that off.

### Blood and the chilli

Both effects draw on the cover's face: the image as it is shown, or the
cloth cover. The image is scaled to fit its 2:3 box, so a cover of another
shape leaves ink beside or above it; each effect is an `svg` filling the box
whose `viewBox` has the image's proportions (`faceHeight`, from the image's
natural size once it loads), and the default `preserveAspectRatio` fits it
exactly as `object-fit: contain` fits the image. The effects appear once the
face is known, so they never jump. In effect units the face is 100 wide.

- **Blood by gore.** Drips start at the top edge and run down the left and
  right edges, from a thin wavy band along the top of each corner. Each drip
  is a trail that narrows as it runs and wanders a little, ending in a
  teardrop that grows out of it; a soft darker rim, a faint crescent of light
  on each teardrop and a short highlight at the top of the heavier runs make
  it read as liquid. By level: 0 nothing; 1 two or three short drips at one
  top corner; 2 short drips at both; 3 drips down both edges, the longest to
  about a third of the height; 4 the longest to about two thirds, a heavier
  run on each edge; 5 two heavy runs on each edge, the longest thinning,
  drifting in from the edge and swelling once on its way into a small pool
  at the bottom corner. The longest drip of a corner is the one nearest its
  edge. On the cloth cover the brass frame draws over the blood, and the
  chilli over the frame. Every drip, its teardrop included, stays within 12 units
  (`EDGE`) of its side edge, so the centre of the cover is never covered. The
  layout is seeded from the book's `id` (`seedOf`), so a book bleeds the same
  way every time it comes round.
- **A chilli by spice,** in the bottom right corner, 11 units wide: a brass
  hairline over a soft ink halo and a drop shadow, so it holds on any cover,
  with a moss calyx and stem. Hidden at 0. Its pod is washed in translucent
  ink, and colour fills it from the tip up to a brass level line: one
  gradient from amber at the tip to deep red at the stem, uncovered up to the
  line that leaves `spice / 5` of the pod's area below it (`CHILLI.lines` in
  `effects.js`, measured from the pod's path; measure again if the path
  changes).
- **Colour.** The blood is burgundy and rust darkened with ink, its teardrops
  and pools a shade darker, its rim darker again; the chilli's gradient runs
  from an amber of light brass and rust, through rust, to burgundy and rust
  darkened with ink. Every colour comes from the palette's custom properties,
  shaded with `color-mix()`.
- **Motion.** Each time a slide becomes current, the band seeps in, each
  drip runs down over 1.2 to 3.4 seconds (its length sets the time, its seed
  a delay of up to half a second), the pools rise as the longest drips reach
  them, and the chilli fills over 1.5 seconds: its clip window rises while
  the gradient inside it moves down by as much, so the colour stays put and
  the level only uncovers it. CSS animations under
  `.display-slide.is-current` do it, with no timer; a slide that is not
  current holds the finished state, so a slide fading out never changes.
  `prefers-reduced-motion` shows the finished state at once.

### Address parameters

| Parameter | Effect |
|---|---|
| `seconds` | Seconds per book: default 10, clamped to 5 through 3600. |
| `ratings=all` | Show spice and gore as well as the stars. |
| `filter` | `all`, `read`, `unread` or `owned`, passed to the endpoint. Any other value is ignored and the endpoint's default applies. |
| `effects=off` | Draw neither the blood nor the chilli on the covers. Any other value leaves both on. |

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
- The list is fetched when the page opens and then only when the library
  changes: a book added, edited or deleted on another device reaches the
  television about a third of a second later, over the live updates stream
  ([Library § Live updates](library.md#live-updates)). The stream
  reconnecting after an outage fetches it too, since a change may have
  happened meanwhile. A failed fetch is tried again 30 seconds later.
- A refetch keeps the book on screen, matched by `id`, for the rest of its
  time, so a change elsewhere never moves the slide; a new book takes its
  place in the order, and a deleted one drops out. If the book on screen is
  the one deleted, the book now at its position takes over its remaining
  time. A failed refetch keeps the last list.
- A browser without `EventSource` fetches the list every 5 minutes instead.
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

A Roku TV has no web browser; the [Roku channel](roku.md) shows the same
slideshow natively. The page itself reaches a television in one of three
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
the reverse proxy has to let the page, `/api/display`, `/api/events` and
`/covers/` through
([Deployment § The reverse proxy](deployment.md#the-reverse-proxy)).

The browser must meet Vite's default build target: Chrome or Edge 111,
Firefox 114, Safari 16.4. A built-in smart-TV browser older than that shows a
blank page and is not supported.

Some televisions crop the edges of an HDMI input by about 5% (overscan). The
stage's margins keep the text inside that border, but set the input's picture
size to "Just Scan", "Fit" or "Screen Fit" (the name depends on the maker) so
the whole picture shows.

## A Roku channel

The same slideshow runs as a native Roku channel, with pause, step and rating
edits from the remote: [Roku channel](roku.md).

## Tests

- `server/test/display.test.js`: the record shape with the cover and format
  the cover rule picks, each filter and the default, the order, and the 400.
- `client/test/slideshow.test.js`: the timing functions with explicit times
  (wrap, catch-up, refetch, deletion, keys, pause, a backward clock, an empty
  list) and the address parameters.
- `client/test/displayEffects.test.js`: the rating levels, the chilli's
  level line, the face height, the seed, the blood at every level over many
  seeds (which corners, how many drips, how far they run, the heavier runs,
  the pools, and the 12-unit edge), and the markup: every shape in the rim
  and the body, the glints, the chilli's ids and level line.
- `client/test/Display.test.jsx`: the page under `StrictMode` with fake
  timers: the schedule, catch-up on `visibilitychange`, the refetch on a
  change and on a reconnect with no poll beside it (with `EventSource`
  stubbed), the 5-minute refetch without it, the notices, the keys,
  fullscreen, the idle cursor, and no interval, timer, listener, wake lock
  or event stream left behind after an unmount; the effects by gore and
  spice, `effects=off`, and the face fitted to a loaded image or the cloth
  cover.

jsdom does no layout: check a change to the stage in a real browser at
1920×1080, 1280×720 and 3840×2160 as well as at 1440, 768 and 390 pixels wide.
