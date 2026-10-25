# Roadmap

The work planned for Hemlock and what was decided against. This page
describes work that does not exist yet, in the present-tense voice of the rest
of the wiki; a step leaves this page when it is built and is described on its
own page. Nothing is deployed, so a step may change the schema, the API or the
file layout without a compatibility path.

## Later

- An admin page for theming and preferences, and the choice of which ratings
  to show.

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
- **User accounts.** The app sits behind the owner's reverse proxy for one
  household; access control belongs to the proxy.
