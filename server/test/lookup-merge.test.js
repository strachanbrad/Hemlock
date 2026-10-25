/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answer, googleThumbnail, mapFormat, merge, normalizeDate, normalizeDescription, stripHtml } from '../src/lookup/merge.js'

const ISBN = '9780553212587'
const DISABLED = { status: 'disabled' }

const olFull = () => ({
  status: 'ok',
  doc: { key: '/works/OL1W', title: 'Work Title', author_name: ['Work Author'], cover_i: 222 },
  searchEdition: { key: '/books/OL1M', title: 'Search Edition Title', publisher: ['Search Publisher'], publish_date: ['1999'], cover_i: 333, isbn: [ISBN] },
  edition: {
    title: '  Edition   Title ',
    physical_format: 'Library Binding',
    description: 'Edition text',
    publishers: ['Edition Publisher', 'Second Publisher'],
    publish_date: 'February 21, 2006',
    covers: [111, 112],
  },
  work: { title: 'Work Record Title', description: { type: '/type/text', value: 'Work text' }, covers: [444] },
})

const googleExact = () => ({
  status: 'ok',
  volume: {
    title: 'Google Title',
    authors: ['Google Author', 'Second Author'],
    publisher: 'Google Publisher',
    publishedDate: '2006-02',
    description: '<p>Google <b>text</b></p>',
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' },
  },
})

