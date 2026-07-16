// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { sanitizeLocalizedHtmlForDisplay } from '@shared/ui/safe-html'

import { getSafeButtonUri } from './safe-button-uri'

describe('installation button URI validation', () => {
    it.each([
        ['https://example.com/app', 'external'],
        ['happ://add/https://subscription.invalid/test', 'subscriptionLink'],
        ['stash://install-config?url=https://subscription.invalid/test', 'copyButton']
    ] as const)('accepts %s for %s', (uri, type) => {
        expect(getSafeButtonUri(uri, type)).toBe(uri)
    })

    it.each([
        ['java', 'script:alert(1)'].join(''),
        'data:text/html,<svg onload=alert(1)>',
        'file:///etc/passwd',
        'https%253A%252F%252Fevil.invalid',
        'https://example.com/%0d%0aX-Injected:%20yes',
        ' https://example.com',
        'https://example.com/{{UNRESOLVED}}'
    ])('rejects unsafe URI %s', (uri) => {
        expect(getSafeButtonUri(uri, 'subscriptionLink')).toBeNull()
    })

    it('allows only HTTP(S) for external buttons', () => {
        expect(getSafeButtonUri('happ://add/test', 'external')).toBeNull()
    })

    it('removes active markup from localized guide HTML', () => {
        const sanitized = sanitizeLocalizedHtmlForDisplay(
            '<strong>Safe</strong><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a><svg onload=alert(1) />'
        )
        expect(sanitized).toContain('<strong>Safe</strong>')
        expect(sanitized).toContain('link')
        expect(sanitized).not.toMatch(/img|onerror|href|javascript|svg|onload/iu)
    })
})
