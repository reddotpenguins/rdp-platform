// Continue until an empty page: the database may cap responses below our batch size.
export async function loadEnquiryPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  while (true) {
    const result = await fetchPage(rows.length, rows.length + 499);
    if (result.error) return { data: [], error: result.error };
    if (!result.data?.length) return { data: rows, error: null };
    rows.push(...result.data);
  }
}
