/**
 * Free-text matcher for the task lists (table, kanban, My Day agenda).
 *
 * WHY THIS IS NOT A PLAIN `includes`: it used to be, and a phrase typed from
 * memory found nothing. `matchesSearch` tests the WHOLE query against each
 * field on its own, so "screenshot sent on wms group" only ever matched a
 * title containing exactly that run of characters — one extra word, one
 * doubled space, one transposed pair and the list went empty while the
 * summary pills above it still counted the rows, which reads as a broken box
 * rather than a query that missed.
 *
 * So: split the query on whitespace and require EVERY token to hit SOME
 * field. Word order and spacing stop mattering, and a query can straddle two
 * fields — "acme invoice" finds the task whose client is Acme and whose title
 * mentions the invoice, which no per-field phrase match can do.
 *
 * Tokens are AND-ed, not OR-ed, on purpose: typing more words must narrow the
 * list, never widen it.
 */
export function taskMatchesQuery(
  q: string,
  taskNo: number | null | undefined,
  ...text: (string | null | undefined)[]
): boolean {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true; // empty query matches everything

  const no = taskNo != null ? String(taskNo) : null;
  const haystack = text.filter((v): v is string => !!v).map((v) => v.toLowerCase());

  return tokens.every((token) => {
    // "#1042" and "1042" both hit the friendly number, as they always have.
    const num = token.replace(/^#/, "");
    if (no && num && no.includes(num)) return true;
    return haystack.some((field) => field.includes(token));
  });
}
