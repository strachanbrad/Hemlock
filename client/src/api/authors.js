/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { request } from './request.js'

export const listAuthors = ({ signal } = {}) => request('/api/authors', { signal })

export const renameAuthor = (id, name) => request(`/api/authors/${id}`, { method: 'PATCH', json: { name } })

export const deleteAuthor = (id) => request(`/api/authors/${id}`, { method: 'DELETE' })
