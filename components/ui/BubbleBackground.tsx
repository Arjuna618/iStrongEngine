import React from 'react';

const BUBBLES: ReadonlyArray<{
  s: number; l: number; d: number; dl: number; w: number; o: number; a: 1 | 2 | 3 | 4 | 5;
}> = [
  { s: 6,  l: 5,  d: 14, dl: 0,  w: 18, o: 0.17, a: 1 },
  { s: 10, l: 15, d: 18, dl: 2,  w: 28, o: 0.13, a: 4 },
  { s: 4,  l: 28, d: 22, dl: 5,  w: 14, o: 0.19, a: 2 },
  { s: 16, l: 40, d: 16, dl: 1,  w: 35, o: 0.09, a: 5 },
  { s: 8,  l: 55, d: 20, dl: 7,  w: 22, o: 0.15, a: 3 },
  { s: 12, l: 68, d: 15, dl: 3,  w: 26, o: 0.11, a: 1 },
  { s: 5,  l: 82, d: 24, dl: 10, w: 16, o: 0.19, a: 4 },
  { s: 20, l: 92, d: 13, dl: 0,  w: 38, o: 0.07, a: 5 },
  { s: 7,  l: 35, d: 19, dl: 8,  w: 20, o: 0.17, a: 2 },
  { s: 14, l: 48, d: 17, dl: 4,  w: 32, o: 0.09, a: 3 },
  { s: 9,  l: 72, d: 21, dl: 6,  w: 24, o: 0.15, a: 5 },
  { s: 6,  l: 10, d: 25, dl: 12, w: 17, o: 0.17, a: 4 },
  { s: 18, l: 60, d: 14, dl: 2,  w: 36, o: 0.07, a: 1 },
  { s: 5,  l: 22, d: 23, dl: 15, w: 15, o: 0.19, a: 3 },
  { s: 11, l: 85, d: 16, dl: 1,  w: 27, o: 0.11, a: 2 },
  { s: 8,  l: 45, d: 20, dl: 9,  w: 20, o: 0.15, a: 5 },
  { s: 22, l: 30, d: 12, dl: 0,  w: 40, o: 0.07, a: 4 },
  { s: 4,  l: 75, d: 26, dl: 14, w: 12, o: 0.19, a: 1 },
  { s: 13, l: 50, d: 18, dl: 5,  w: 30, o: 0.09, a: 2 },
  { s: 7,  l: 88, d: 22, dl: 11, w: 19, o: 0.15, a: 3 },
];

export const BubbleBackground: React.FC = React.memo(() => (
  <div className="bubble-bg">
    {BUBBLES.map((b, i) => (
      <div
        key={i}
        className="bubble"
        style={{
          width: b.s,
          height: b.s,
          left: `${b.l}%`,
          opacity: b.o,
          animationName: `bubble-rise-${b.a}`,
          animationDuration: `${b.d}s`,
          animationDelay: `${b.dl}s`,
          '--b-w': `${b.w}px`,
        } as React.CSSProperties}
      />
    ))}
  </div>
));
