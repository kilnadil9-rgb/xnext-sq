/**
 * RC5 test harness helper: tsc emits ESM with extensionless relative import
 * specifiers; Node's ESM loader requires explicit `.js`. This rewrites the
 * emitted files in `.test-dist/` — build tooling only, never ships.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const ROOT = resolve('.test-dist')

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.js')) fix(p)
  }
}

function fix(file) {
  const src = readFileSync(file, 'utf8')
  const out = src.replace(
    /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (m, pre, spec, post) => {
      if (spec.endsWith('.js') || spec.endsWith('.json')) return m
      // Directory import → /index.js, else append .js
      const abs = resolve(dirname(file), spec)
      let target = `${spec}.js`
      try {
        if (statSync(abs).isDirectory()) target = `${spec}/index.js`
      } catch {
        /* not a directory — plain file */
      }
      return `${pre}${target}${post}`
    },
  )
  if (out !== src) writeFileSync(file, out)
}

walk(ROOT)
console.log('[fix-test-imports] specifiers normalized')
