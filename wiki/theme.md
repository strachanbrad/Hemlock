# Theme

How Hemlock looks and how to keep a new page in the same voice: the
identity, the palette with its contrast, the fonts, the ornaments, the
texture, covers without an image, and the rules for a new page or component.
The antd theme is built in `client/src/main.jsx` from
`client/src/config/config.json`; the same colours are CSS custom properties
on `:root` in `client/src/styles/index.css`.

## Identity

The library is **The Hemlock**: the name in `config.json`
(`website.title`), the header's wordmark (the logo, then "The" in light
italic and "Hemlock"), the document title, and the caption on the display
page. The project and the repository stay "Hemlock".

Hemlock is the centre of the identity, not a decoration: the name, the logo,
and the plant's reputation, the poison of Socrates, deadly and beautiful.
The art draws real poison hemlock (*Conium maculatum*): tall smooth stems
with purple blotches, lacy tripinnate leaves, and compound umbels of small
white flowers. The deadly beauty shows only in mood and restraint: an ink
ground, white umbels glowing against it, thin brass lines. The words stay
plain; the one small touch is the display caption.

The direction is dark romantic botanical, "a little emo but classy": no
clinical white, some clutter but never much. Two references set it:

- A painting of a skeleton overgrown with flowers on a near-black ground,
  the flowers rust-orange, cream, dusty rose and small violet sprigs with
  deep moss foliage. From it come the warm accents on the ink (rust and
  dusty rose for small things), the moss of the foliage, and the violet of
  the hemlock's stem blotches.
- A loose pen-and-ink sketch of a ribcage sprouting a single lily. From it
  comes the line: the ornaments are hand inked, scratchy and slightly
  uneven, like a nib on paper, and the one memento mori, a ribcage sprouting
  hemlock, is the faint watermark.

The brand mark is `client/public/logo.svg`, a woodcut hemlock in near-black
with sage highlights; the header uses `client/public/logo-cream.svg`, the
same drawing in cream and sage for the dark header. The ornaments echo its
silhouette and its sage, so the wordmark and the art read as one family.

## Palette

| Name | Hex | Custom property | antd token | Role |
|---|---|---|---|---|
| Ink | `#15121a` | `--ink` | `colorBgBase`, `colorBgLayout` | The page. |
| Deep ink | `#0f0d12` | `--ink-deep` | Layout `headerBg`, `siderBg`; Segmented `trackBg` | Header, sider, tab bar, sticky bars. |
| Surface | `#1d1922` | `--surface` | `colorBgContainer`; Drawer `colorBgElevated` | Drawers, inputs. |
| Lift | cream at 3.5% | `--lift` | Table `colorBgContainer` | Tables, cards and panels laid over the page; translucent, so the watermark shows through. |
| Raised | `#262030` | `--raised` | `colorBgElevated` | Dropdowns, popovers, modals. |
| Cloth | `#221c26` | `--cloth` | | Cover boxes. |
| Cream | `#efe6da` | `--cream` | `colorText`, `colorTextBase` | Text. |
| Muted | `#b8a9a0` | `--muted` | `colorTextSecondary` | Secondary text, counts, tags. |
| Faint | `#9a8b90` | `--faint` | `colorTextTertiary`, `colorTextPlaceholder`, `colorTextDescription` | Placeholders and form help. |
| Ash | `#7f7079` | `--ash` | | Unfilled ratings, unread, off the wishlist. |
| Border | `#74656f` | `--border` | `colorBorder` | Input and button borders. |
| Burgundy | `#89023e` (hover `#a3164f`) | `--primary` | `colorPrimary` | Primary buttons, selected segments and radios, the selected item's wash (`--primary-wash`). Never text or an icon on ink: it fails contrast there. |
| Brass | `#c9a86a` (light `#dcc08a`) | `--brass` | `colorLink`, `colorInfo`; Table `headerColor` | Hairlines (`--hairline` at 30%, `--hairline-faint` at 18%), ornaments, small-caps labels, links, the active nav mark, focus rings, stars. |
| Sage | `#7f9b7a` | `--sage` | `colorSuccess` | Read, success, the foliage of the faint watermarks. |
| Moss | `#4f6b4a` | `--moss` | | The foliage of the empty-state sprig, and the page's lower glow. |
| Rust | `#b5582c` | `--rust` | | The spice rating. |
| Dusty rose | `#c98b8b` | `--rose` | | The wishlist (bookmark, note, button), the gore rating, the display's author. |
| Violet | `#8f6f9f` | `--violet` | | The hemlock's stem blotches in the illustrations, nothing else. |
| Danger | `#de6f66` | `--danger` | `colorError` | Errors and Delete. |
| Warning | `#d9a441` | | `colorWarning` | Warnings. |

