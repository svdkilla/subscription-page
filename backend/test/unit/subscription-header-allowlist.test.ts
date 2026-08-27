import { describe, expect, it } from 'vitest';

import { SUBSCRIPTION_REQUEST_HEADERS_ALLOWLIST } from '@common/constants';

describe('subscription request header allowlist', () => {
    it.each(['x-hwid', 'x-device-os', 'x-ver-os', 'x-device-model'])(
        'forwards HWID device header %s to the panel',
        (header) => {
            expect(SUBSCRIPTION_REQUEST_HEADERS_ALLOWLIST.has(header)).toBe(true);
        },
    );

    it.each(['authorization', 'cookie', 'x-api-key', 'x-forwarded-for'])(
        'keeps sensitive/proxy header %s blocked',
        (header) => {
            expect(SUBSCRIPTION_REQUEST_HEADERS_ALLOWLIST.has(header)).toBe(false);
        },
    );
});
