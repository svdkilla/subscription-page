export const SUBSCRIPTION_REQUEST_HEADERS_ALLOWLIST = new Set([
    'accept',
    'accept-language',
    'if-modified-since',
    'if-none-match',
    'user-agent',
    'x-remnawave-client-type',
]);

export const SUBSCRIPTION_RESPONSE_HEADERS_ALLOWLIST = new Set([
    'content-disposition',
    'content-type',
    'etag',
    'last-modified',
    'profile-update-interval',
    'profile-web-page-url',
    'subscription-userinfo',
    'x-subscription-userinfo',
]);

export const INTERNAL_JWT_ISSUER = 'remnawave-subscription-page';
export const INTERNAL_JWT_AUDIENCE = 'remnawave-subscription-page-browser';
