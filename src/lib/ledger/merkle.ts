import { sha256Bytes } from '../crypto';

// Merkle trees exactly as RFC 6962 §2.1 (technical-plan §8.2, TP9). Isomorphic: WebCrypto via
// lib/crypto only, because the certificate page runs this in the browser (TKT-16).
//
//   MTH({})     = SHA-256()
//   leaf hash   = SHA-256(0x00 ‖ d)
//   node hash   = SHA-256(0x01 ‖ left ‖ right), split at the largest power of two < n
//
// Built bottom-up: at each level adjacent nodes are paired and an unpaired last node is carried up
// unchanged. That is the same tree as RFC 6962's recursive split (odd nodes are never duplicated), and
// it has no recursion depth.

const LEAF = 0x00;
const NODE = 0x01;

function concat(prefix: number, ...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(1 + parts.reduce((n, p) => n + p.length, 0));
  out[0] = prefix;
  let o = 1;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function leafHash(leaf: Uint8Array): Promise<Uint8Array> {
  return sha256Bytes(concat(LEAF, leaf));
}

export function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256Bytes(concat(NODE, left, right));
}

/** Every level of the tree, leaf hashes first, the root level (one node) last. */
async function levels(leaves: Uint8Array[]): Promise<Uint8Array[][]> {
  let level = await Promise.all(leaves.map(leafHash));
  const out = [level];
  while (level.length > 1) {
    const next: Promise<Uint8Array>[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? nodeHash(level[i]!, level[i + 1]!) : Promise.resolve(level[i]!));
    }
    level = await Promise.all(next);
    out.push(level);
  }
  return out;
}

function pathFrom(tree: Uint8Array[][], size: number, index: number): Uint8Array[] {
  if (!Number.isInteger(index) || index < 0 || index >= size) throw new RangeError('merkle: leaf index outside the tree');
  const path: Uint8Array[] = [];
  let i = index;
  for (let d = 0; d < tree.length - 1; d++) {
    const level = tree[d]!;
    const sibling = i ^ 1;
    if (sibling < level.length) path.push(level[sibling]!);
    i >>= 1;
  }
  return path;
}

export type MerkleTree = { root: Uint8Array; size: number; path(index: number): Uint8Array[] };

/** Build the tree once and read the root and any leaf's audit path from it. */
export async function merkleTree(leaves: Uint8Array[]): Promise<MerkleTree> {
  if (leaves.length === 0) {
    const root = await sha256Bytes(new Uint8Array(0));
    return { root, size: 0, path: (i) => pathFrom([], 0, i) };
  }
  const tree = await levels(leaves);
  return { root: tree[tree.length - 1]![0]!, size: leaves.length, path: (i) => pathFrom(tree, leaves.length, i) };
}

/** MTH(D[n]) of RFC 6962 §2.1. The empty tree's root is SHA-256 of the empty string. */
export async function merkleRoot(leaves: Uint8Array[]): Promise<Uint8Array> {
  return (await merkleTree(leaves)).root;
}

/** PATH(m, D[n]) of RFC 6962 §2.1.1: sibling hashes from the leaf up to the root. */
export async function auditPath(leaves: Uint8Array[], index: number): Promise<Uint8Array[]> {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new RangeError('merkle: leaf index outside the tree');
  return (await merkleTree(leaves)).path(index);
}

/**
 * The root implied by `leaf` at `index` in a tree of `size` leaves and its audit `path`: the
 * inclusion-verification algorithm of RFC 9162 §2.1.3.2. Throws RangeError when the path cannot
 * belong to such a tree (index ≥ size, a path too long or too short); compare the result with the
 * expected root.
 */
export async function rootFromPath(leaf: Uint8Array, index: number, size: number, path: Uint8Array[]): Promise<Uint8Array> {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) {
    throw new RangeError('merkle: leaf index outside the tree');
  }
  let fn = index;
  let sn = size - 1;
  let r = await leafHash(leaf);
  for (const p of path) {
    if (sn === 0) throw new RangeError('merkle: path longer than the tree');
    if ((fn & 1) === 1 || fn === sn) {
      r = await nodeHash(p, r);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
      }
    } else {
      r = await nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  if (sn !== 0) throw new RangeError('merkle: path shorter than the tree');
  return r;
}
