const EXPORT_PAGE_SIZE = 500

type Page<T> = {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + EXPORT_PAGE_SIZE - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < EXPORT_PAGE_SIZE) return rows
  }
}
