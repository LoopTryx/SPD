export interface HandObservationQuality {
  usable: boolean;
  /** Geometric quality heuristic, never a model probability. */
  score: number;
  reason: 'clear' | 'malformed' | 'clipped' | 'too-small' | 'collapsed';
}

const chains = [[0,1,2,3,4], [5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]];

export function assessHandObservation(points: readonly number[][], width: number, height: number): HandObservationQuality {
  const reject = (reason: HandObservationQuality['reason']): HandObservationQuality => ({ usable: false, score: 0, reason });
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      points.length !== 21 || points.some(p => p?.length < 3 || !p || !p.slice(0,3).every(Number.isFinite)))
    return reject('malformed');
  if (points.some(([x,y]) => x <= 0 || x >= 1 || y <= 0 || y >= 1)) return reject('clipped');
  const pixels = (a: number, b: number) => Math.hypot(
    (points[a][0] - points[b][0]) * width,
    (points[a][1] - points[b][1]) * height,
    (points[a][2] - points[b][2]) * width);
  const palm = pixels(0, 9);
  if (palm < 24) return reject('too-small');
  // Broad bounds reject numerical failures without prescribing one hand shape.
  // A foreshortened joint can still have nonzero depth; use all three axes.
  if (chains.some((chain,index) => {
    const lengths=chain.slice(1).map((end,i)=>pixels(chain[i],end));
    if(lengths.some(length=>length>palm*1.5))return true;
    const curled=index>0 && pixels(chain[3],0)<=pixels(chain[1],0)+palm*.12;
    // Hidden DIP/tip joints can overlap in a fist. Retain a non-degenerate
    // curled chain rather than throwing away the visible palm and thumb.
    return lengths.some(length=>length<.75) && (!curled || lengths.reduce((a,b)=>a+b,0)<palm*.15);
  })) return reject('collapsed');
  const edge = Math.min(...points.flatMap(([x,y]) => [x*width, (1-x)*width, y*height, (1-y)*height]));
  const score = .9 * Math.min(1, palm / 48) * Math.min(1, edge / 12);
  return { usable: score >= .55, score, reason: score >= .55 ? 'clear' : 'clipped' };
}
