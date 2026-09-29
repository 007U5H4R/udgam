import { describe, expect, it } from 'vitest';
import { plotPathD } from './svg';

// The plot outline for PlotSvg: fitted into the view box with its margin, north up, closed with Z.

describe('plotPathD', () => {
  it('fits a square plot into the view box, centred, north up', () => {
    const d = plotPathD(
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      { width: 100, height: 60, pad: 10 },
    );
    // 40 × 40 square centred in 100 × 60: x 30..70, y 10..50; latitude 0 is the bottom edge.
    expect(d).toBe('M30 50 L70 50 L70 10 L30 10 Z');
  });

  it('draws each part of a MultiPolygon', () => {
    const part = (x: number) => [
      [
        [x, 0],
        [x + 1, 0],
        [x + 1, 1],
        [x, 0],
      ],
    ];
    const d = plotPathD({ type: 'MultiPolygon', coordinates: [part(0), part(2)] });
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('an empty geometry draws nothing', () => {
    expect(plotPathD({ type: 'Polygon', coordinates: [] })).toBe('');
  });
});
