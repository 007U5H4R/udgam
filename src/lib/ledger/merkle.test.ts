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

// The RFC 6962 test vectors of the Certificate Transparency reference implementation
// (certificate-transparency merkle_tree_test.cc, also used by trillian): fixed literals, independent
// of both the code under test and the reference mth() above.
const CT_LEAVES = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'].map((h) => new Uint8Array(Buffer.from(h, 'hex')));
const CT_ROOTS = [
  '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
];
/** [leafIndex (0-based), treeSize, audit path] from the same test file. */
const CT_PATHS: [number, number, string[]][] = [
  [0, 1, []],
  [0, 8, ['96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7', '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e', '6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4']],
  [5, 8, ['bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b', 'ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0', 'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7']],
  [2, 3, ['fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125']],
  [1, 5, ['6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d', '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e', 'bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b']],
];

describe('RFC 6962 / CT reference vectors (TC-061, quality #5)', () => {
  it('gives the published root for every tree of 1..8 leaves', async () => {
    for (let n = 1; n <= 8; n++) expect(hex(await merkleRoot(CT_LEAVES.slice(0, n))), `n=${n}`).toBe(CT_ROOTS[n - 1]);
  });

  it('gives the published audit paths, and each recomputes the published root', async () => {
    for (const [i, n, path] of CT_PATHS) {
      const leaves = CT_LEAVES.slice(0, n);
      expect((await auditPath(leaves, i)).map(hex), `i=${i} n=${n}`).toEqual(path);
      const bytes = path.map((h) => new Uint8Array(Buffer.from(h, 'hex')));
      expect(hex(await rootFromPath(CT_LEAVES[i]!, i, n, bytes)), `i=${i} n=${n}`).toBe(CT_ROOTS[n - 1]);
    }
  });

  it('verifies every leaf of every tree of 1..8 leaves against the published root', async () => {
    for (let n = 1; n <= 8; n++) {
      const tree = await merkleTree(CT_LEAVES.slice(0, n));
      for (let i = 0; i < n; i++) expect(hex(await rootFromPath(CT_LEAVES[i]!, i, n, tree.path(i))), `i=${i} n=${n}`).toBe(CT_ROOTS[n - 1]);
    }
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
