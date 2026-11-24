/** Minimal, safe Markdown → React (headings, lists, bold/italic, inline code). No raw HTML. */
function inline(text, key) {
  const parts = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) parts.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) parts.push(<code key={`${key}-${i++}`} className="rounded bg-surface-2 px-1 font-mono text-[12.5px]">{t.slice(1, -1)}</code>)
    else parts.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function Markdown({ text }) {
  if (!text) return null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let list = null
  const flush = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul'
      out.push(<Tag key={`l${out.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>{list.items}</Tag>)
      list = null
    }
  }
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)/.exec(line)
    const num = /^\s*\d+[.)]\s+(.*)/.exec(line)
    const heading = /^(#{1,4})\s+(.*)/.exec(line)
    if (bullet || num) {
      const ordered = Boolean(num)
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push(<li key={idx}>{inline((bullet || num)[1], idx)}</li>)
      return
    }
    flush()
    if (heading) out.push(<p key={idx} className="mt-3 font-semibold text-ink first:mt-0">{inline(heading[2], idx)}</p>)
    else if (/^\*\*[^*]+\*\*:?$/.test(line.trim())) out.push(<p key={idx} className="mt-3 font-semibold text-ink first:mt-0">{line.trim().replace(/\*\*/g, '')}</p>)
    else if (line.trim()) out.push(<p key={idx}>{inline(line, idx)}</p>)
  })
  flush()
  return <div className="space-y-2 text-[13.5px] leading-relaxed text-ink-2">{out}</div>
}
