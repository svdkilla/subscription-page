import { IconCheck, IconCopy, IconExternalLink, IconQrcode } from '@tabler/icons-react'
import { Button, CopyButton, Group, Image, Stack, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { renderSVG } from 'uqr'

import {
    isHttpCustomLinkUri,
    resolveCustomLinks,
    ResolvedCustomLink
} from '@shared/utils/custom-links'
import { constructSubscriptionUrl } from '@shared/utils/construct-subscription-url'
import { useAppConfig, useCurrentLang } from '@entities/app-config-store'
import { useSubscription } from '@entities/subscription-info-store'
import { vibrate } from '@shared/utils/vibrate'
import { SafeSvg } from '@shared/ui/safe-svg'

import classes from './custom-links.module.css'

const LinkIcon = ({ link }: { link: ResolvedCustomLink }) => {
    const config = useAppConfig()
    return link.iconKey ? (
        <SafeSvg source={config.svgLibrary[link.iconKey]} />
    ) : (
        <IconExternalLink size={14} />
    )
}

export function HeaderCustomLinksWidget() {
    const config = useAppConfig()
    const locale = useCurrentLang()
    const subscription = useSubscription()
    const subscriptionUrl = constructSubscriptionUrl(
        window.location.href,
        subscription.user.shortUuid
    )
    const links = resolveCustomLinks(config, subscription, locale, subscriptionUrl).filter((link) =>
        isHttpCustomLinkUri(link.uri)
    )

    if (links.length === 0) return null

    const showQr = (link: ResolvedCustomLink) => {
        const qrCode = renderSVG(link.uri, {
            whiteColor: '#161B22',
            blackColor: '#a78bfa'
        })
        modals.open({
            centered: true,
            title: link.name,
            classNames: {
                content: classes.modalContent,
                header: classes.modalHeader,
                title: classes.modalTitle
            },
            children: (
                <Stack align="center">
                    <Image
                        alt="QR code"
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`}
                        style={{ borderRadius: 'var(--mantine-radius-md)' }}
                    />
                </Stack>
            )
        })
    }

    return (
        <Group gap={4} justify="flex-end" wrap="wrap">
            {links.map((link) => {
                if (link.action === 'copy') {
                    return (
                        <CopyButton key={link.id} value={link.uri}>
                            {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied' : 'Copy link'}>
                                    <Button
                                        aria-label={`${copied ? 'Copied' : 'Copy'} ${link.name}`}
                                        color={copied ? 'teal' : 'gray'}
                                        leftSection={
                                            copied ? (
                                                <IconCheck size={14} />
                                            ) : (
                                                <IconCopy size={14} />
                                            )
                                        }
                                        onClick={() => {
                                            vibrate('drop')
                                            copy()
                                        }}
                                        size="compact-sm"
                                        variant="subtle"
                                    >
                                        {link.name}
                                    </Button>
                                </Tooltip>
                            )}
                        </CopyButton>
                    )
                }

                if (link.action === 'qr') {
                    return (
                        <Tooltip key={link.id} label="Show QR code">
                            <Button
                                aria-label={`Show ${link.name} QR code`}
                                color="gray"
                                leftSection={<IconQrcode size={14} />}
                                onClick={() => {
                                    vibrate('tap')
                                    showQr(link)
                                }}
                                size="compact-sm"
                                variant="subtle"
                            >
                                {link.name}
                            </Button>
                        </Tooltip>
                    )
                }

                return (
                    <Tooltip key={link.id} label="Open in a new tab">
                        <Button
                            aria-label={`Open ${link.name}`}
                            color="gray"
                            component="a"
                            href={link.uri}
                            leftSection={<LinkIcon link={link} />}
                            onClick={() => vibrate('tap')}
                            rel="noopener noreferrer"
                            size="compact-sm"
                            target="_blank"
                            variant="subtle"
                        >
                            {link.name}
                        </Button>
                    </Tooltip>
                )
            })}
        </Group>
    )
}
