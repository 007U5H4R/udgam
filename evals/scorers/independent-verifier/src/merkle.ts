// RFC 6962 §2.1 Merkle tree hash and the RFC 9162 §2.1.3.2 inclusion check, from docs/proof-feed.md §6.
import { concat, sha256 } from './hash';

const LEAF = new Uint8Array([0x00]);
const NODE = new Uint8Array([0x01]);

/** SHA-256(0x00 ‖ d): the hash of one leaf's data (an entry's 32 raw entryHash bytes). */
export function leafHash(data: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(LEAF, data));
}

/** SHA-256(0x01 ‖ left ‖ right). */
export function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(NODE, left, right));
}

/** MTH(D[0:n]) over leaf data; k is the largest power of two strictly less than n. */
export async function treeHash(leaves: Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 0) return sha256(new Uint8Array(0));
  if (leaves.length === 1) return leafHash(leaves[0]!);
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  return nodeHash(await treeHash(leaves.slice(0, k)), await treeHash(leaves.slice(k)));
}

/**
 * The root recomputed from an entry's leaf data, its leafIndex, the tree size n and its audit path
 * (leaf end first), or null when the index or the path length cannot fit a tree of n leaves.
 */
export async function rootFromPath(
  data: Uint8Array,
  leafIndex: number,
  n: number,
  path: Uint8Array[],
): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(leafIndex) || !Number.isSafeInteger(n) || leafIndex < 0 || n < 1 || leafIndex >= n) {
    return null;
  }
  let fn = leafIndex;
  let sn = n - 1;
  let r = await leafHash(data);
  for (const p of path) {
    if (p.length !== 32) return null;
    if (sn === 0) return null;
    if (fn % 2 === 1 || fn === sn) {
      r = await nodeHash(p, r);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = await nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  if (sn !== 0) return null;
  return r;
}
