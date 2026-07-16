import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('renders safe custom VPN actions and refreshes changed config on focus', async ({ page }) => {
    await page.goto('/e2e-short-uuid')

    await expect(page).toHaveTitle('Subscription E2E')
    await expect(page.getByText('VLESS QR')).toBeVisible()
    await expect(page.getByText('HY2 Copy')).toBeVisible()
    await expect(page.getByText('Open help')).toBeVisible()

    expect(
        await page.evaluate(() => ({
            executed: (window as typeof window & { __svgXss?: number }).__svgXss,
            unsafeNodes: document.querySelectorAll('svg script, svg foreignObject, svg [onload]')
                .length
        }))
    ).toEqual({ executed: undefined, unsafeNodes: 0 })

    await page.getByRole('button', { name: 'Show custom link QR code' }).click()
    await expect(page.getByRole('dialog')).toContainText('VLESS QR')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Copy custom link' }).click()
    await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain('hy2://secret@example.com:443')

    await page.request.get('/__e2e/config-version?value=2')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page).toHaveTitle('Subscription E2E Updated')
    await expect(page.getByRole('img', { name: 'logo' })).toHaveAttribute(
        'src',
        'https://example.com/updated-logo.svg'
    )
    await expect(page.getByText('E2E-VLESS')).toHaveCount(0)
})

test('keeps custom-link actions usable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/e2e-short-uuid')

    await expect(page.getByText('VLESS QR')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show custom link QR code' })).toBeVisible()
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
})
