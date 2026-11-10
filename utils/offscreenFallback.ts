const _g = globalThis as unknown as { OffscreenCanvas?: unknown; document?: Document };
if (typeof _g.OffscreenCanvas === 'undefined' && typeof _g.document !== 'undefined') {
  const OffscreenCanvasFallback = function (this: unknown, width: number, height: number): HTMLCanvasElement {
    const c = (_g.document as Document).createElement('canvas');
    c.width = width; c.height = height;
    return c;
  };
  _g.OffscreenCanvas = OffscreenCanvasFallback;
}

export {};
