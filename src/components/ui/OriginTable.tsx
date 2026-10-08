import s from './OriginTable.module.css';

// The certificate's origin table (verify.html "5 · origin table"): one row per origin — region, variety,
// farms, harvest window, quantity. On phones each cell stacks as "label · value". The caller passes the
// words (from the feed, TP16).

export type OriginColumn = { key: string; label: string; numeric?: boolean };

export function OriginTable({ columns, rows, className }: { columns: OriginColumn[]; rows: Record<string, string>[]; className?: string }) {
  return (
    <div className={[s.card, className].filter(Boolean).join(' ')}>
      <table className={`${s.table} origin-table`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? s.num : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={c.numeric ? s.num : undefined}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
