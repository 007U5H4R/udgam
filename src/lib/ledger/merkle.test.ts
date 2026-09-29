import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { auditPath, merkleRoot, merkleTree, rootFromPath } from './merkle';

// TC-061: RFC 6962 §2.1 roots and RFC 9162 §2.1.3.2 inclusion proofs.

const sha = (...parts: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
};
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const leafData = (i: number) => sha(new TextEncoder().encode(`leaf-${i}`));
const leavesOf = (n: number) => Array.from({ length: n }, (_, i) => leafData(i));

/** Reference MTH, written straight from RFC 6962 §2.1 (recursive; node:crypto, not the code under test). */
function mth(d: Uint8Array[]): Uint8Array {
  const n = d.length;
  if (n === 0) return sha();
  if (n === 1) return sha(Uint8Array.of(0x00), d[0]!);
  let k = 1;
  while (k * 2 < n) k *= 2; // largest power of two smaller than n
  return sha(Uint8Array.of(0x01), mth(d.slice(0, k)), mth(d.slice(k)));
}

/** Throwing or returning a different root both count as "does not verify". */
async function rootOrNull(leaf: Uint8Array, i: number, n: number, path: Uint8Array[]): Promise<string | null> {
  try {
    return hex(await rootFromPath(leaf, i, n, path));
  } catch {
    return null;
  }
}

describe('merkleRoot (TC-061)', () => {
  it('matches the RFC 6962 reference on 5 fixed vectors (n = 1, 2, 3, 7, 8)', async () => {
    for (const n of [1, 2, 3, 7, 8]) {
      const leaves = leavesOf(n);
      expect(hex(await merkleRoot(leaves)), `n=${n}`).toBe(hex(mth(leaves)));
    }
  });

  it('pins the n = 1 and n = 2 roots to hand-written formulas', async () => {
    const [a, b] = leavesOf(2) as [Uint8Array, Uint8Array];
    expect(hex(await merkleRoot([a]))).toBe(hex(sha(Uint8Array.of(0), a)));
    expect(hex(await merkleRoot([a, b]))).toBe(hex(sha(Uint8Array.of(1), sha(Uint8Array.of(0), a), sha(Uint8Array.of(0), b))));
  });

  it('gives SHA-256 of the empty string for an empty tree', async () => {
    expect(hex(await merkleRoot([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('inclusion proofs (TC-061)', () => {
  it('matches the reference root and recomputes it from every leaf of every tree of 1..300 leaves', async () => {
    for (let n = 1; n <= 300; n++) {
      const leaves = leavesOf(n);
      const tree = await merkleTree(leaves);
      const root = hex(mth(leaves));
      expect(hex(tree.root)).toBe(root);
      const roots = await Promise.all(leaves.map(async (leaf, i) => hex(await rootFromPath(leaf, i, n, tree.path(i)))));
      roots.forEach((r, i) => expect(r, `n=${n} i=${i}`).toBe(root));
    }
  }, 120_000);

  it('auditPath(leaves, i) equals the tree path for every index of selected sizes', async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 31, 64, 100]) {
      const leaves = leavesOf(n);
      const tree = await merkleTree(leaves);
      const paths = await Promise.all(leaves.map((_, i) => auditPath(leaves, i)));
      paths.forEach((p, i) => expect(p.map(hex), `n=${n} i=${i}`).toEqual(tree.path(i).map(hex)));
    }
  }, 60_000);

  it('returns an empty path for a one-leaf tree and refuses an index outside the tree', async () => {
    expect(await auditPath(leavesOf(1), 0)).toEqual([]);
    await expect(auditPath(leavesOf(3), 3)).rejects.toThrow(RangeError);
    await expect(auditPath(leavesOf(3), -1)).rejects.toThrow(RangeError);
    await expect(rootFromPath(leafData(0), 3, 3, [])).rejects.toThrow(RangeError);
  });

  it('fails when one bit of any path element flips, or the index is off by one', async () => {
    for (const n of [2, 3, 7, 8, 13, 100]) {
      const leaves = leavesOf(n);
      const tree = await merkleTree(leaves);
      const root = hex(tree.root);
      for (let i = 0; i < n; i++) {
        const path = tree.path(i);
        for (let j = 0; j < path.length; j++) {
          const bad = path.map((p) => p.slice());
          const el = bad[j]!;
          el[j % 32] = el[j % 32]! ^ 0x01;
          expect(await rootOrNull(leaves[i]!, i, n, bad), `n=${n} i=${i} j=${j}`).not.toBe(root);
        }
        for (const other of [i - 1, i + 1]) {
          if (other < 0) continue;
          expect(await rootOrNull(leaves[i]!, other, n, path), `n=${n} i=${i} as ${other}`).not.toBe(root);
        }
      }
    }
  }, 60_000);

  it('fails with a truncated or extended path, or a wrong tree size', async () => {
    const leaves = leavesOf(7);
    const tree = await merkleTree(leaves);
    const root = hex(tree.root);
    const path = tree.path(2);
    expect(await rootOrNull(leaves[2]!, 2, 7, path.slice(1))).not.toBe(root);
    expect(await rootOrNull(leaves[2]!, 2, 7, [...path, path[0]!])).not.toBe(root);
    expect(await rootOrNull(leaves[2]!, 2, 4, path)).not.toBe(root);
    expect(await rootOrNull(leaves[2]!, 2, 3, path)).not.toBe(root);
  });
});
