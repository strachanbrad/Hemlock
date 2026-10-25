/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import Anthropic from '@anthropic-ai/sdk'
import { allowedCoverUrl } from '../covers.js'
import { isbn13To10, normalizeIsbn } from '../lib/isbn.js'
import { FORMATS, isPublished } from '../validate.js'
import { clean, names, normalizeText } from './merge.js'

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const MAX_REQUESTS = 3
const MAX_TOKENS = 8000
const MAX_URL = 2048
const nudge = (tool) => `Call ${tool} now with what you found, or with found false.`
export const NUDGE = nudge('report_book')

const SYSTEM = `You identify one book edition from its ISBN for a household's library catalogue. The book catalogues do not know this ISBN, so you search the web for it.

1. Search for the ISBN-13 and, when the book has one, its ISBN-10, each as a quoted string (for example "9781969253096").
2. Use the best listing of this exact edition: the publisher's page, Amazon, Goodreads, Bookshop.org, Google Books, WorldCat, Barnes & Noble or the author's own site.
3. Accept a listing only when it shows this ISBN-13 or its ISBN-10, and report that ISBN, as the listing prints it, in isbn_on_listing.
4. Copy every field as the listing shows it, never from memory and never from another edition:
   - title: the title, without a series name in parentheses or the format.
   - authors: the names as printed, in order, without roles such as Illustrator or Narrator.
   - publisher: the publisher or imprint.
   - published: the publication date as YYYY, YYYY-MM or YYYY-MM-DD.
   - format: hardcover, paperback or ebook, from the listing's binding; null for anything else, such as an audiobook.
   - synopsis: the publisher's description from the page, trimmed at a sentence end to about 1,500 characters. Never your own summary and never a review.
   - cover_url: a direct image URL of the listing's main cover image (its og:image or the cover's <img>), at the largest size the listing offers, else null. Never build an image URL yourself.
   - source_url: the address of the listing you copied from.
5. When no listing shows this ISBN, report found false with every other field null. Never guess from a book with a similar title.

Finish by calling report_book exactly once. Never write the answer as text.`

const nullable = (schema, description) => ({ anyOf: [schema, { type: 'null' }], description })

const REPORT_BOOK = {
  name: 'report_book',
  description: 'Report the edition this ISBN identifies. Call it exactly once, as the last step: with the fields copied from a listing that shows this ISBN, or with found false and every other field null when no listing does.',
  // Not strict: strict tools share structured outputs' limits, which reject citations, and web search
  // answers carry citations. verdict() checks every field anyway.
  input_schema: {
    type: 'object',
    properties: {
      found: { type: 'boolean', description: 'True only when a listing shows this ISBN-13 or its ISBN-10.' },
      isbn_on_listing: nullable({ type: 'string' }, 'The ISBN exactly as the listing prints it.'),
      title: nullable({ type: 'string' }, 'The title as the listing shows it.'),
      authors: nullable({ type: 'array', items: { type: 'string' } }, 'The authors as printed, in order, without roles.'),
      publisher: nullable({ type: 'string' }, 'The publisher or imprint.'),
      published: nullable({ type: 'string' }, 'YYYY, YYYY-MM or YYYY-MM-DD.'),
      format: nullable({ type: 'string', enum: FORMATS }, "The listing's binding."),
      synopsis: nullable({ type: 'string' }, "The publisher's description from the listing, about 1,500 characters at most."),
      cover_url: nullable({ type: 'string' }, 'A direct image URL of the cover that appears on the listing.'),
      source_url: nullable({ type: 'string' }, 'The address of the listing.'),
    },
    required: ['found', 'isbn_on_listing', 'title', 'authors', 'publisher', 'published', 'format', 'synopsis', 'cover_url', 'source_url'],
    additionalProperties: false,
  },
}

const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }
export const TOOLS = [WEB_SEARCH, REPORT_BOOK]

const isbnText = (isbn) => {
  const isbn10 = isbn13To10(isbn)
  return `ISBN-13 ${isbn}${isbn10 ? ` (ISBN-10 ${isbn10})` : ''}`
}

export function question(isbn) {
  return `Identify the book with ${isbnText(isbn)} and report it with report_book.`
}

