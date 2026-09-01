// Context Console — host half: tool-result trimmer (official toolResultPruner rules)
// Prunes over-threshold tool results before they hit the session log.
// Fixed-on: enabled by default (no per-view toggle); threshold from plugin config.

export const name = 'context-console'

export const DEFAULT_THRESHOLD = 8192
export const DEFAULT_HEAD = 4096
export const DEFAULT_TAIL = 1024
const MARKER = '\n\n[... tool result middle pruned ...]\n\n'

export function totalText(blocks) {
  if (!Array.isArray(blocks)) return 0
  let n = 0
  const walk = (bs) => {
    for (const b of bs) {
      if (!b || typeof b !== 'object') continue
      if (typeof b.text === 'string') n += b.text.length
      if (Array.isArray(b.content)) walk(b.content)
    }
  }
  walk(blocks)
  return n
}

export function deepPrune(blocks, head = DEFAULT_HEAD, tail = DEFAULT_TAIL) {
  const total = totalText(blocks)
  if (total <= DEFAULT_THRESHOLD) return null
  let headLeft = head
  let tailLeft = tail
  let midDone = false

  const out = []
  const appendText = (t) => {
    if (midDone) return
    if (headLeft > 0) {
      const take = Math.min(t.length, headLeft)
      if (take > 0) out.push({ type: 'text', text: t.slice(0, take) })
      headLeft -= take
      if (take < t.length) {
        out.push({ type: 'text', text: MARKER })
        midDone = true
        tailLeft = tail
      }
    } else {
      out.push({ type: 'text', text: MARKER })
      midDone = true
      tailLeft = tail
    }
  }

  const walk = (bs) => {
    for (const b of bs) {
      if (midDone) return
      if (!b || typeof b !== 'object') continue
      if (typeof b.text === 'string') {
        appendText(b.text)
      } else if (Array.isArray(b.content)) {
        walk(b.content)
      }
    }
  }
  walk(blocks)

  if (tailLeft > 0) {
    const tail = []
    const walkTail = (bs) => {
      for (let i = bs.length - 1; i >= 0; i--) {
        if (tailLeft <= 0) return
        const b = bs[i]
        if (!b || typeof b !== 'object') continue
        if (typeof b.text === 'string') {
          const take = Math.min(b.text.length, tailLeft)
          if (take > 0) {
            tail.unshift({ type: 'text', text: b.text.slice(b.text.length - take) })
            tailLeft -= take
          }
        } else if (Array.isArray(b.content)) {
          walkTail(b.content)
        }
      }
    }
    walkTail(blocks)
    for (const tb of tail) out.push(tb)
  }

  return out
}

export function apply(ctx, config = {}) {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD
  const head = config.head ?? DEFAULT_HEAD
  const tail = config.tail ?? DEFAULT_TAIL
  const enabled = config.enabled ?? true

  const off = ctx.on('tools/post-execute', async (exec, result, next) => {
    try {
      if (enabled && result && typeof result === 'object' && Array.isArray(result.content)) {
        const before = totalText(result.content)
        if (before > threshold) {
          const pruned = deepPrune(result.content, head, tail)
          if (pruned && Array.isArray(pruned) && pruned.length > 0) {
            const after = totalText(pruned)
            if (after < before) {
              return { kind: 'accept', content: pruned }
            }
          }
        }
      }
    } catch (e) {
      // never break the tool pipeline on our own error
    }
    return next()
  })

  ctx.effect(() => () => {
    off()
  })
}