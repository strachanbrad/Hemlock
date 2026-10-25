/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { payloadBody, request } from './request.js'

export const listBooks = (query, { signal } = {}) => request(`/api/books${query ? `?${query}` : ''}`, { signal })

export const getBook = (id, { signal } = {}) => request(`/api/books/${id}`, { signal })

export const createBook = (payload, cover) => request('/api/books', { method: 'POST', ...payloadBody(payload, cover) })

export const updateBook = (id, payload, cover) => request(`/api/books/${id}`, { method: 'PATCH', ...payloadBody(payload, cover) })

export const deleteBook = (id) => request(`/api/books/${id}`, { method: 'DELETE' })

// One Claude web search; resolves to { replaced, book, source_url, width, height }.
export const findBetterCover = (id) => request(`/api/books/${id}/cover/find`, { method: 'POST' })
