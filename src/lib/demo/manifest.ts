// The staged demo attacks' manifest (technical-plan TSK-20.3, TP27): written by `pnpm seed`
// (scripts/seed/attacks.ts) to DATA_DIR/demo/attacks/manifest.json and read by /admin/demo
// (src/app/(admin)/admin/demo/attacks.ts). One definition for both sides, so they cannot drift.

export const ATTACK_IDS = ['gps-spoof', 'replay', 'yield-inflation', 'plot-laundering'] as const;
export type AttackId = (typeof ATTACK_IDS)[number];
export const isAttackId = (v: unknown): v is AttackId => typeof v === 'string' && (ATTACK_IDS as readonly string[]).includes(v);

/** DATA_DIR/demo/attacks/manifest.json. */
export type AttackManifest = {
  v: 1;
  /** The phone that signed every attack, and its agent's sign-in email (password: seed-credentials.txt). */
  deviceId: string;
  agentEmail: string;
  attacks: {
    id: AttackId;
    title: string;
    story: string;
    plotId: string;
    cherryKg: number;
    /** sha256 of the exact payload string (payload.json): the capture it becomes, once submitted. */
    payloadHash: string;
    photos: string[];
    expected: { verdict: 'Needs Review' | 'Rejected'; check: string; evidence: string };
  }[];
};
