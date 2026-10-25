# Hemlock Wiki

Hemlock catalogues a personal book collection: books with star, spice and gore
ratings and read status, ebooks and a wishlist of physical copies to buy, and a
slideshow of covers for a television. A React and Ant Design client talks to an
Express server over a JSON API; the server keeps everything in one SQLite
database and a directory of cover images.

A newcomer starts with [Development setup](dev-setup.md) to run the app,
[Style](style.md) for the conventions every change follows and
[Roadmap](roadmap.md) for the work that is planned.

## Contents

- [Development setup](dev-setup.md): install, the dev library, ports and
  `DATA_DIR`, the everyday commands, tests.
- [Library](library.md): books, editions and authors, the cover rule, the
  API with its errors, live updates, the pages on desktop and phone, and the
  dev seed.
- [TV display](display.md): the `/display` slideshow, `GET /api/display`,
  and the ways to get the page onto a television.
- [Migrations](migrations.md): numbered SQL files, how they are applied, and
  the rules for writing one.
- [Lookup](lookup.md): ISBN lookup from Open Library and Google Books, the
  Claude lookup when both miss, cover downloads, finding a better cover
  with Claude, and barcode scanning with the phone camera.
- [Admin](admin.md): the hidden `/admin` page, its password and sessions,
  the lookup keys and settings, and how their secrets are encrypted.
- [Security](security.md): bind address, error bodies, upload bounds,
  generated cover names, downloads, the live updates stream, SQL, admin
  sessions and secrets.
- [Style](style.md): comments, license headers, wiki pages, commits, Ant
  Design usage and responsive layout.
- [Theme](theme.md): the look of The Hemlock: palette and contrast, fonts,
  ornaments, texture, covers without an image, and the rules for a new page.
- [Deployment](deployment.md): the box, install and redeploy, the paths,
  secrets, backups and restore, logs, and the reverse proxy's requirements.
- [Roadmap](roadmap.md): planned work, in order, and what was decided against.
