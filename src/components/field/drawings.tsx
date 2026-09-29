// The three photo-slot example drawings (final/index.html symbols `ex-branch`, `ex-basket`, `ex-pile`),
// in the icon set's line style. Decorative: the slot's name is always written beside them.

const PILE: [number, number][] = [
  [20, 74], [30, 74], [40, 74], [50, 74], [60, 74], [70, 74], [76, 74],
  [26, 65], [36, 64], [46, 63], [56, 64], [66, 65],
  [34, 55], [44, 53], [54, 54], [62, 57], [42, 46], [50, 46],
];

function Branch() {
  return (
    <>
      <path className="ex-line" d="M6 74C28 64 54 50 90 22" />
      <path className="ex-soft" d="M30 63c-6-10-4-20 4-26 4 9 3 18-4 26zM30 63c10-4 20-2 25 6-10 3-18 1-25-6zM58 45c-3-11 1-20 10-24 2 10-1 18-10 24zM58 45c10 0 18 5 20 14-10 0-17-4-20-14z" />
      <g>
        <circle className="ex-berry" cx="22" cy="72" r="5" />
        <circle className="ex-berry-2" cx="29" cy="75" r="4.6" />
        <circle className="ex-berry" cx="25" cy="80" r="4.4" />
        <circle className="ex-berry" cx="46" cy="58" r="5" />
        <circle className="ex-berry-2" cx="53" cy="60" r="4.6" />
        <circle className="ex-berry" cx="49" cy="66" r="4.4" />
        <circle className="ex-berry" cx="72" cy="37" r="4.6" />
        <circle className="ex-berry-2" cx="78" cy="40" r="4.2" />
        <circle className="ex-shine" cx="20.5" cy="70.5" r="1.4" />
        <circle className="ex-shine" cx="44.5" cy="56.5" r="1.4" />
        <circle className="ex-shine" cx="70.6" cy="35.6" r="1.3" />
      </g>
    </>
  );
}

function Basket() {
  return (
    <>
      <path className="ex-line" d="M18 72h60M24 72v10a3 3 0 0 0 3 3h42a3 3 0 0 0 3-3V72" />
      <rect x="38" y="76" width="20" height="6" rx="1.5" fill="rgba(185,245,210,.35)" />
      <path className="ex-line" d="M22 38h52l-7 32H29z" />
      <path className="ex-soft" d="M24.5 49h47M27 60h42" />
      <g>
        <circle className="ex-berry" cx="30" cy="35" r="4.6" />
        <circle className="ex-berry-2" cx="39" cy="33" r="4.8" />
        <circle className="ex-berry" cx="48" cy="34" r="4.8" />
        <circle className="ex-berry-2" cx="57" cy="33" r="4.6" />
        <circle className="ex-berry" cx="66" cy="35" r="4.4" />
        <circle className="ex-berry" cx="44" cy="27" r="4.2" />
        <circle className="ex-berry-2" cx="53" cy="27" r="4.2" />
        <circle className="ex-shine" cx="38" cy="31.5" r="1.3" />
        <circle className="ex-shine" cx="47" cy="32.5" r="1.3" />
        <circle className="ex-shine" cx="43" cy="25.6" r="1.2" />
      </g>
    </>
  );
}

function Pile() {
  return (
    <>
      <path className="ex-line" d="M6 82h84" />
      <path className="ex-soft" d="M12 86h72" />
      <g>
        {PILE.map(([x, y], i) => (
          <circle key={`${x}-${y}`} className={i % 3 ? 'ex-berry' : 'ex-berry-2'} cx={x} cy={y} r={i < 7 ? 5 : i < 12 ? 4.8 : 4.5} />
        ))}
        <circle className="ex-shine" cx="28.5" cy="72.5" r="1.3" />
        <circle className="ex-shine" cx="44.5" cy="61.5" r="1.3" />
        <circle className="ex-shine" cx="48.6" cy="44.6" r="1.1" />
      </g>
    </>
  );
}

export type SlotKind = 'branch' | 'scale' | 'pile';

export function SlotDrawing({ kind }: { kind: SlotKind }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false" style={{ width: '86%', height: '86%' }}>
      {kind === 'branch' ? <Branch /> : kind === 'scale' ? <Basket /> : <Pile />}
    </svg>
  );
}
