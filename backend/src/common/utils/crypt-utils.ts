import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
}

export function encryptUuid(uuid: string, secretKey: string): string {
    const key = deriveKey(secretKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(uuid, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptUuid(data: string, secretKey: string): string | null {
    try {
        if (!/^[A-Za-z0-9_-]+$/u.test(data)) return null;

        const key = deriveKey(secretKey);
        const buf = Buffer.from(data, 'base64url');
        if (buf.length <= 28 || buf.toString('base64url') !== data) return null;

        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const encrypted = buf.subarray(28);

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        const uuid = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        return UUID_PATTERN.test(uuid) ? uuid : null;
    } catch {
        return null;
    }
}