const COVER_SYSTEM = `You find the cover image of one book edition for a household's library catalogue, at the largest size the web offers.

1. Search once for the ISBN-13 as a quoted string (for example "9781969253096"), and once for the exact title and author only when that finds no listing. When no ISBN is given, search for the exact title and author.
2. Open a listing of this exact edition with web_fetch, and only at a URL that appeared in a search result. Amazon, Goodreads and Bookshop.org pages cannot be opened, so do not try them. Barnes & Noble, AbeBooks, Google Books, the publisher's and the author's pages can be opened.
3. When an ISBN is given, accept a listing only when it shows that ISBN-13 or its ISBN-10, and report that ISBN, as the listing prints it, in isbn_on_listing. When no ISBN is given, accept a listing only when it shows the exact title and author, and report isbn_on_listing null.
4. Report in cover_url the page's og:image or its main cover image, exactly as the page gives it; never build or change an image URL. Report the listing's address in source_url.
5. When no listing of this exact edition shows a cover, report found false with every other field null. Never report the cover of another edition, format or printing, however similar.

Finish by calling report_cover exactly once. Never write the answer as text.`

const REPORT_COVER = {
  name: 'report_cover',
  description: 'Report the largest cover image of this edition. Call it exactly once, as the last step: with the image URL from a listing of this exact edition, or with found false and every other field null when no listing shows one.',
  input_schema: {
    type: 'object',
    properties: {
      found: { type: 'boolean', description: 'True only when a listing of this exact edition shows its cover.' },
      cover_url: nullable({ type: 'string' }, 'The direct URL of the largest cover image the listing offers.'),
      source_url: nullable({ type: 'string' }, 'The address of the listing.'),
      isbn_on_listing: nullable({ type: 'string' }, 'The ISBN exactly as the listing prints it; null when no ISBN was given.'),
    },
    required: ['found', 'cover_url', 'source_url', 'isbn_on_listing'],
    additionalProperties: false,
  },
}

// Search results carry no image URLs, so the cover search opens the listing itself.
export const COVER_TOOLS = [{ ...WEB_SEARCH, max_uses: 3 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 }, REPORT_COVER]

// `subject` is { isbn } (an ISBN-13) or { title, author } for a book without one.
export function coverQuestion(subject) {
  const edition = subject.isbn ? `the book with ${isbnText(subject.isbn)}` : `“${subject.title}” by ${subject.author}, which has no ISBN in the catalogue,`
  return `Find the largest cover image of ${edition} and report it with report_cover.`
}

const bound = (text, max) => (text && text.length > max ? [...text].slice(0, max).join('').trimEnd() : text)
const line = (value, max) => bound(clean(value), max)

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL || !URL.canParse(value)) return null
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
}

const NOT_FOUND = Object.freeze({ status: 'not_found' })

function showsIsbn(isbn, input, log, label) {
  const shown = normalizeIsbn(typeof input.isbn_on_listing === 'string' ? input.isbn_on_listing : '')
  if (shown === isbn || shown === isbn13To10(isbn)) return true
  log(`${label}: the listing shows ISBN ${JSON.stringify(shown.slice(0, 20))}; not accepted`)
  return false
}

const AMAZON_IMAGES = (host) => host === 'm.media-amazon.com' || host === 'images-na.ssl-images-amazon.com' || host.endsWith('.images-amazon.com')

// An Amazon image URL names its size in the file name (81abcXYZL._SY466_.jpg); without it the CDN
// serves the original upload, the largest there is.
export function largestCover(url) {
  if (AMAZON_IMAGES(url.hostname)) url.pathname = url.pathname.replace(/([^/])(?:\._[^./]*_)+(\.[a-z]+)$/i, '$1$2')
  return url
}

// The model's answer is untrusted: only a listing that shows this ISBN counts, and every field is
// bounded and checked here whatever the schema promised.
export function verdict(isbn, input, log = () => {}) {
  if (input?.found !== true || !showsIsbn(isbn, input, log, `Claude lookup of ${isbn}`)) return NOT_FOUND
  const synopsis = typeof input.synopsis === 'string' ? bound(normalizeText(input.synopsis), 4000) || null : null
  const published = typeof input.published === 'string' && isPublished(input.published.trim()) ? input.published.trim() : null
  const cover = typeof input.cover_url === 'string' && input.cover_url.length <= MAX_URL ? allowedCoverUrl(input.cover_url) : null
  return {
    status: 'ok',
    record: {
      isbn,
      title: line(input.title, 500),
      authors: (names(input.authors) ?? []).slice(0, 10).map((name) => bound(name, 200)),
      publisher: line(input.publisher, 200),
      published,
      synopsis,
      format: FORMATS.includes(input.format) ? input.format : null,
      cover_url: cover ? largestCover(cover).href : null,
      source_url: httpsUrl(input.source_url),
    },
  }
}

