import { Ic } from '../field/icons';

// The numeric keypad (Design.md §13 "numeric keypad + lit number"), ported from final/index.html
// s3-kg: 1–9, the decimal point, 0 and Delete, each a 56 px+ target (Design.md §17). It reports keys;
// the record-flow reducer decides what a key does to the number.

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

export function Keypad({
  onKey,
  label,
  decimalLabel,
  deleteLabel,
}: {
  onKey: (k: string) => void;
  label: string;
  decimalLabel: string;
  deleteLabel: string;
}) {
  return (
    <div className="keypad" id="keypad" role="group" aria-label={label}>
      {KEYS.map((k) =>
        k === '⌫' ? (
          <button key={k} className="key del" type="button" data-k="del" onClick={() => onKey(k)}>
            <Ic name="delete" />
            {deleteLabel}
          </button>
        ) : (
          <button key={k} className="key" type="button" data-k={k} aria-label={k === '.' ? decimalLabel : undefined} onClick={() => onKey(k)}>
            {k === '.' ? '·' : k}
          </button>
        ),
      )}
    </div>
  );
}
