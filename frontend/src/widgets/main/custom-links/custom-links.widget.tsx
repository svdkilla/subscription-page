import {
    ActionIcon,
    Badge,
    Box,
    Card,
    CopyButton,
    Group,
    Image,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip
} from '@mantine/core'
import { IconCheck, IconCopy, IconExternalLink, IconLink, IconQrcode } from '@tabler/icons-react'
import { modals } from '@mantine/modals'
import { renderSVG } from 'uqr'

import { constructSubscriptionUrl } from '@shared/utils/construct-subscription-url'
import { resolveCustomLinks, ResolvedCustomLink } from '@shared/utils/custom-links'
import { useAppConfig, useCurrentLang } from '@entities/app-config-store'
import { useSubscription } from '@entities/subscription-info-store'
import { vibrate } from '@shared/utils/vibrate'
import { SafeSvg } from '@shared/ui/safe-svg'

import classes from './custom-links.module.css'

interface Props {
    isMobile: boolean
}

const openExplicitly = (uri: string) => {
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(uri)?.[1]?.toLowerCase()
    if (scheme === 'http' || scheme === 'https') {
        const opened = window.open(uri, '_blank', 'noopener,noreferrer')
        if (opened) opened.opener = null
        return
    }
    window.location.assign(uri)
}

export function CustomLinksWidget({ isMobile }: Props) {
    const config = useAppConfig()
    const locale = useCurrentLang()
    const subscription = useSubscription()
    const subscriptionUrl = constructSubscriptionUrl(
        window.location.href,
        subscription.user.shortUuid
    )
    const links = resolveCustomLinks(config, subscription, locale, subscriptionUrl)

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
        <Card p={{ base: 'sm', xs: 'md', sm: 'lg', md: 'xl' }} radius="lg">
            <Stack gap="md">
                <Group gap="sm" justify="space-between">
                    <Group gap="xs">
                        <Title c="white" fw={600} order={4}>
                            {config.baseTranslations.connectionKeysHeader[locale] ??
                                config.baseTranslations.connectionKeysHeader.en}
                        </Title>
                        <Badge color="violet" variant="light">
                            Custom
                        </Badge>
                    </Group>
                    {links.length > 1 && (
                        <Badge color="violet" size="lg" variant="light">
                            {links.length}
                        </Badge>
                    )}
                </Group>

                <ScrollArea.Autosize mah={300} scrollbars="y">
                    <Stack gap="xs">
                        {links.map((link) => (
                            <Box className={classes.linkBox} key={link.id} p="xs">
                                <Group justify="space-between" wrap="nowrap">
                                    <Group gap="sm" miw={0} wrap="nowrap">
                                        <Box className={classes.icon}>
                                            {link.iconKey ? (
                                                <SafeSvg source={config.svgLibrary[link.iconKey]} />
                                            ) : (
                                                <IconLink size={isMobile ? 16 : 18} />
                                            )}
                                        </Box>
                                        <Text
                                            c="white"
                                            fw={500}
                                            size={isMobile ? 'xs' : 'sm'}
                                            truncate
                                        >
                                            {link.name}
                                        </Text>
                                    </Group>

                                    {link.action === 'copy' && (
                                        <CopyButton value={link.uri}>
                                            {({ copied, copy }) => (
                                                <Tooltip label={copied ? 'Copied' : 'Copy'}>
                                                    <ActionIcon
                                                        aria-label="Copy custom link"
                                                        color={copied ? 'teal' : 'violet'}
                                                        onClick={() => {
                                                            vibrate('drop')
                                                            copy()
                                                        }}
                                                        size={isMobile ? 'sm' : 'md'}
                                                        variant="subtle"
                                                    >
                                                        {copied ? (
                                                            <IconCheck size={16} />
                                                        ) : (
                                                            <IconCopy size={16} />
                                                        )}
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </CopyButton>
                                    )}
                                    {link.action === 'qr' && (
                                        <Tooltip label="Show QR">
                                            <ActionIcon
                                                aria-label="Show custom link QR code"
                                                color="violet"
                                                onClick={() => {
                                                    vibrate('tap')
                                                    showQr(link)
                                                }}
                                                size={isMobile ? 'sm' : 'md'}
                                                variant="subtle"
                                            >
                                                <IconQrcode size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                    {link.action === 'open' && (
                                        <Tooltip label="Open">
                                            <ActionIcon
                                                aria-label="Open custom link"
                                                color="violet"
                                                onClick={() => {
                                                    vibrate('tap')
                                                    openExplicitly(link.uri)
                                                }}
                                                size={isMobile ? 'sm' : 'md'}
                                                variant="subtle"
                                            >
                                                <IconExternalLink size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </Group>
                            </Box>
                        ))}
                    </Stack>
                </ScrollArea.Autosize>
            </Stack>
        </Card>
    )
}
