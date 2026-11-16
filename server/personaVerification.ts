import { createHmac, timingSafeEqual } from 'node:crypto';

export const isValidPersonaSignature = (
  signatureHeader: string | undefined,
  rawBody: Buffer,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) => {
  if (!signatureHeader) return false;
  return signatureHeader.split(/\s+/).some((signatureSet) => {
    const fields = new Map(
      signatureSet.split(',').map((field) => {
        const separator = field.indexOf('=');
        return separator === -1
          ? ['', '']
          : [field.slice(0, separator), field.slice(separator + 1)];
      })
    );
    const timestamp = fields.get('t');
    const signature = fields.get('v1');
    if (
      !timestamp ||
      !/^\d+$/.test(timestamp) ||
      !signature ||
      !/^[a-f\d]{64}$/i.test(signature) ||
      Math.abs(nowSeconds - Number(timestamp)) > 5 * 60
    ) {
      return false;
    }

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest();
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
};
