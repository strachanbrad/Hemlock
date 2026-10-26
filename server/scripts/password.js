/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

function hiddenPrompt(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process
    let input = ''
    const finish = (err) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stderr.write('\n')
      if (err) reject(err)
      else resolve(input)
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish()
        if (char === '\u0003') return finish(new Error('Cancelled'))
        if (char === '\u007f' || char === '\b') input = [...input].slice(0, -1).join('')
        else input += char
      }
    }
    stderr.write(question)
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.on('data', onData)
    stdin.resume()
  })
}

async function firstLine() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0]
}

// A hidden prompt, asked twice, on a terminal; the first line of standard input otherwise.
export async function readPassword(question) {
  if (!process.stdin.isTTY) return firstLine()
  const password = await hiddenPrompt(question)
  if ((await hiddenPrompt('Again: ')) !== password) throw new Error('The two passwords differ; nothing changed')
  return password
}
