import { describe, expect, it } from 'vitest';

import { getCustomLinkUriError, SubscriptionPageConfigSchema } from '@common/subpage-config';

import { createSubpageConfigFixture } from '../fixtures/subpage-config.fixture';

describe('subscription-page custom link security', () => {
    it.each([
        'vless://id@example.com:443?security=tls',
        'hysteria2://secret@example.com:443',
        'hy2://secret@example.com:443',
        'wg://opaque-payload#WG',
        'awg://opaque-payload#AWG',
        'myvpn+test://anything-the-client-understands#Custom',
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
            '<svg onload="alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M1 1h2v2z" style="fill:url(https://example.invalid/x)" /><script>alert(1)</script><foreignObject>bad</foreignObject><image xlink:href="javascript:alert(1)" /></svg>';
        const parsed = SubscriptionPageConfigSchema.parse(config);
        expect(parsed.svgLibrary.Link).toContain('<path');
        expect(parsed.svgLibrary.Link).not.toMatch(
            /onload|script|foreignObject|image|xlink|javascript:|style|url\s*\(/iu,
        );
    });

    it('sanitizes localized HTML again before serving app config', () => {
        const config = createSubpageConfigFixture();
        config.baseTranslations.installationGuideHeader.en =
            '<strong>Safe</strong><img src=x onerror=alert(1)><svg onload=alert(1) />';
        const parsed = SubscriptionPageConfigSchema.parse(config);
        expect(parsed.baseTranslations.installationGuideHeader.en).toContain(
            '<strong>Safe</strong>',
        );
        expect(parsed.baseTranslations.installationGuideHeader.en).not.toMatch(
            /img|onerror|svg|onload/iu,
        );
    });

    it('rejects unsafe branding URLs even if an older shared schema accepted them', () => {
        const config = createSubpageConfigFixture();
        config.brandingSettings.logoUrl = 'data:image/svg+xml,<svg onload=alert(1) />';
        expect(SubscriptionPageConfigSchema.safeParse(config).success).toBe(false);
    });

    it('rejects unsafe installation button schemes from old configs', () => {
        const config = createSubpageConfigFixture() as {
            platforms: Record<string, unknown>;
        } & ReturnType<typeof createSubpageConfigFixture>;
        config.platforms = {
            ios: {
                displayName: { en: 'iOS' },
                svgIconKey: 'Link',
                apps: [
                    {
                        name: 'Test app',
                        featured: false,
                        blocks: [
                            {
                                svgIconKey: 'Link',
                                svgIconColor: 'blue',
                                title: { en: 'Install' },
                                description: { en: 'Test' },
                                buttons: [
                                    {
                                        link: 'javascript:alert(1)',
                                        type: 'subscriptionLink',
                                        text: { en: 'Open' },
                                        svgIconKey: 'Link',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        expect(SubscriptionPageConfigSchema.safeParse(config).success).toBe(false);
    });

    it('keeps existing Incy installation buttons compatible', () => {
        const config = createSubpageConfigFixture() as {
            platforms: Record<string, unknown>;
        } & ReturnType<typeof createSubpageConfigFixture>;
        config.platforms = {
            ios: {
                displayName: { en: 'iOS' },
                svgIconKey: 'Link',
                apps: [
                    {
                        name: 'Incy',
                        featured: false,
                        blocks: [
                            {
                                svgIconKey: 'Link',
                                svgIconColor: 'blue',
                                title: { en: 'Install' },
                                description: { en: 'Test' },
                                buttons: [
                                    {
                                        link: 'incy://import/https://subscription.invalid/test',
                                        type: 'subscriptionLink',
                                        text: { en: 'Open' },
                                        svgIconKey: 'Link',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        expect(SubscriptionPageConfigSchema.safeParse(config).success).toBe(true);
    });

    it('accepts a connection link but keeps it out of public app config', () => {
        const config = createSubpageConfigFixture();
        config.customLinks = [
            {
                id: 'connection-only',
                enabled: true,
                uri: 'awg://opaque-payload#Name-from-fragment',
                order: 0,
                mode: 'subscriptionLinks',
            },
        ] as typeof config.customLinks;

        const parsed = SubscriptionPageConfigSchema.parse(config);
        expect(parsed.customLinks).toEqual([]);
    });

    it('does not publish private internal-squad selectors in app config', () => {
        const config = createSubpageConfigFixture();
        config.customLinks = [
            {
                id: 'private-audience',
                enabled: true,
                uri: 'vless://test-marker@example.com:443#Private-audience',
                order: 0,
                mode: 'subscriptionLinks',
                internalSquadUuids: ['11111111-1111-4111-8111-111111111111'],
            },
        ] as typeof config.customLinks;

        const parsed = SubscriptionPageConfigSchema.parse(config);
        expect(parsed.customLinks).toEqual([]);
    });

    it('removes legacy selectors and templates while keeping destinations separate', () => {
        const config = createSubpageConfigFixture();
        const base = {
            id: 'test-link',
            enabled: true,
            displayName: { en: 'Test' },
            action: 'open',
            order: 0,
        };

        config.customLinks = [
            { ...base, mode: 'template', uri: 'https://example.com/{{username}}' },
            {
                ...base,
                id: 'old-selector',
                mode: 'subscriptionLinks',
                protocol: 'vless',
                uri: 'https://',
            },
        ] as typeof config.customLinks;
        const parsed = SubscriptionPageConfigSchema.parse(config);
        expect(parsed.customLinks).toEqual([]);

        config.customLinks = [
            {
                ...base,
                id: 'complete-legacy-link',
                mode: 'subscriptionLinks',
                protocol: 'vless',
                uri: 'vless://test-marker@example.com:443#Legacy',
            },
        ] as typeof config.customLinks;
        const migrated = SubscriptionPageConfigSchema.parse(config);
        expect(migrated.customLinks).toEqual([]);

        for (const customLink of [
            { ...base, mode: 'literal', uri: 'vless://opaque#Wrong' },
            { ...base, mode: 'subscriptionLinks', uri: 'https://example.com/wrong' },
        ]) {
            config.customLinks = [customLink] as typeof config.customLinks;
            expect(SubscriptionPageConfigSchema.safeParse(config).success).toBe(false);
        }
    });
});
