// Multipart capture body (technical-plan §5.2): `payload` (the JCS string), `signature`, and
// `photo0..photo2` in upload order. Size, type and count limits arrive with TKT-19.

export const MAX_PHOTOS = 3;

export class CaptureFormError extends Error {
  override name = 'CaptureFormError';
}

export type CaptureForm = { payloadString: string; signature: string; files: File[] };

export async function parseCaptureForm(form: FormData): Promise<CaptureForm> {
  const payloadString = form.get('payload');
  const signature = form.get('signature');
  if (typeof payloadString !== 'string' || typeof signature !== 'string') {
    throw new CaptureFormError('payload and signature are required text fields');
  }
  const files: File[] = [];
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const f = form.get(`photo${i}`);
    if (f === null) break;
    if (typeof f === 'string') throw new CaptureFormError(`photo${i} must be a file`);
    files.push(f);
  }
  for (let i = files.length; i < MAX_PHOTOS + 1; i++) {
    if (form.has(`photo${i}`)) throw new CaptureFormError(`photo${i} without photo${files.length}`);
  }
  return { payloadString, signature, files };
}
