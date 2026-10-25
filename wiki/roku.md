# Roku channel

The Hemlock is also a Roku channel: the TV slideshow of [TV display](display.md)
as a native SceneGraph app, so a Roku TV shows the library without a computer
or a mirrored screen. It runs the same slideshow, pauses and steps from the
remote, edits a paused book's Read, Stars, Spice and Gore, and picks up
changes made elsewhere in the library within seconds. It lives in `roku/` and
is a client of the same API as the web pages:

| Request | Used for |
|---|---|
| `GET /api/display?filter=` | The slides ([TV display § The endpoint](display.md#the-endpoint)). |
| `GET /covers/<file>` | The covers, each `cover_url` prefixed with the channel's address. |
| `PATCH /api/books/:id` | One rating or Read change ([Library § The API](library.md#the-api)). |
| `GET /api/changes?since=&wait=` | The long poll that says the library changed ([Library § Live updates](library.md#live-updates)). |

The channel is sideloaded in Roku's developer mode, not published in the
Channel Store; a Roku device holds one sideloaded channel at a time.

## The files

| Path | Holds |
|---|---|
| `roku/manifest` | Title, version, `ui_resolutions=fhd`, the icon and splash paths, and `hemlock_base_url`, the default address. |
| `roku/source/main.brs` | Opens the screen and the scene, logs the TV's screensaver wait, and holds the screensaver off ([below](#the-screensaver)). |
| `roku/components/HemlockScene.xml`, `.brs` | The scene: the slides, the keys, the rating saves, the settings and the status screens. |
| `roku/components/slideshow.brs` | The timing functions of `client/src/pages/Display/slideshow.js` in BrightScript (`createShow`, `currentIndex`, `applyBooks`, `moveShow`, `togglePause`). |
| `roku/components/Slide.xml`, `.brs` | One slide: the cover box, the cloth cover, the text column and its layout. |
| `roku/components/RatingsPanel.xml`, `.brs` | The Read, Stars, Spice and Gore rows and their highlight. |
| `roku/components/SettingsDialog.xml`, `.brs` | The settings dialog on the Options key. |
| `roku/components/HttpTask.xml`, `.brs` | The one Task thread that makes every request, the long poll included. |
| `roku/components/common.brs` | The clock, the address check, and number, text and JSON helpers. |
| `roku/fonts/` | Cormorant Garamond, Lora and Inter from their official releases, with their OFL licences. |
| `roku/scripts/` | `build.js`, `images.js` and `install.js`, the npm commands below. |
| `roku/bsconfig.json` | The BrighterScript validation of `npm run roku:check`. |

The images are not tracked: `npm run roku:build` renders them into the
package with `sharp` (`roku/scripts/images.js`). The icons
(`mm_icon_focus_fhd` 540×405, `mm_icon_focus_hd` 290×218) and splash screens
(1920×1080, 1280×720, 720×480) draw `client/public/logo-cream.svg` over the
wordmark on the stage's ink; the rating icons are the library's
(`client/src/images/`) drawn white and tinted on the TV; the umbel is the
theme's ornament; the background and the cloth cover repeat the gradients of
`display.css`.

## A slide

The stage is the TV's 1920×1080 UI. Everything stays inside a 5 percent
overscan border (96 pixels at the sides, 54 at the top and bottom), and the
slide is laid out like the web stage at 1080p
([TV display § A slide](display.md#a-slide)):

- The cover on the left in a 605×907 box (2:3) at (115, 86), scaled to fit and
  loaded at the box's size. A book without a cover, or one whose image fails
  to load, shows the cloth cover: a brass frame, the title in Cormorant and
  the umbel.
- On the right, in a column 989 pixels wide: the title in Cormorant Garamond
  (at most 3 lines), the author in Lora italic and dusty rose (at most 2), the
  format in small capitals, the four rating rows, and the synopsis in Lora
  with as many lines as are left; the last line ends in an ellipsis. The
  column is centred on the cover box.
- The rating rows: Read (an open book in sage, or a closed one in ash), and
  five stars in brass, chillies in rust and knives in rose, the unfilled ones
  in ash.
- "The Hemlock" in brass at the lower right with an umbel, "Paused" above the
  column while the show is paused.
- Slides crossfade over one second.

### Blood and the chilli

The cover carries the web page's effects
([TV display § Blood and the chilli](display.md#blood-and-the-chilli)) as
images: `roku/scripts/images.js` draws `bloodMarkup` and `chilliMarkup` from
`client/src/pages/Display/effects.js` with the colours of `display.css`
resolved and the motion at its finished frame, and rasterises them with
`sharp` at the 1080p cover box: `blood-1.png` to `blood-5.png` (605×907, one
seed per level, so every book of a level bleeds alike) and `chilli-1.png` to
`chilli-5.png` (the box's bottom right corner, 96×136). On the TV the blood is
stretched over the cover's face (the image as it is scaled into the box, or
the whole box for the cloth cover), so a cover that is not 2:3 bleeds a
little longer or shorter than on the page; the chilli sits in the face's
bottom right corner, scaled with its width. On the cloth cover the brass
frame draws over the blood and under the chilli, as on the page. Both fade in over a second each
time a slide becomes current, once the cover has loaded.

## Timing

The channel keeps the web page's anchor rule
([TV display § Timing](display.md#timing)): the book at index `anchorIndex`
started at `anchorAt`, and the book on screen at time `t` is
`(anchorIndex + floor((t - anchorAt) / interval)) mod n`. A 500 ms `Timer`
recomputes it, so the clock never drifts and a stall catches up at once; a
refetch keeps the book on screen for the rest of its time; a deleted book
yields its position to the book now there; a clock that moves backwards
re-anchors. Three slides exist at once: the current one, the one fading out,
and the next one, whose cover is already loading.

## The remote

| Key | Effect |
|---|---|
| Play/Pause, OK | Pause and resume. Resuming keeps the time that remained and clears the highlight. |
| Right, Left | The next or previous book, which then gets a full interval. While a rating is highlighted, they change it instead. |
| Fast Forward, Rewind | The next or previous book, always. |
| Up, Down (paused) | The first press highlights Stars; then they move the highlight through Read, Stars, Spice and Gore. |
| Left, Right (highlighted) | Lower or raise the rating, 0 to 5; on Read they toggle it. OK toggles Read too. |
| Back | Leaves rating editing when a row is highlighted; otherwise leaves the channel. |
| Options (`*`) | Opens the settings dialog. |

### Rating edits

Each change is one `PATCH /api/books/:id` with that one field, the request
the library page's quick saves make. The slide shows the new value at once;
the saves go one at a time, in order, so a quick run of presses ends on the
last value; once none of a book's saves is left, the slide shows the values
the server answered. A failed save puts back the server's last values, drops
the book's saves queued behind it, and shows "Not saved: <message>" at the top
right for 3 seconds (the server's `error`, or "can't reach Hemlock"). A
refetched list waits while a row is highlighted, so the book being edited
never moves; it is applied when the highlight clears.

## Changes made elsewhere

`HttpTask` holds `GET <address>/api/changes?since=<version>&wait=25` open in a
loop. An answer with a version other than the last one makes the scene
refetch the list through the same merge as any refetch; the same version
means nothing changed and the next poll starts. A failed poll is retried
after 5 seconds, and a hold longer than 40 seconds is cancelled as a dead
connection. A server without the long poll answers 404; the channel then
refetches the list once a minute and asks again each time.

## Settings

| Setting | Default | Changed by |
|---|---|---|
| Address | `hemlock_base_url` in the manifest: `HEMLOCK_BASE_URL` at build time, else `http://10.0.5.10` | The settings dialog |
| Books | Owned (`owned`; also `all`, `read`, `unread`, the filters of `/api/display`) | The settings dialog |
| Seconds per book | 10 (5, 10, 15, 20, 30, 45, 60, 120 or 300) | The settings dialog |

The Options key opens the dialog over the slideshow: Up and Down choose a row,
OK on the address opens the on-screen keyboard (Save keeps an `http://` or
`https://` address, without a trailing slash), Left and Right change the other
two, and Back or Options closes it and applies the changes. They are kept in
the registry section `hemlock` on the TV. The address is stored only when it
differs from the build's default, so a channel rebuilt with a new default
reaches the TV unless the address was changed on the TV.

An address the TV cannot reach, or one that answers anything but the list,
shows one screen, "Can't reach Hemlock at <address>", and the channel tries
again every 30 seconds and whenever the long poll comes back. Once a list has
loaded, a failed refetch keeps the last list.

## Developer mode and sideloading

On the TV, once:

1. With the remote, press Home three times, Up twice, then Right, Left, Right,
   Left, Right. The developer settings screen opens.
2. Enable the installer, accept the Developer Tools License Agreement, and
   set a password; the TV restarts. The screen shows the TV's address
   (`http://<ip>`); it is also under Settings, Network, About.
3. For the key checks below: Settings, System, Advanced system settings,
   Control by mobile apps, Network access, "Default" or "Permissive".
   "Limited" answers every control-protocol key press with 403; the
   channel itself does not need the setting.

On the dev machine, the TV's details go in `~/.config/hemlock/rokudev.env`,
readable only by you (`chmod 600`), never in the repository:

```bash
ROKU_IP=192.168.1.40
ROKU_USERNAME=rokudev
ROKU_PASSWORD=<the developer password>
```

Then, from the root of the checkout:

```bash
HEMLOCK_BASE_URL=http://10.0.5.10 npm run roku:build
set -a; . ~/.config/hemlock/rokudev.env; set +a; npm run roku:install
```

The install replaces the sideloaded channel and starts it; it then sits in
the TV's home screen as "The Hemlock" until another channel is sideloaded or
developer mode is turned off.

## Commands

All run on the dev machine from the root of the checkout.

| Command | Does |
|---|---|
| `npm run roku:build` | Copies `roku/` to `dist/roku/`, writes `HEMLOCK_BASE_URL` (an `http` or `https` address, checked) into the manifest when it is set, renders the images, and zips the package to `dist/hemlock-roku.zip` with the manifest at its root. |
| `npm run roku:install` | Sideloads `dist/hemlock-roku.zip` to the TV with `roku-deploy`, reading `ROKU_IP`, `ROKU_USERNAME` (default `rokudev`) and `ROKU_PASSWORD` from the environment only. A compile error on the TV fails it. |
| `npm run roku:check` | BrighterScript's validation of the manifest, `source/` and `components/` (`roku/bsconfig.json`), with no output files. |

To try the channel against a dev server instead of the box, bind the
server to the LAN on a port of its own and build the channel for it:

```bash
HOST=0.0.0.0 PORT=5113 npm run dev -w server
HEMLOCK_BASE_URL=http://<this machine's LAN address>:5113 npm run roku:build
```

Everything the TV writes then lands in the checkout's own `data/`. Stop the
server when done: while it runs, anyone on the network can edit the dev
library.

## The screensaver

A Roku TV starts its screensaver over a channel that plays no video once the
TV's screensaver wait time passes without a key press, and the channel stops
underneath it. On Roku OS 15.3.4, with the slideshow open and a 10-minute
wait, the screensaver came up 10 minutes after the last key, and the
slideshow stood still until a key woke the TV; it then caught up to the slide
its clock gives. So the channel holds the screensaver off itself:
`roku/source/main.brs` calls `roAppManager.UpdateLastKeyPressTime()` once a
minute, and with it no screensaver came up in 25 minutes without a key.
Nothing on the TV needs changing, and the hold-off ends with the channel.
The debug console prints the TV's wait time when the channel starts
(`screensaver wait 10 minutes`; 0 when the screensaver is off).

A Roku TV can also turn itself off after hours without input; the channel
has not been run against that.

## Troubleshooting

- **The debug console.** `nc <ip> 8085` (or `telnet <ip> 8085`) on the dev
  machine prints the channel's compile errors, runtime errors and its own
  `[hemlock hh:mm:ss.mmm]` lines: the settings at start, each fetch, each
  slide, each pause, highlight and save, and the screensaver wait.
- **A screenshot.** Open `http://<ip>` in a browser, sign in as `rokudev`,
  and use Utilities, Screenshot while the channel runs.
- **"Can't reach Hemlock at …".** The address is wrong, the box is down, or
  the TV cannot reach it. Open `http://<address>/api/display` from another
  device on the same network; change the address with the Options key.
- **`roku:install` fails with 401.** The password in the env file is not the
  TV's developer password.
- **A control-protocol key press answers 403.** Network access is
  "Limited" (above).
- **Saves fail through the proxy's name.** A proxy that asks for a login lets
  the TV read but not write; use the box's LAN address
  ([Deployment § The reverse proxy](deployment.md#the-reverse-proxy)).