`config.json` and `:root` hold the same values; change both together. The
component tokens (Layout, Menu, Table, Drawer, Modal, Card, Input, Select,
Button, Tag, Segmented, Radio, Switch, Empty) are in `main.jsx` over
`theme.darkAlgorithm`.

### Contrast

WCAG 2 contrast of every pairing the pages use; a translucent colour is
blended over what it sits on first. Text needs 4.5:1, a control or icon 3:1.

| Text or mark | On | Ratio | Needs | Use |
|---|---|---|---|---|
| cream | ink | 15.00 | 4.5 | body text, titles |
| cream | lift (`#1d1921`) | 14.01 | 4.5 | text on tables, cards, panels |
| cream | surface | 14.00 | 4.5 | drawers, inputs |
| cream | raised | 12.77 | 4.5 | dropdowns, modals |
| cream | deep ink | 15.65 | 4.5 | header, sider, tab bar |
| cream | cloth (lightest, `#2c2232`) | 12.30 | 4.5 | cover placeholder title |
| cream | burgundy | 7.94 | 4.5 | primary buttons, selected segments |
| cream | burgundy hover | 6.10 | 4.5 | primary button, hover |
| cream | burgundy wash on deep ink | 13.97 | 4.5 | selected sider item |
| cream | burgundy wash on ink | 13.43 | 4.5 | active filter tags |
| muted | ink | 8.14 | 4.5 | secondary text |
| muted | lift | 7.60 | 4.5 | authors in the table |
| muted | surface | 7.59 | 4.5 | tags, edition details |
| muted | raised | 6.92 | 4.5 | dropdowns |
| muted | deep ink | 8.49 | 4.5 | sider and tab bar |
| faint | surface | 5.33 | 4.5 | placeholders |
| faint | ink | 5.71 | 4.5 | form help |
| faint | lift | 5.33 | 4.5 | form help in a panel |
| brass | ink | 8.20 | 4.5 | links, labels, display caption |
| brass | lift | 7.66 | 4.5 | labels in a panel |
| brass | table header | 8.21 | 4.5 | column headers |
| brass | surface | 7.65 | 4.5 | links in the drawer |
| brass | raised | 6.98 | 4.5 | links in modals |
| brass | deep ink | 8.55 | 4.5 | active tab |
| brass | cloth | 6.72 | 4.5 | cover placeholder initial |
| brass light | lift | 9.85 | 4.5 | hover |
| sage | lift | 5.66 | 4.5 | lookup notice |
| sage | surface, lift | 5.66 | 3 | read icon |
| rose | ink | 6.66 | 4.5 | wishlist note, display author |
| rose | surface | 6.22 | 4.5 | On the wishlist button |
| rose | lift | 6.22 | 3 | bookmark, gore icons |
| rust | lift, surface | 3.62 | 3 | spice icons |
| brass | lift | 7.66 | 3 | star icons |
| ash | lift | 3.71 | 3 | unfilled and off icons |
| ash | surface | 3.70 | 3 | unfilled icons in the drawer |
| border | surface | 3.16 | 3 | input and button borders |
| border | ink | 3.38 | 3 | input borders on the page |
| brass | surface | 7.65 | 3 | focus ring |
| danger | surface | 5.41 | 4.5 | Delete, errors |
| danger | ink | 5.80 | 4.5 | errors on the page |
| danger | raised | 4.93 | 4.5 | errors in a modal |
| warning | surface | 7.69 | 4.5 | warnings |

Rust and ash are for icons only; they are too dark for text.

## Fonts

