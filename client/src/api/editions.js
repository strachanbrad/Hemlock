/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { payloadBody, request } from './request.js'

export const addEdition = (bookId, payload, cover) => request(`/api/books/${bookId}/editions`, { method: 'POST', ...payloadBody(payload, cover) })

export const updateEdition = (id, payload, cover) => request(`/api/editions/${id}`, { method: 'PATCH', ...payloadBody(payload, cover) })

export const deleteEdition = (id) => request(`/api/editions/${id}`, { method: 'DELETE' })
