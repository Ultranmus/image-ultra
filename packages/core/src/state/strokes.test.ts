import { describe, expect, it } from 'vitest';
import { simplifyPoints, tracePath, type PathSink } from './strokes';

describe('strokes', () => {
  it('RDP drops points on a straight line and keeps corners', () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplifyPoints(line, 0.5)).toHaveLength(2);
    const corner = [...line, ...Array.from({ length: 20 }, (_, i) => ({ x: 19, y: i + 1 }))];
    expect(simplifyPoints(corner, 0.5)).toHaveLength(3);
  });

  it('traces smooth paths through the end points', () => {
    const calls: string[] = [];
    const sink: PathSink = {
      moveTo: (x, y) => calls.push(`M${x},${y}`),
      lineTo: (x, y) => calls.push(`L${x},${y}`),
      quadraticCurveTo: (_cx, _cy, x, y) => calls.push(`Q${x},${y}`),
      closePath: () => calls.push('Z'),
    };
    tracePath(
      sink,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      true,
      false,
    );
    expect(calls[0]).toBe('M0,0');
    expect(calls.at(-1)).toBe('L10,10');
  });
});
