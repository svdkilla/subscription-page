import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('renders safe custom VPN actions and refreshes changed config on focus', async ({ page }) => {
    await page.request.get('/__e2e/config-version?value=1')
    await page.goto('/e2e-short-uuid')

    await expect(page).toHaveTitle('Subscription E2E')
    await expect(page.getByText('E2E-VLESS')).toBeVisible()
    await expect(page.getByText('E2E-HY2')).toBeVisible()
    await expect(page.getByText('E2E-CUSTOM-LAST')).toBeVisible()
    await expect(page.locator('.header-wrapper').getByText('Open help')).toBeVisible()

    expect(
        await page.evaluate(() => ({
            executed: (window as typeof window & { __svgXss?: number }).__svgXss,
            unsafeNodes: document.querySelectorAll('svg script, svg foreignObject, svg [onload]')
                .length
        }))
    ).toEqual({ executed: undefined, unsafeNodes: 0 })

    await page.getByRole('button', { name: 'Show connection key QR code' }).first().click()
    await expect(page.getByRole('dialog')).toContainText('E2E-VLESS')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Copy connection key' }).nth(1).click()
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
    await page.request.get('/__e2e/config-version?value=1')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/e2e-short-uuid')

    await expect(page.getByText('E2E-VLESS')).toBeVisible()
    await expect(page.getByText('E2E-CUSTOM-LAST')).toBeVisible()
    await expect(page.locator('.header-wrapper').getByText('Open help')).toBeVisible()
    await expect(
        page.getByRole('button', { name: 'Show connection key QR code' }).first()
    ).toBeVisible()
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
})
