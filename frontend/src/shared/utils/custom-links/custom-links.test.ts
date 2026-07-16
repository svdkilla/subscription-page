import { describe, expect, it } from 'vitest'

import {
    getCustomLinkUriError,
    isHttpCustomLinkUri,
    resolveCustomLinks,
    SubscriptionPageConfigSchema
} from './custom-links.schema'
import { E2E_SUBSCRIPTION_RESPONSE, getE2EAppConfig } from '../../../../e2e/fixtures/e2e-fixtures'

describe('subscription-page custom links', () => {
    it('keeps header resolution separate from connection keys', () => {
        const config = SubscriptionPageConfigSchema.parse(getE2EAppConfig(1))
        const resolved = resolveCustomLinks(
            config,
            E2E_SUBSCRIPTION_RESPONSE.response,
            'en',
            'https://example.com/e2e-short-uuid'
        )

        expect(resolved).toHaveLength(1)
        expect(resolved[0]).toMatchObject({ name: 'Open help', uri: 'https://example.com/help' })
    })

    // eslint-disable-next-line no-script-url
    it.each(['javascript:alert(1)', 'data:text/html,<script>x</script>', ' file:///etc/passwd'])(
        'rejects %s',
        (uri) => expect(getCustomLinkUriError(uri)).not.toBeNull()
    )

    it('keeps old configs working when customLinks is absent', () => {
        const oldConfig = getE2EAppConfig(1)
        const { customLinks: _customLinks, ...withoutCustomLinks } = oldConfig
        expect(SubscriptionPageConfigSchema.parse(withoutCustomLinks).customLinks).toEqual([])
    })

    it('separates website links for the page header from VPN links', () => {
        expect(isHttpCustomLinkUri('https://example.com/help')).toBe(true)
        expect(isHttpCustomLinkUri('http://example.com/help')).toBe(true)
        expect(isHttpCustomLinkUri('vless://id@example.com:443')).toBe(false)
    })

    it.each([
        'wg://opaque-payload#WG',
        'awg://opaque-payload#AWG',
        'myvpn+test://anything-the-client-understands#Custom'
    ])('accepts a safe custom connection scheme: %s', (uri) => {
        expect(getCustomLinkUriError(uri)).toBeNull()
    })

    it('accepts connection links without presentation metadata', () => {
        const config = getE2EAppConfig(1)
        ;(config as { customLinks: unknown[] }).customLinks = [
            {
                id: 'connection-only',
                enabled: true,
                uri: 'awg://opaque-payload#Name-from-fragment',
                order: 0,
                mode: 'literal'
            }
        ]

        const parsed = SubscriptionPageConfigSchema.parse(config)
        expect(parsed.customLinks[0]?.displayName).toEqual({})
        expect(parsed.customLinks[0]?.action).toBe('copy')
    })
})