const GOOGLE_COVER = 'https://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&source=gbs_api&fife=w1600'
const olCover = (id) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`

function without(record, path) {
  const [first, ...rest] = path.split('.')
  if (rest.length === 0) delete record[first]
  else without(record[first], rest.join('.'))
  return record
}

describe('merge', () => {
  const cases = [
    {
      name: 'Google exact wins every field it has, except the cover and the format',
      google: googleExact(),
      openLibrary: olFull(),
      expect: {
        title: 'Google Title',
        authors: ['Google Author', 'Second Author'],
        publisher: 'Google Publisher',
        published: '2006-02',
        synopsis: 'Google text',
        format: 'hardcover',
        cover_url: olCover(111),
      },
      fields: { title: 'google', authors: 'google', publisher: 'google', published: 'google', synopsis: 'google', format: 'open_library', cover_url: 'open_library' },
    },
    {
      name: 'Open Library alone uses the edition record, trimmed and normalised',
      google: DISABLED,
      openLibrary: olFull(),
      expect: {
        title: 'Edition Title',
        authors: ['Work Author'],
        publisher: 'Edition Publisher',
        published: '2006-02-21',
        synopsis: 'Edition text',
        format: 'hardcover',
        cover_url: olCover(111),
      },
      fields: { title: 'open_library', authors: 'open_library', publisher: 'open_library', published: 'open_library', synopsis: 'open_library', format: 'open_library', cover_url: 'open_library' },
    },
    {
      name: 'an edition record without the fields falls back to the search edition, then the work',
      google: DISABLED,
      openLibrary: { ...olFull(), edition: { covers: [-1, 0] } },
      expect: { title: 'Search Edition Title', publisher: 'Search Publisher', published: '1999', synopsis: 'Work text', format: null, cover_url: olCover(333) },
      fields: { title: 'open_library', authors: 'open_library', publisher: 'open_library', published: 'open_library', synopsis: 'open_library_work', cover_url: 'open_library' },
    },
    {
      name: 'without an accepted edition only the work speaks, flagged as the work',
      google: DISABLED,
      openLibrary: { ...olFull(), searchEdition: null, edition: null },
      expect: { title: 'Work Title', authors: ['Work Author'], publisher: null, published: null, synopsis: 'Work text', format: null, cover_url: olCover(222) },
      fields: { title: 'open_library_work', authors: 'open_library', synopsis: 'open_library_work', cover_url: 'open_library_work' },
    },
    {
      name: 'the Google exact cover beats the work cover, on https with fife=w1600 and without edge=curl',
      google: googleExact(),
      openLibrary: { ...olFull(), searchEdition: null, edition: null },
      expect: { cover_url: GOOGLE_COVER },
      fieldsInclude: { cover_url: 'google' },
    },
    {
      name: 'cover ids of zero or below are ignored everywhere',
      google: DISABLED,
      openLibrary: { ...olFull(), searchEdition: { cover_i: -1 }, edition: { covers: [-1] }, doc: { cover_i: 0 }, work: { covers: [-1, 444] } },
      expect: { cover_url: olCover(444) },
      fieldsInclude: { cover_url: 'open_library_work' },
    },
    {
      name: 'blank values count as missing',
      google: { status: 'ok', volume: { title: '   ', authors: ['', ' '], publisher: '', publishedDate: 'n.d.', description: '<p> </p>' } },
      openLibrary: olFull(),
      expect: { title: 'Edition Title', authors: ['Work Author'], publisher: 'Edition Publisher', published: '2006-02-21', synopsis: 'Edition text' },
      fieldsInclude: { title: 'open_library', authors: 'open_library', synopsis: 'open_library' },
    },
    {
      name: 'a failed Google leaves the Open Library answer standing',
      google: { status: 'failed' },
      openLibrary: olFull(),
      expect: { title: 'Edition Title', synopsis: 'Edition text' },
      sources: { google: 'failed', open_library: 'ok' },
    },
    {
      name: 'Google alone fills what it has and leaves the format empty',
      google: googleExact(),
      openLibrary: { status: 'not_found' },
      expect: { title: 'Google Title', format: null, cover_url: GOOGLE_COVER },
      fields: { title: 'google', authors: 'google', publisher: 'google', published: 'google', synopsis: 'google', cover_url: 'google' },
      sources: { google: 'ok', open_library: 'not_found' },
    },
    {
      name: 'author names are cleaned and repeated names dropped',
      google: DISABLED,
      openLibrary: { ...olFull(), doc: { author_name: ['  Emily   Brontë ', 'emily brontë', 'Anne Brontë'] } },
      expect: { authors: ['Emily Brontë', 'Anne Brontë'] },
    },
    {
      name: 'decomposed text is composed, so a name matches the same name typed',
      google: DISABLED,
      openLibrary: { ...olFull(), doc: { author_name: ['Emily Brontë'] }, edition: { title: 'Café', description: 'Naïve' } },
      expect: { authors: ['Emily Brontë'], title: 'Café', synopsis: 'Naïve' },
    },
    {
      name: 'nothing usable gives nulls and an empty author list',
      google: DISABLED,
      openLibrary: { status: 'ok', doc: { key: '/works/OL1W' }, searchEdition: null, edition: null, work: null },
      expect: { title: null, authors: [], publisher: null, published: null, synopsis: null, format: null, cover_url: null },
      fields: {},
    },
  ]

  for (const { name, google, openLibrary, expect, fields, fieldsInclude, sources } of cases) {
    it(name, () => {
      const record = merge(ISBN, google, openLibrary)
      assert.equal(record.isbn, ISBN)
      for (const [field, value] of Object.entries(expect)) assert.deepEqual(record[field], value, field)
      if (fields) assert.deepEqual(record.sources.fields, fields)
      for (const [field, source] of Object.entries(fieldsInclude ?? {})) assert.equal(record.sources.fields[field], source, field)
      assert.equal(record.sources.google, sources?.google ?? google.status)
      assert.equal(record.sources.open_library, sources?.open_library ?? openLibrary.status)
    })
  }

  it('answers with every contract field, in order', () => {
    assert.deepEqual(Object.keys(merge(ISBN, DISABLED, olFull())), ['isbn', 'title', 'authors', 'publisher', 'published', 'synopsis', 'format', 'cover_url', 'sources'])
  })

  it('ignores the data of a source that is not ok', () => {
    const record = merge(ISBN, { ...googleExact(), status: 'failed' }, { ...olFull(), status: 'failed' })
    assert.equal(record.title, null)
    assert.deepEqual(record.sources.fields, {})
  })

  it('does not need the optional parts of an Open Library answer', () => {
    const record = merge(ISBN, DISABLED, without(olFull(), 'work'))
    assert.equal(record.synopsis, 'Edition text')
  })
})

describe('the cover choice', () => {
  const BN = 'https://cdn.shopify.com/s/files/1/0674/5433/7265/files/9780553212587_p0.jpg'
  const AMAZON = 'https://images-na.ssl-images-amazon.com/images/P/0553212583.01.LZZZZZZZ.jpg'
  const noEditionCover = () => without(without(olFull(), 'edition.covers'), 'searchEdition.cover_i')
  const cover = (google, openLibrary, covers) => {
    const record = merge(ISBN, google, openLibrary, covers)
    return [record.cover_url, record.sources.fields.cover_url]
  }

  it('takes Barnes & Noble, then Amazon, then the Open Library edition, then Google, then the work', () => {
    assert.deepEqual(cover(googleExact(), olFull(), { barnes_noble: BN, amazon: AMAZON }), [BN, 'barnes_noble'])
    assert.deepEqual(cover(googleExact(), olFull(), { barnes_noble: null, amazon: AMAZON }), [AMAZON, 'amazon'])
    assert.deepEqual(cover(googleExact(), olFull(), { barnes_noble: null, amazon: null }), [olCover(111), 'open_library'])
    assert.deepEqual(cover(googleExact(), noEditionCover(), { barnes_noble: null, amazon: null }), [GOOGLE_COVER, 'google'])
    assert.deepEqual(cover(DISABLED, noEditionCover(), {}), [olCover(222), 'open_library_work'])
  })

  it('takes the probes through answer(), and none from a failed probe', () => {
    const covers = { status: 'ok', barnes_noble: BN, amazon: null }
    assert.equal(answer(ISBN, DISABLED, olFull(), { covers }).body.cover_url, BN)
    assert.equal(answer(ISBN, DISABLED, olFull(), { covers: { status: 'failed' } }).body.cover_url, olCover(111))
    assert.equal(answer(ISBN, DISABLED, olFull()).body.cover_url, olCover(111))
  })
})

describe('answer', () => {
  const cases = [
    ['ok', 'not_found', 200],
    ['disabled', 'ok', 200],
    ['failed', 'ok', 200],
    ['ok', 'failed', 200],
    ['disabled', 'not_found', 404],
    ['not_found', 'not_found', 404],
    ['disabled', 'failed', 502],
    ['failed', 'not_found', 502],
    ['not_found', 'failed', 502],
    ['failed', 'failed', 502],
  ]
  for (const [google, openLibrary, status] of cases) {
    it(`answers ${status} when Google is ${google} and Open Library ${openLibrary}`, () => {
      const result = answer(ISBN, { ...googleExact(), status: google }, { ...olFull(), status: openLibrary })
      assert.equal(result.status, status)
      if (status === 200) assert.deepEqual(result.body.sources, { ...result.body.sources, google, open_library: openLibrary, anthropic: 'disabled' })
      else assert.deepEqual(result.body.sources, { google, open_library: openLibrary, anthropic: 'disabled' })
    })
  }

  it('offers Claude only when no source answered ok and a Claude key is set', () => {
    const claude = (google, openLibrary) => answer(ISBN, { ...googleExact(), status: google }, { ...olFull(), status: openLibrary }, { claude: true }).body.sources.anthropic
    assert.equal(claude('disabled', 'not_found'), 'available')
    assert.equal(claude('failed', 'failed'), 'available')
    assert.equal(claude('disabled', 'ok'), 'disabled')
    assert.equal(claude('ok', 'not_found'), 'disabled')
  })
})

describe('normalizeDate', () => {
  const cases = [
    ['1981-03', '1981-03'],
    ['2012', '2012'],
    ['2025-07-26', '2025-07-26'],
    ['2004-7', '2004-07'],
    ['February 21, 2006', '2006-02-21'],
    ['September 1, 1997', '1997-09-01'],
    ['Sept 5, 2001', '2001-09-05'],
    ['21 February 2006', '2006-02-21'],
    ['1st March 2010', '2010-03-01'],
    ['July 2004', '2004-07'],
    ['Feb. 2006', '2006-02'],
    ['16/06/2024', '2024'],
    ['2009?', '2009'],
    ['c1997', '1997'],
    ['2012-02-30', '2012'],
    ['February 30, 2006', '2006'],
    ['Smarch 2004', '2004'],
    ['  July   2004 ', '2004-07'],
    ['0999', null],
    ['unknown', null],
    ['', null],
    [undefined, null],
    [2012, null],
  ]
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => assert.equal(normalizeDate(input), expected))
  }
})

describe('mapFormat', () => {
  const cases = [
    ['Mass Market Paperback', 'paperback'],
    ['Paperback', 'paperback'],
    ['paperback', 'paperback'],
    ['Trade Paperback', 'paperback'],
    ['Softcover', 'paperback'],
    ['Perfect Paperback', 'paperback'],
    ['Hardcover', 'hardcover'],
    ['hardback', 'hardcover'],
    ['Library Binding', 'hardcover'],
    ['Ebook', 'ebook'],
    ['E-book', 'ebook'],
    ['Kindle Edition', 'ebook'],
    ['EPUB', 'ebook'],
    ['Digital', 'ebook'],
    ['Audio CD', null],
    ['Board book', null],
    ['', null],
    [undefined, null],
  ]
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => assert.equal(mapFormat(input), expected))
  }
})

describe('normalizeDescription', () => {
  it('reads a string or a { value } record', () => {
    assert.equal(normalizeDescription('Plain'), 'Plain')
    assert.equal(normalizeDescription({ type: '/type/text', value: 'Typed' }), 'Typed')
  })

  it('turns CRLF into LF, collapses three or more newlines to two and trims', () => {
    assert.equal(normalizeDescription('  One\r\nTwo\r\n\r\n\r\n\r\nThree\n\n\n\nFour \n'), 'One\nTwo\n\nThree\n\nFour')
  })

  it('treats a blank or missing description as none', () => {
    for (const input of ['', '  \r\n ', { value: ' ' }, {}, null, undefined, 42]) assert.equal(normalizeDescription(input), null, JSON.stringify(input))
  })
})

describe('stripHtml', () => {
  it('keeps paragraphs and line breaks and drops the tags', () => {
    assert.equal(stripHtml('<p>One</p><p>Two &amp; <b>three</b><br>four</p>'), 'One\n\nTwo & three\nfour')
  })

  it('decodes named and numeric entities and keeps an unknown one', () => {
    assert.equal(stripHtml('It&#39;s &quot;fine&quot; &#x2014; &lt;really&gt;&nbsp;&bogus;'), 'It\'s "fine" — <really> &bogus;')
  })

  it('gives null for markup with no text', () => {
    assert.equal(stripHtml('<p> </p>'), null)
    assert.equal(stripHtml(undefined), null)
  })
})

describe('googleThumbnail', () => {
  it('forces https, drops edge=curl, asks for up to 1600 px wide and keeps the rest', () => {
    assert.equal(googleThumbnail({ thumbnail: 'http://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' }), GOOGLE_COVER)
    const sized = new URL(googleThumbnail({ thumbnail: 'https://books.google.com/books/content?id=g1&zoom=1&fife=w200&edge=curl' }))
    assert.deepEqual([...sized.searchParams], [['id', 'g1'], ['zoom', '1'], ['fife', 'w1600']])
  })

  it('refuses a thumbnail from any other host or no thumbnail', () => {
    assert.equal(googleThumbnail({ thumbnail: 'http://books.google.com.evil.example/x.jpg' }), null)
    assert.equal(googleThumbnail({ thumbnail: 'not a url' }), null)
    assert.equal(googleThumbnail({ smallThumbnail: 'http://books.google.com/x' }), null)
    assert.equal(googleThumbnail(undefined), null)
  })
})
