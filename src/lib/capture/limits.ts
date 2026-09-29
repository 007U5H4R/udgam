// Upload limits at the capture boundary (technical-plan §22 TSK-19.2, §16 "upload abuse", TC-074).
// A camera photo is at most 10 MB; a capture carries 1–3 of them. The body cap leaves 256 KB for the
// payload, the signature and the multipart framing.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 3;
export const MAX_BODY_BYTES = 3 * MAX_PHOTO_BYTES + 256 * 1024;
