window.__ModuleLoader__.load({
	id: "@local/context-console",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

// Context Console — client half: session context composition view tab.
// Peer of Chat/Trajectory in the conversation view ring; renders composition
// analysis from the live ConversationSnapshot (no host communication needed).

const inject = ['slots']

function collectText(blocks, acc) {
  if (!Array.isArray(blocks)) return
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue
    if (typeof b.text === 'string') acc.push(b.text)
    if (Array.isArray(b.content)) collectText(b.content, acc)
  }
}
function countTextChars(blocks) {
  const acc = []
  collectText(blocks, acc)
  return acc.join('').length
}
function countBlockChars(blocks) {
  if (!Array.isArray(blocks)) return 0
  let n = 0
  for (const b of blocks) {
    if (b && typeof b === 'object' && typeof b.text === 'string') n += b.text.length
  }
  return n
}
function fmt(chars) {
  if (chars >= 1000000) return (chars / 1000000).toFixed(1) + 'M'
  if (chars >= 10000) return (chars / 1000).toFixed(1) + 'K'
  if (chars >= 1000) return (chars / 1000).toFixed(2) + 'K'
  return String(chars)
}

function computeStats(session) {
  let systemChars = 0
  let toolsChars = 0
  let injectedToolCount = -1
  let requestCount = 0
  let toolList = []
  const traj = session && session.views && session.views.trajectory
  const requests = traj && traj.requests
  if (Array.isArray(requests) && requests.length > 0) {
    requestCount = requests.length
    for (let i = requests.length - 1; i >= 0; i--) {
      const r = requests[i]
      if (!r || r.purpose !== 'assistant') continue
      const p = r.prompt
      if (p && (typeof p.system === 'string' || p.tools !== undefined)) {
        if (typeof p.system === 'string') systemChars = p.system.length
        if (Array.isArray(p.tools)) {
          injectedToolCount = p.tools.length
          toolList = p.tools.map((t) => {
            if (!t) return null
            const name = typeof t.name === 'string' ? t.name : '?'
            const desc = typeof t.description === 'string' ? t.description : ''
            const args = t.parameters && typeof t.parameters === 'object'
              ? (typeof t.parameters.raw === 'string' ? t.parameters.raw.length : 0)
              : 0
            const size = name.length + 2 + desc.length + args
            toolsChars += size
            return { name, size }
          }).filter(Boolean)
        }
        break
      }
    }
  }

  const nodes = (session && Array.isArray(session.nodes))
    ? session.nodes
    : ((traj && Array.isArray(traj.eventNodes)) ? traj.eventNodes : [])
  let userChars = 0
  let toolChars = 0
  let assistantChars = 0
  let errorCount = 0
  const sources = Object.create(null)
  const usedTools = new Set()
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue
    if (n.kind === 'user') {
      const sk = (n.source && typeof n.source === 'object' && typeof n.source.kind === 'string')
        ? n.source.kind
        : 'unknown'
      const c = countTextChars(n.content)
      sources[sk] = sources[sk] || { count: 0, chars: 0 }
      sources[sk].count += 1
      sources[sk].chars += c
      userChars += c
    } else if (n.kind === 'assistant') {
      assistantChars += countBlockChars(n.blocks)
    } else if (n.kind === 'tool-result') {
      toolChars += countTextChars(n.content)
      if (n.call && typeof n.call === 'object' && typeof n.call.name === 'string') {
        usedTools.add(n.call.name)
      }
      if (n.isError) errorCount += 1
    }
  }
  const running = (session && Array.isArray(session.runningCalls)) ? session.runningCalls : []
  for (const r of running) {
    if (r && typeof r.name === 'string') usedTools.add(r.name)
  }

  const dynChars = userChars + toolChars + assistantChars
  const staticChars = systemChars + toolsChars
  const total = staticChars + dynChars
  const staticPct = total > 0 ? Math.round((staticChars / total) * 100) : 0
  return {
    staticChars, dynChars, userChars, toolChars, assistantChars,
    total, staticPct, requestCount, injectedToolCount,
    sources, usedTools: Array.from(usedTools), errorCount,
    toolList: toolList.sort((a, b) => b.size - a.size),
    windowTruncated: requestCount > 0 && injectedToolCount < 0,
  }
}

const LEGEND = [
  { key: 'systemChars', label: 'system prompt', color: '#d0a24a' },
  { key: 'toolsChars', label: '工具目录', color: '#c77d3a' },
  { key: 'userChars', label: '用户输入', color: '#7ab648' },
  { key: 'toolChars', label: '工具结果', color: '#3fa06a' },
  { key: 'assistantChars', label: '助手输出', color: '#4a9ad0' },
]
const SOURCE_LABELS = {
  user: '用户输入',
  plugin: '插件快照',
  'skill-catalog': '技能目录',
  context: '上下文注入',
}

const CSS = `
  .cctx-wrap { padding: 12px 16px; font-size: 12px; color: var(--dsw-alias-label-secondary);
    font-variant-numeric: tabular-nums; max-width: 1100px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .cctx-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
  .cctx-title { font-size: 15px; font-weight: 700; color: var(--dsw-alias-label-primary); }
  .cctx-sub { font-size: 11px; opacity: 0.75; }
  .cctx-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
  .cctx-card-title { font-weight: 700; color: var(--dsw-alias-label-primary); font-size: 12px; margin-bottom: 8px; }
  .cctx-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden;
    background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); margin: 6px 0; }
  .cctx-seg { height: 100%; }
  .cctx-kv { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 6px; }
  .cctx-kv b { color: var(--dsw-alias-label-primary); font-weight: 600; }
  .cctx-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 11px; }
  .cctx-swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .cctx-tools { margin-top: 6px; max-height: 220px; overflow-y: auto; }
  .cctx-toolrow { display: flex; justify-content: space-between; gap: 8px; padding: 2px 6px; border-radius: 4px; font-size: 11.5px; }
  .cctx-toolrow.cctx-used { color: var(--dsw-alias-label-primary); }
  .cctx-toolname { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cctx-hint { font-size: 10.5px; opacity: 0.75; margin-top: 6px; }
  .cctx-err { color: var(--dsw-alias-state-error-primary); font-weight: 600; }
  .cctx-ok { color: var(--dsw-alias-state-success-primary); font-weight: 600; }
`

