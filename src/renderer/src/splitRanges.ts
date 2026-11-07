export function pagesFromRanges(ranges: string, pageCount: number): number[] {
  if (!ranges.trim() || pageCount < 1) return []

  const selected = new Set<number>()
  for (const rawPart of ranges.split(',')) {
    const part = rawPart.trim()
    if (!part) continue

    if (part.includes('-')) {
      const [rawStart, rawEnd] = part.split('-', 2)
      const start = rawStart.trim() ? Number(rawStart) : 1
      const end = rawEnd.trim() ? Number(rawEnd) : pageCount
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > pageCount || start > end) continue
      for (let page = start; page <= end; page += 1) selected.add(page)
      continue
    }

    const page = Number(part)
    if (Number.isInteger(page) && page >= 1 && page <= pageCount) selected.add(page)
  }

  return [...selected].sort((left, right) => left - right)
}

export function rangesFromPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((left, right) => left - right)
  if (sorted.length === 0) return ''

  const ranges: string[] = []
  let start = sorted[0]
  let end = start

  for (const page of sorted.slice(1)) {
    if (page === end + 1) {
      end = page
      continue
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`)
    start = page
    end = page
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`)
  return ranges.join(', ')
}