const coverLabel = (subject) => `Claude cover search for ${subject.isbn ? `ISBN ${subject.isbn}` : JSON.stringify(bound(subject.title, 80))}`

// As verdict(): a cover off the allow-list counts as not found, since it could never be downloaded.
export function coverVerdict(subject, input, log = () => {}) {
  if (input?.found !== true) return NOT_FOUND
  if (subject.isbn && !showsIsbn(subject.isbn, input, log, coverLabel(subject))) return NOT_FOUND
  const cover = typeof input.cover_url === 'string' && input.cover_url.length <= MAX_URL ? allowedCoverUrl(input.cover_url) : null
  if (!cover) {
    log(`${coverLabel(subject)}: the cover is not on an allowed image host; not accepted`)
    return NOT_FOUND
  }
  return { status: 'ok', cover_url: largestCover(cover).href, source_url: httpsUrl(input.source_url) }
}

const IDENTIFY = { system: SYSTEM, tools: TOOLS, tool: 'report_book', declined: 'Claude declined to look the book up', reported: 'a book' }
const FIND_COVER = { system: COVER_SYSTEM, tools: COVER_TOOLS, tool: 'report_cover', declined: 'Claude declined to look for the cover', reported: 'a cover' }

// Resolves identify(isbn13) to { status: 'ok', record } | { status: 'not_found' } | { status: 'failed', message },
// findCover(subject) to { status: 'ok', cover_url, source_url } or the same two, and probe() to { ok, detail | error };
// none rejects for an upstream problem.
export function createAnthropic({ apiKey, model = DEFAULT_MODEL, fetch = globalThis.fetch, timeoutMs = 90000, log = console.warn }) {
  const client = new Anthropic({ apiKey, fetch, timeout: timeoutMs, maxRetries: 0, logLevel: 'off' })
  const redact = (text) => (apiKey ? String(text).split(apiKey).join('[redacted]') : String(text))
  const describe = (err) => {
    if (err instanceof Anthropic.APIError && err.status) return redact(`Anthropic answered HTTP ${err.status}: ${err.error?.error?.message ?? err.message}`)
    return redact(`Anthropic did not answer: ${err.message}`)
  }
  // Searches until Claude calls the task's report tool: resolves to { input } or to a failure, logged with `label`.
  async function converse(task, prompt, label) {
    const failed = (message) => {
      log(`${label} failed: ${message}`)
      return { status: 'failed', message }
    }
    const messages = [{ role: 'user', content: prompt }]
    let nudged = false
    for (let sent = 0; sent < MAX_REQUESTS; sent++) {
      let response
      try {
        response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: task.system,
          tools: task.tools,
          tool_choice: { type: 'auto' },
          output_config: { effort: 'medium' },
          messages,
        })
      } catch (err) {
        return failed(describe(err))
      }
      const { stop_reason: stop, content } = response
      // A turn cut off by max_tokens or a refusal can hold a partial report input.
      if (stop === 'max_tokens') return failed('Claude ran out of room before it answered')
      if (stop === 'refusal') return failed(task.declined)
      const call = content.find((block) => block.type === 'tool_use' && block.name === task.tool)
      if (call) return { input: call.input }
      // A paused server-side search resumes from the assistant turn alone; added user text would break it.
      if (stop === 'pause_turn') {
        messages.push({ role: 'assistant', content })
        continue
      }
      if (stop === 'end_turn' && !nudged) {
        messages.push({ role: 'assistant', content }, { role: 'user', content: nudge(task.tool) })
        nudged = true
        continue
      }
      return failed(`Claude stopped (${stop}) without reporting ${task.reported}`)
    }
    return failed(`Claude did not answer within ${MAX_REQUESTS} requests`)
  }

  async function identify(isbn) {
    const answer = await converse(IDENTIFY, question(isbn), `Claude lookup of ${isbn}`)
    return answer.status === 'failed' ? answer : verdict(isbn, answer.input, log)
  }

  async function findCover(subject) {
    const answer = await converse(FIND_COVER, coverQuestion(subject), coverLabel(subject))
    return answer.status === 'failed' ? answer : coverVerdict(subject, answer.input, log)
  }

  async function probe() {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 64,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Reply with the single word ok.' }],
      })
      const reply = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim()
      return { ok: true, detail: reply ? `${response.model} replied “${bound(reply, 40)}”` : `${response.model} answered (${response.stop_reason})` }
    } catch (err) {
      return { ok: false, error: describe(err) }
    }
  }

  return { identify, findCover, probe }
}
