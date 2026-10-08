import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

// TSK-25.5 (EVAL-099's key half): a server-held secp256k1 key per buyer organisation signs the EIP-712
// QualityGrade; the signature recovers to the organisation's address; the key file is 0600 and the key
// never reaches the log.

const lines: string[] = [];
const sink = new Writable({
  write(chunk: Buffer, _enc, cb) {
    lines.push(chunk.toString());
    cb();
  },
});
vi.mock('../log', async (orig) => {
  const real = await orig<typeof import('../log')>();
  return { ...real, log: real.createLogger('trace', sink) };
});

const root = mkdtempSync(join(tmpdir(), 'udgam-org-keys-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
let dataDir = '';
beforeEach(() => {
  lines.length = 0;
  dataDir = join(root, `d${++n}`);
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dataDir);
});

const mod = () => import('./attestor-keys');
const DOMAIN = { chainId: 31337, contract: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const };

describe('buyer-org attestor keys (TSK-25.5)', () => {
  it('creates DATA_DIR/keys/evm/<orgId>.key (0600 in a 0700 directory) and the grade signature recovers to the org address', async () => {
    const { agreementChainId, batchIdHash, orgAddress, orgKeyPath, recoverGradeSigner, signGrade } = await mod();
    const m = { agreementId: agreementChainId('AG-TEST0001'), batchIdHash: batchIdHash('B-TEST0001'), grade: 80 };
    const sig = await signGrade('ORG-BUYER1', m, DOMAIN);
    const path = orgKeyPath('ORG-BUYER1');
    expect(path).toBe(join(dataDir, 'keys', 'evm', 'ORG-BUYER1.key'));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    const address = await orgAddress('ORG-BUYER1');
    expect(privateKeyToAccount(readFileSync(path, 'utf8').trim() as `0x${string}`).address).toBe(address);
    expect(await recoverGradeSigner(m, sig, DOMAIN)).toBe(address);
    // a different grade, batch, agreement or contract recovers to someone else
    expect(await recoverGradeSigner({ ...m, grade: 90 }, sig, DOMAIN)).not.toBe(address);
    expect(await recoverGradeSigner({ ...m, batchIdHash: batchIdHash('B-OTHER') }, sig, DOMAIN)).not.toBe(address);
    expect(await recoverGradeSigner(m, sig, { ...DOMAIN, contract: '0x0000000000000000000000000000000000000001' })).not.toBe(address);
  });

  it('one key per organisation, stable across reloads; a loose file mode is tightened', async () => {
    const a = await (await mod()).orgAddress('ORG-BUYER1');
    const b = await (await mod()).orgAddress('ORG-BUYER2');
    expect(a).not.toBe(b);
    const path = (await mod()).orgKeyPath('ORG-BUYER1');
    chmodSync(path, 0o644);
    vi.resetModules();
    expect(await (await mod()).orgAddress('ORG-BUYER1')).toBe(a);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('tightens a loose keys/evm directory to 0700 on load and says so (final branch review finding 3)', async () => {
    const a = await (await mod()).orgAddress('ORG-BUYER1');
    const path = (await mod()).orgKeyPath('ORG-BUYER1');
    chmodSync(dirname(path), 0o755);
    vi.resetModules();
    lines.length = 0;
    expect(await (await mod()).orgAddress('ORG-BUYER1')).toBe(a);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    expect(lines.join('')).toContain('agreements.org_key_dir_mode_tightened');
  });

  it('generating into an existing loose keys/evm directory leaves it 0700 (final branch review finding 3)', async () => {
    const dir = join(dataDir, 'keys', 'evm');
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    chmodSync(dir, 0o755);
    const { orgAddress, orgKeyPath } = await mod();
    await orgAddress('ORG-BUYER4');
    expect(statSync(orgKeyPath('ORG-BUYER4')).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('never logs the key (redaction): only the address appears', async () => {
    const { orgAddress, orgKeyPath, signGrade, agreementChainId, batchIdHash } = await mod();
    await signGrade('ORG-BUYER3', { agreementId: agreementChainId('AG-1'), batchIdHash: batchIdHash('B-1'), grade: 70 }, DOMAIN);
    const key = readFileSync(orgKeyPath('ORG-BUYER3'), 'utf8').trim();
    const all = lines.join('');
    expect(all).toContain('agreements.org_key_generated');
    expect(all).toContain(await orgAddress('ORG-BUYER3'));
    expect(all).not.toContain(key);
    expect(all).not.toContain(key.slice(2));
  });

  it('refuses an organisation id that is not a safe file name and a grade outside 0–100', async () => {
    const { orgAddress, signGrade, agreementChainId, batchIdHash } = await mod();
    await expect(orgAddress('../etc')).rejects.toThrow(/invalid organisation id/);
    await expect(signGrade('ORG-BUYER1', { agreementId: agreementChainId('AG-1'), batchIdHash: batchIdHash('B-1'), grade: 255 }, DOMAIN)).rejects.toThrow(RangeError);
  });

  it('agreement and batch ids hash to bytes32 with keccak256 of their UTF-8 bytes', async () => {
    const { agreementChainId, batchIdHash } = await mod();
    // keccak256("") is a fixed vector; ids are hashed the same way
    expect(agreementChainId('')).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    expect(batchIdHash('B-TEST0001')).toMatch(/^0x[0-9a-f]{64}$/);
    expect(batchIdHash('B-TEST0001')).not.toBe(agreementChainId('B-TEST0001'.toLowerCase()));
  });
});
