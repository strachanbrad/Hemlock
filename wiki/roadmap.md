# Roadmap

The work planned for Hemlock and what was decided against. This page
describes work that does not exist yet, in the present-tense voice of the rest
of the wiki; a step leaves this page when it is built and is described on its
own page. Hemlock is deployed and holds a real library, so a step that changes
the schema does it with a new migration over the rows already there
([Migrations](migrations.md)).

## Later

- Theming and preferences on the admin page ([Admin](admin.md)), and the
  choice of which ratings to show.

## Decided against

- **ISBNdb.** A paid subscription for data Open Library (and Google Books,
  with a key) provide for a personal library.
- **Docker Compose and Caddy.** The host runs nginx, Node and SQLite
  directly; TLS belongs to the owner's existing reverse proxy.
- **A status on editions.** A wishlist row would need a format before the
  format is known, and owned is already "has an edition"; the wish is a flag
  on the book.
- **A third table for individual copies.** Books and editions cover what is
  owned and what is wanted; a copies table is added only if purchase dates,
  prices or loans are wanted.
- **Roles and per-user libraries.** Every user sees and edits everything;
  only the admin password reaches `/admin` ([Admin § Users](admin.md#users)).
