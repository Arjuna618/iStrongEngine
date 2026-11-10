export function scratchScale(bufSize: number, cap: number, cacheScale: number): number {
    if (bufSize > cap) return cap / bufSize;
    return Math.min(cacheScale, Math.max(1, Math.floor(cap / bufSize)));
}
