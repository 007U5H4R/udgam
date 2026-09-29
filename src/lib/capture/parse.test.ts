import { describe, expect, it } from 'vitest';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { makeDevice, makePayload } from '../../../tests/helpers/verify';
import { jcs, sha256Hex } from '../crypto';
import { MAX_BODY_BYTES, MAX_PHOTO_BYTES } from './limits';
import { checkContentLength, claimedDeviceId, parseCaptureForm } from './parse';

// TSK-19.2 (TC-074): the form checks in order — count → sizes → magic bytes → schema. The route-level
// cases (411/413 before the body is read, anchoring, verify never called) are parse.limits.int.test.ts.

async function validForm(photos = [fakeJpeg('a'), fakeJpeg('b')]) {
  const device = await makeDevice('DV-7K2M9Q4D');
  const payload = await makePayload({ device, mediaHashes: await Promise.all(photos.map((b) => sha256Hex(b))) });
  payload.media = payload.media.map((m, i) => ({ ...m, size: photos[i]!.length }));
  const fd = new FormData();
  fd.set('payload', jcs(payload));
  fd.set('signature', 'sig');
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return { fd, payload };
}

describe('checkContentLength', () => {
  const h = (v?: string) => new Headers(v === undefined ? {} : { 'content-length': v });
  it('411 when missing or not a number, 413 above MAX_BODY_BYTES, else null', () => {
    expect(checkContentLength(h())).toMatchObject({ status: 411, reason: 'length_required' });
    expect(checkContentLength(h('abc'))).toMatchObject({ status: 411 });
    expect(checkContentLength(h('-1'))).toMatchObject({ status: 411 });
    expect(checkContentLength(h(String(MAX_BODY_BYTES + 1)))).toMatchObject({ status: 413, reason: 'body_too_large' });
    expect(checkContentLength(h(String(MAX_BODY_BYTES)))).toBeNull();
    expect(checkContentLength(h('1024'))).toBeNull();
  });
});

describe('parseCaptureForm', () => {
  it('reads payload, signature and photo0..photo2 in order, with the parsed payload', async () => {
    const { fd, payload } = await validForm();
    fd.delete('photo0');
    fd.delete('photo1');
    fd.set('photo1', new File([fakeJpeg('b')], 'b.jpg'));
    fd.set('photo0', new File([fakeJpeg('a')], 'a.jpg'));
    const r = await parseCaptureForm(fd);
    if (!r.ok) throw new Error(r.reason);
    expect(r.form.payloadString).toBe(jcs(payload));
    expect(r.form.signature).toBe('sig');
    expect(r.form.payload).toEqual(payload);
    expect(await Promise.all(r.form.files.map((f) => f.bytes()))).toEqual([fakeJpeg('a'), fakeJpeg('b')]);
  });

  it('a missing payload or signature, an unknown field, a repeated field or a skipped slot → 400 bad_form', async () => {
    const missing = new FormData();
    missing.set('payload', '{}');
    expect(await parseCaptureForm(missing)).toMatchObject({ ok: false, status: 400, reason: 'bad_form' });

    const unknown = (await validForm()).fd;
    unknown.set('note', 'x');
    expect(await parseCaptureForm(unknown)).toMatchObject({ ok: false, status: 400, reason: 'bad_form' });

    const repeated = (await validForm()).fd;
    repeated.append('signature', 'again');
    expect(await parseCaptureForm(repeated)).toMatchObject({ ok: false, status: 400, reason: 'bad_form' });

    const skipped = (await validForm([fakeJpeg('a')])).fd;
    skipped.delete('photo0');
    skipped.set('photo1', new File([fakeJpeg('a')], 'a.jpg'));
    expect(await parseCaptureForm(skipped)).toMatchObject({ ok: false, status: 400, reason: 'bad_form' });

    const textPhoto = (await validForm([fakeJpeg('a')])).fd;
    textPhoto.set('photo0', 'not a file');
    expect(await parseCaptureForm(textPhoto)).toMatchObject({ ok: false, status: 400, reason: 'bad_form' });
  });

  it('0 or 4 photos → 400 media_count, carrying the payload and signature for anchoring', async () => {
    const none = (await validForm()).fd;
    none.delete('photo0');
    none.delete('photo1');
    const r = await parseCaptureForm(none);
    expect(r).toMatchObject({ ok: false, status: 400, reason: 'media_count', signature: 'sig' });
    expect(r.ok ? null : r.payloadString).toBe(none.get('payload'));

    const four = (await validForm([fakeJpeg('a'), fakeJpeg('b'), fakeJpeg('c')])).fd;
    four.set('photo3', new File([fakeJpeg('d')], 'd.jpg'));
    expect(await parseCaptureForm(four)).toMatchObject({ ok: false, status: 400, reason: 'media_count' });
  });

  it('a photo over MAX_PHOTO_BYTES → 413 media_too_large, checked before the magic bytes', async () => {
    const { fd } = await validForm([fakeJpeg('a')]);
    fd.set('photo0', new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' }));
    expect(await parseCaptureForm(fd)).toMatchObject({ ok: false, status: 413, reason: 'media_too_large' });
    fd.set('photo0', new File([new Uint8Array(MAX_PHOTO_BYTES)], 'max.jpg', { type: 'image/jpeg' }));
    expect(await parseCaptureForm(fd)).toMatchObject({ ok: false, status: 415 }); // exactly 10 MB passes the size check
  });

  it('a file that is not JPEG or HEIC, whatever its name and type → 415 media_type', async () => {
    const { fd } = await validForm([fakeJpeg('a'), fakeJpeg('b')]);
    fd.set('photo1', new File([new TextEncoder().encode('hello')], 'b.jpg', { type: 'image/jpeg' }));
    expect(await parseCaptureForm(fd)).toMatchObject({ ok: false, status: 415, reason: 'media_type' });
  });

  it('a payload failing the schema → 400 bad_schema naming the field; checked after the photos', async () => {
    const { fd, payload } = await validForm([fakeJpeg('a')]);
    fd.set('payload', jcs({ ...payload, cherryKg: 501 }));
    expect(await parseCaptureForm(fd)).toEqual(expect.objectContaining({ ok: false, status: 400, reason: 'bad_schema', field: 'cherryKg' }));
    fd.set('payload', jcs({ ...payload, extra: 1 }));
    expect(await parseCaptureForm(fd)).toMatchObject({ reason: 'bad_schema' });
    fd.set('payload', 'not json');
    expect(await parseCaptureForm(fd)).toMatchObject({ reason: 'bad_schema', field: 'payload' });
    fd.set('photo0', new File([new TextEncoder().encode('text')], 'a.jpg'));
    expect(await parseCaptureForm(fd)).toMatchObject({ reason: 'media_type' });
  });
});

describe('claimedDeviceId', () => {
  it('reads a well-formed deviceId from a payload string, or null', () => {
    expect(claimedDeviceId('{"deviceId":"DV-7K2M9Q4D"}')).toBe('DV-7K2M9Q4D');
    expect(claimedDeviceId('{"deviceId":"x".repeat(9)}')).toBeNull();
    expect(claimedDeviceId(`{"deviceId":"${'A'.repeat(500)}"}`)).toBeNull();
    expect(claimedDeviceId('{}')).toBeNull();
    expect(claimedDeviceId('null')).toBeNull();
    expect(claimedDeviceId(null)).toBeNull();
    expect(claimedDeviceId(new File([], 'x'))).toBeNull();
  });
});
