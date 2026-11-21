export const SORT_IN_PLACE = { ON: 1 };

export function sortInPlace<T>(a: T[], cmp: (x: T, y: T) => number, maxInPlace = Infinity): void {
  const n = a.length;
  if (SORT_IN_PLACE.ON === 0 || n > maxInPlace) { a.sort(cmp); return; }
  if (n < 2) return;
  let run = 2;
  const desc = cmp(a[1], a[0]) < 0;
  let prev = a[1];
  for (let i = 2; i < n; i++) {
    const cur = a[i];
    const o = cmp(cur, prev);
    if (desc ? !(o < 0) : o < 0) break;
    prev = cur;
    run++;
  }
  if (desc) {
    for (let lo = 0, hi = run - 1; lo < hi; lo++, hi--) { const t = a[lo]; a[lo] = a[hi]; a[hi] = t; }
  }
  for (let start = run; start < n; start++) {
    const pivot = a[start];
    let left = 0, right = start;
    while (left < right) {
      const mid = left + ((right - left) >> 1);
      if (cmp(pivot, a[mid]) < 0) right = mid;
      else left = mid + 1;
    }
    for (let p = start; p > left; p--) a[p] = a[p - 1];
    a[left] = pivot;
  }
}