function ContextConsole(props) {
  const session = (typeof props.useSession === 'function')
    ? props.useSession((snapshot) => snapshot)
    : props.session
  const s = session ? computeStats(session) : null
  if (!s) {
    return React.createElement('div', { className: 'cctx-wrap' }, '等待会话数据…')
  }

  const staticW = s.total > 0 ? Math.max(2, Math.round((s.staticChars / s.total) * 100)) : 50
  const dynW = s.total > 0 ? Math.max(2, 100 - staticW) : 50
  const estTokens = Math.round(Math.max(s.total, 1) / 3)

  const segs = LEGEND.map((lg) => {
    const v = s[lg.key]
    const pct = s.total > 0 ? Math.round((v / s.total) * 100) : 0
    return React.createElement('div', {
      key: lg.key,
      className: 'cctx-seg',
      style: { width: Math.max(s.total > 0 && v > 0 ? 1 : 0, pct) + '%', background: lg.color },
      title: lg.label + ': ' + fmt(v),
    })
  })
  const legendRow = LEGEND.map((lg) => React.createElement('span', { key: lg.key },
    React.createElement('span', { className: 'cctx-swatch', style: { background: lg.color } }),
    lg.label + ' ' + fmt(s[lg.key]),
  ))

  const injectedLabel = s.injectedToolCount >= 0 ? String(s.injectedToolCount) : '?'
  const toolRows = s.toolList.map((t) => React.createElement('div', {
      key: t.name,
      className: 'cctx-toolrow' + (s.usedTools.indexOf(t.name) >= 0 ? ' cctx-used' : ''),
    },
    React.createElement('span', { className: 'cctx-toolname' }, t.name),
    React.createElement('span', null,
      fmt(t.size),
      s.usedTools.indexOf(t.name) >= 0 ? React.createElement('span', { className: 'cctx-ok' }, ' ✓') : null,
    ),
  ))

  const sourceRows = Object.keys(s.sources).map((k) => {
    const it = s.sources[k]
    return React.createElement('div', { key: k, className: 'cctx-toolrow' },
      React.createElement('span', null, SOURCE_LABELS[k] || k),
      React.createElement('span', null, it.count + ' 条 · ' + fmt(it.chars)),
    )
  })

  return React.createElement('div', { className: 'cctx-wrap' },
    React.createElement('div', { className: 'cctx-head' },
      React.createElement('span', { className: 'cctx-title' }, '📊 上下文运维'),
      React.createElement('span', { className: 'cctx-sub' },
        '会话 ' + s.requestCount + ' 次请求 · 窗口内 ' + s.usedTools.length + ' 个工具已调用' +
        (s.windowTruncated ? ' · (长会话窗口，注入数显示 ?)' : ''),
      ),
    ),

    React.createElement('div', { className: 'cctx-card' },
      React.createElement('div', { className: 'cctx-card-title' }, '上下文构成'),
      React.createElement('div', { className: 'cctx-bar' },
        React.createElement('div', { className: 'cctx-seg', style: { width: staticW + '%', background: '#d0a24a' } }),
        React.createElement('div', { className: 'cctx-seg', style: { width: dynW + '%', background: '#3fa06a' } }),
      ),
      React.createElement('div', { className: 'cctx-kv' },
        React.createElement('span', null, '静态 ', React.createElement('b', null, fmt(s.staticChars)), ' (', s.staticPct, '%)'),
        React.createElement('span', null, '动态 ', React.createElement('b', null, fmt(s.dynChars))),
        React.createElement('span', null, '≈', React.createElement('b', null, estTokens), ' tokens'),
        React.createElement('span', null, '错误 ×', React.createElement('b', null, s.errorCount)),
      ),
      React.createElement('div', { className: 'cctx-legend' }, legendRow),
      React.createElement('div', { className: 'cctx-bar' }, segs),
    ),

    React.createElement('div', { className: 'cctx-card' },
      React.createElement('div', { className: 'cctx-card-title' },
        '工具目录（已调用 ', React.createElement('b', null, s.usedTools.length), '/', injectedLabel, '）',
      ),
      toolRows.length > 0
        ? React.createElement('div', { className: 'cctx-tools' }, toolRows)
        : React.createElement('div', null, '暂无工具目录数据（窗口未含请求头）'),
    ),

    React.createElement('div', { className: 'cctx-card' },
      React.createElement('div', { className: 'cctx-card-title' }, '注入来源构成'),
      sourceRows.length > 0 ? sourceRows : React.createElement('div', null, '暂无注入数据'),
      React.createElement('div', { className: 'cctx-hint' },
        '提示：大工具结果（>8192 字符）由 host 端自动修剪为 head 4096 + tail 1024（写入日志前生效）。',
      ),
    ),
  )
}

function apply(ctx) {
  // inject styles (same pattern as official client plugins)
  if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="@local/context-console"]') === null) {
    const tag = document.createElement('style')
    tag.setAttribute('data-plugin-css', '@local/context-console')
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register(
    { name: 'conversation.view', id: 'context-console', order: 30, label: () => '上下文' },
    (props) => React.createElement(ContextConsole, props),
  )))
}

	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
	}
});
