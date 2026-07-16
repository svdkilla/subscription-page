import { describe, expect, it } from 'vitest';

import { getCustomLinkUriError, SubscriptionPageConfigSchema } from '@common/subpage-config';

import { createSubpageConfigFixture } from '../fixtures/subpage-config.fixture';

describe('subscription-page custom link security', () => {
    it.each([
        'vless://id@example.com:443?security=tls',
        'hysteria2://secret@example.com:443',
        'hy2://secret@example.com:443',
        'https://example.com/path',
    ])('accepts an allowed URI: %s', (uri) => {
        expect(getCustomLinkUriError(uri)).toBeNull();
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,<svg onload=alert(1)>',
        'file:///etc/passwd',
        ' https://example.com',
        'https%253A%252F%252Fevil.example',
    ])('rejects an unsafe URI: %s', (uri) => {
        expect(getCustomLinkUriError(uri)).not.toBeNull();
    });

    it('sanitizes SVG again before serving app config', () => {
        const config = createSubpageConfigFixture();
        config.svgLibrary.Link =
            '<svg onload="alert(1)"><path d="M1 1h2v2z" /><script>alert(1)</script></svg>';
        const parsed = SubscriptionPageConfigSchema.parse(config);
        expect(parsed.svgLibrary.Link).toContain('<path');
        expect(parsed.svgLibrary.Link).not.toMatch(/onload|script/iu);
    });
});
