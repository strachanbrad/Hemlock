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
export const NUDGE = 'Call report_book now with what you found, or with found false.'

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
   - cover_url: a direct image URL of the cover that appears on the listing (its og:image or the cover's <img>), else null. Never build an image URL yourself.
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

export const TOOLS = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, REPORT_BOOK]

export function question(isbn) {
  const isbn10 = isbn13To10(isbn)
  return `Identify the book with ISBN-13 ${isbn}${isbn10 ? ` (ISBN-10 ${isbn10})` : ''} and report it with report_book.`
}

const bound = (text, max) => (text && text.length > max ? [...text].slice(0, max).join('').trimEnd() : text)
const line = (value, max) => bound(clean(value), max)

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL || !URL.canParse(value)) return null
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
}

const NOT_FOUND = Object.freeze({ status: 'not_found' })

// The model's answer is untrusted: only a listing that shows this ISBN counts, and every field is
// bounded and checked here whatever the schema promised.
export function verdict(isbn, input, log = () => {}) {
  if (input?.found !== true) return NOT_FOUND
  const shown = normalizeIsbn(typeof input.isbn_on_listing === 'string' ? input.isbn_on_listing : '')
  if (shown !== isbn && shown !== isbn13To10(isbn)) {
    log(`Claude lookup of ${isbn}: the listing shows ISBN ${JSON.stringify(shown.slice(0, 20))}; not accepted`)
    return NOT_FOUND
  }
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
      cover_url: cover ? cover.href : null,
      source_url: httpsUrl(input.source_url),
    },
  }
}

// Resolves identify(isbn13) to { status: 'ok', record } | { status: 'not_found' } |
// { status: 'failed', message }, and probe() to { ok, detail | error }; neither rejects for an upstream problem.
export function createAnthropic({ apiKey, model = DEFAULT_MODEL, fetch = globalThis.fetch, timeoutMs = 90000, log = console.warn }) {
  const client = new Anthropic({ apiKey, fetch, timeout: timeoutMs, maxRetries: 0, logLevel: 'off' })
  const redact = (text) => (apiKey ? String(text).split(apiKey).join('[redacted]') : String(text))
  const describe = (err) => {
    if (err instanceof Anthropic.APIError && err.status) return redact(`Anthropic answered HTTP ${err.status}: ${err.error?.error?.message ?? err.message}`)
    return redact(`Anthropic did not answer: ${err.message}`)
  }
  const failed = (isbn, message) => {
    log(`Claude lookup of ${isbn} failed: ${message}`)
    return { status: 'failed', message }
  }

  async function identify(isbn) {
    const messages = [{ role: 'user', content: question(isbn) }]
    let nudged = false
    for (let sent = 0; sent < MAX_REQUESTS; sent++) {
      let response
      try {
        response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM,
          tools: TOOLS,
          tool_choice: { type: 'auto' },
          output_config: { effort: 'medium' },
          messages,
        })
      } catch (err) {
        return failed(isbn, describe(err))
      }
      const { stop_reason: stop, content } = response
      // A turn cut off by max_tokens or a refusal can hold a partial report_book input.
      if (stop === 'max_tokens') return failed(isbn, 'Claude ran out of room before it answered')
      if (stop === 'refusal') return failed(isbn, 'Claude declined to look the book up')
      const call = content.find((block) => block.type === 'tool_use' && block.name === 'report_book')
      if (call) return verdict(isbn, call.input, log)
      // A paused server-side search resumes from the assistant turn alone; added user text would break it.
      if (stop === 'pause_turn') {
        messages.push({ role: 'assistant', content })
        continue
      }
      if (stop === 'end_turn' && !nudged) {
        messages.push({ role: 'assistant', content }, { role: 'user', content: NUDGE })
        nudged = true
        continue
      }
      return failed(isbn, `Claude stopped (${stop}) without reporting a book`)
    }
    return failed(isbn, `Claude did not answer within ${MAX_REQUESTS} requests`)
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

  return { identify, probe }
}
