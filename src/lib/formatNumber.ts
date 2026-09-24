/**
 * Grouped thousands without Intl: 2100 → "2,100".
 *
 * Hermes ships Intl, but these figures are tabular and have to line up the same way on every
 * device — locale data resolving differently on one Android build would silently change the
 * separator and the column width with it. One function, so Today's ring and the Diary never
 * print the same goal two different ways.
 */
export const formatNumber = (value: number): string =>
  Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