Self-hosted from npm (`@fontsource-variable/cormorant-garamond`, `lora` and
`inter`, imported in `main.jsx`), so the build serves every file and the
browser asks no other host. Each family ships subsets by `unicode-range`; a
browser downloads only the ones a page uses.

| Font | Custom property | Where |
|---|---|---|
| Cormorant Garamond, 500 to 700, italic for section titles and "The" | `--font-display` | The wordmark, page titles (32px, 24px on a phone), section titles (22px italic), book titles in the table, cards, drawer (26px) and display, author names on the Authors page, the cover placeholder, the title field. |
| Lora | `--font-text` | Reading text: synopses (15px, line height 1.7), helper lines, form help, empty states, the lookup notice, the author in the drawer (italic), the credit line. |
| Inter | `--font-ui`, antd `fontFamily` | Everything else: menus, buttons, inputs, selects, tables, tags, filters, counts. Numbers are `tabular-nums`. Labels are small caps by tracking: 11.5px, weight 600, 0.12em, uppercase, brass (`.label-caps`). |

## Ornaments

`client/src/images/ornaments/`, imported as components from `index.js`
(`import { Rule } from '../images/ornaments/index.js'`). Each is hand inked
in `currentColor`, so CSS sets its colour with `color`; the foliage of the
sprig and the ribcage is a `.ornament-leaf` group, the stem blotches
`.ornament-blotch` and the bones `.ornament-bone`, each tintable by class. They
have no ids, no filters and no defs, so a page may render one many times.

| Ornament | viewBox | Use |
|---|---|---|
| `Umbel` | 32×32 | The mark on the current nav item, on cover placeholders, in the display caption, in a compact empty dropdown. Reads from 18px. |
| `Rule` | 240×20 | Under every page title (`PageHeading`, 220px) and section title (`SectionHeading`, 160px). |
| `Corner` | 40×40 | The four corners of the detail drawer's cover frame; drawn for the top left, mirrored with `scaleX(-1)` and `scaleY(-1)`. |
| `Sprig` | 200×340 | The empty-state illustration (`ShelfEmpty`), and a faint watermark in the detail drawer on a desktop. |
| `Ribcage` | 240×360 | The memento mori: a ribcage sprouting hemlock, a fixed watermark in the content area's lower right corner at 7.5% from 768px up. |

At most two ornaments show in a phone viewport: below 768px section titles
keep a plain hairline instead of the rule, and the watermarks are not
rendered.

## Texture and surfaces

- The paper grain is an inline SVG `feTurbulence` tile in the `html`
  background; a fixed `body::before` adds the vignette, a burgundy glow at
  the top right and a moss glow at the bottom left. `body` stays
  transparent so both show.
- Tables, cards and panels are translucent lifts with a brass hairline
  (`--hairline`) and a soft shadow; dividers inside them use
  `--hairline-faint`.
- Focus is a 2px brass outline on every control.
- Transitions are short (colour and a 1px lift on rating hover) and
  `prefers-reduced-motion` turns them all off.

## Covers without an image

`BookCover` (`client/src/components/BookCover.jsx`) without a URL is a cloth
cover: a dark woven gradient with a spine shadow, a brass hairline frame and
the umbel, with the title in Cormorant when large and its initial in brass
italic when small. It is `role="img"` named "No cover: <title>". The display
page's fallback is the same cloth at stage scale.

## A new page or component

1. Start the page with `<PageHeading meta={count}>Title</PageHeading>` and
   divide it with `<SectionHeading>` (`client/src/components/Headings.jsx`).
2. Put content that sits on the page on a lift with a hairline (as
   `.add-find`, `.take-row`, `.book-card`); a drawer or modal is already a
   surface.
3. Take colours from the tokens or the custom properties, never a new hex:
   cream and muted for text, brass for labels, links and hairlines, burgundy
   only as a background, rose for anything about the wishlist, sage for read
   and success. Check any new pairing against the table above.
4. Book titles and page titles in `--font-display`; anything a person reads
   as prose in `--font-text`; controls and data in Inter.
5. An empty list is `<ShelfEmpty description="…">` with its next step as a
   child; antd's own empty states already use it through `renderEmpty`.
6. No more ornaments than the page needs: one rule per title, nothing new on
   a phone.
