// The Sentinel Hub evalscript for NDVI with cloud masking (technical-plan §7, research Q4, TSK-07.5).
// Sentinel-2 L2A bands B04 (red) and B08 (near infrared) give NDVI; the scene classification layer
// (SCL) masks cloud shadow (3), cloud medium/high probability (8, 9), thin cirrus (10) and snow (11).
// `dataMask` is 0 for masked or no-data pixels, so the Statistical API counts them in `noDataCount`
// and leaves them out of the mean. An interval whose every pixel is masked has mean NaN.

export const MASKED_SCL_CLASSES = [3, 8, 9, 10, 11] as const;

export const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(s) {
  var masked = [${MASKED_SCL_CLASSES.join(', ')}].indexOf(s.SCL) !== -1;
  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  var valid = s.dataMask === 1 && !masked && isFinite(ndvi);
  return { ndvi: [valid ? ndvi : NaN], dataMask: [valid ? 1 : 0] };
}
`;
