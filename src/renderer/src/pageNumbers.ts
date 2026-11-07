export function pageNumberValue(
  page: number,
  pageCount: number,
  options: Record<string, string>
): { text: string; number: number; lastNumber: number } | null {
  const firstPage = Math.max(1, Number(options.page_from || 1))
  const lastPage = Math.min(pageCount, Math.max(firstPage, Number(options.page_to || pageCount)))
  if (page < firstPage || page > lastPage) return null

  const firstNumber = Math.max(1, Number(options.first_number || 1))
  const number = firstNumber + page - firstPage
  const lastNumber = firstNumber + lastPage - firstPage
  const template = options.text_format || '{n} / {p}'
  const text = template.replaceAll('{n}', String(number)).replaceAll('{p}', String(lastNumber))

  return { text, number, lastNumber }
}

export function pageNumberFontFamily(value: string): string {
  if (value === 'times') return 'serif'
  if (value === 'courier') return 'monospace'
  return 'sans-serif'
}

export function pageNumberMargin(value: string): string {
  if (value === 'compact') return '4%'
  if (value === 'spacious') return '10%'
  return '7%'
}
