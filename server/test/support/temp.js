/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hemlock-test-'))
