import { describe, expect, it } from 'vitest'

import {
    getCustomLinkUriError,
    resolveCustomLinks,
    SubscriptionPageConfigSchema
} from './custom-links.schema'
import { E2E_SUBSCRIPTION_RESPONSE, getE2EAppConfig } from '../../../../e2e/fixtures/e2e-fixtures'

describe('subscription-page custom links', () => {
    it('resolves vless and hy2 links without changing their secret payload', () => {
        const config = SubscriptionPageConfigSchema.parse(getE2EAppConfig(1))
        const resolved = resolveCustomLinks(
            config,
            E2E_SUBSCRIPTION_RESPONSE.response,
            'en',
            'https://example.com/e2e-short-uuid'
        )

        expect(resolved.find((link) => link.name === 'VLESS QR')?.uri).toMatch(/^vless:\/\//u)
        expect(resolved.find((link) => link.name === 'HY2 Copy')?.uri).toMatch(/^hy2:\/\//u)
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
})
