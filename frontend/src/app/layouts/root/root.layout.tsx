import { GetSubscriptionInfoByShortUuidCommand } from '@remnawave/backend-contract'
import { APP_CONFIG_ROUTE_LEADING_PATH } from '@remnawave/subscription-page-types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Alert, Button, Stack, Text } from '@mantine/core'
import consola from 'consola/browser'
import { Outlet } from 'react-router'

import {
    useSubscriptionInfoStoreActions,
    useSubscriptionInfoStoreInfo
} from '@entities/subscription-info-store'
import { useAppConfigStoreActions, useIsConfigLoaded } from '@entities/app-config-store'
import { SubscriptionPageConfigSchema } from '@shared/utils/custom-links'
import { LoadingScreen } from '@shared/ui'

import classes from './root.module.css'

const CONFIG_REFRESH_INTERVAL_MS = 20_000

export function RootLayout() {
    const subscriptionActions = useSubscriptionInfoStoreActions()
    const configActions = useAppConfigStoreActions()
    const { subscription } = useSubscriptionInfoStoreInfo()
    const isConfigLoaded = useIsConfigLoaded()
    const [initialConfigError, setInitialConfigError] = useState(false)
    const refreshConfigRef = useRef<() => Promise<void>>(async () => undefined)

    useLayoutEffect(() => {
        const subPageDiv = document.getElementById('sbpg')
        if (!subPageDiv) return

        const encodedSubscription = subPageDiv.dataset.panel
        if (encodedSubscription) {
            try {
                const parsed: GetSubscriptionInfoByShortUuidCommand.Response = JSON.parse(
                    atob(encodedSubscription)
                )
                subscriptionActions.setSubscriptionInfo({ subscription: parsed.response })
            } catch {
                consola.error('Failed to read subscription data.')
            }
        }
        subPageDiv.remove()
    }, [subscriptionActions])

    useEffect(() => {
        let etag: null | string = null
        let inFlight: null | Promise<void> = null
        let hasLoaded = false
        const controller = new AbortController()

        const fetchConfig = async () => {
            if (inFlight) return inFlight

            inFlight = (async () => {
                try {
                    const headers = new Headers()
                    if (etag) headers.set('If-None-Match', etag)

                    const response = await fetch(APP_CONFIG_ROUTE_LEADING_PATH, {
                        cache: 'no-store',
                        credentials: 'same-origin',
                        headers,
                        signal: controller.signal
                    })
                    if (response.status === 304) return
                    if (!response.ok) throw new Error('Config request failed')

                    const parsed = await SubscriptionPageConfigSchema.safeParseAsync(
                        await response.json()
                    )
                    if (!parsed.success) throw new Error('Config validation failed')

                    etag = response.headers.get('etag')
                    configActions.setConfig(parsed.data)
                    document.title = parsed.data.baseSettings.metaTitle
                    const description = document.querySelector<HTMLMetaElement>(
                        'meta[name="description"]'
                    )
                    description?.setAttribute('content', parsed.data.baseSettings.metaDescription)
                    hasLoaded = true
                    setInitialConfigError(false)
                } catch {
                    if (controller.signal.aborted) return
                    consola.error('Failed to refresh app configuration.')
                    if (!hasLoaded) setInitialConfigError(true)
                } finally {
                    inFlight = null
                }
            })()

            return inFlight
        }

        refreshConfigRef.current = fetchConfig
        fetchConfig().catch(() => undefined)

        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible') fetchConfig().catch(() => undefined)
        }, CONFIG_REFRESH_INTERVAL_MS)
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') fetchConfig().catch(() => undefined)
        }
        const refreshOnFocus = () => fetchConfig().catch(() => undefined)
        document.addEventListener('visibilitychange', refreshWhenVisible)
        window.addEventListener('focus', refreshOnFocus)

        return () => {
            controller.abort()
            window.clearInterval(interval)
            document.removeEventListener('visibilitychange', refreshWhenVisible)
            window.removeEventListener('focus', refreshOnFocus)
        }
    }, [configActions])

    if (!isConfigLoaded || !subscription) {
        return (
            <div className={classes.root}>
                <div className="animated-background"></div>
                <div className={classes.content}>
                    <main className={classes.main}>
                        {initialConfigError ? (
                            <Stack align="center" h="100vh" justify="center" p="md">
                                <Alert color="red" maw={480} title="Page settings are unavailable">
                                    <Stack gap="sm">
                                        <Text size="sm">
                                            The panel could not provide a valid configuration. Try
                                            again in a moment.
                                        </Text>
                                        <Button
                                            onClick={() =>
                                                refreshConfigRef.current().catch(() => undefined)
                                            }
                                            variant="light"
                                        >
                                            Try again
                                        </Button>
                                    </Stack>
                                </Alert>
                            </Stack>
                        ) : (
                            <LoadingScreen height="100vh" />
                        )}
                    </main>
                </div>
            </div>
        )
    }

    return (
        <div className={classes.root}>
            <div className="animated-background"></div>
            <div className={classes.content}>
                <main className={classes.main}>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
