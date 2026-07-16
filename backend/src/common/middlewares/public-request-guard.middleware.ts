import { NextFunction, Request, Response } from 'express';
import path from 'node:path';

const ASSET_EXTENSIONS = new Set([
    '.avif',
    '.css',
    '.gif',
    '.ico',
    '.jpeg',
    '.jpg',
    '.js',
    '.json',
    '.png',
    '.svg',
    '.ttf',
    '.wasm',
    '.webmanifest',
    '.webp',
    '.woff',
    '.woff2',
]);

const SENSITIVE_SEGMENTS = new Set([
    '.env',
    '.git',
    'backend',
    'dockerfile',
    'etc',
    'node_modules',
    'package-lock.json',
    'package.json',
    'proc',
    'src',
    'windows',
]);

const decodePath = (rawPath: string): string | null => {
    try {
        const once = decodeURIComponent(rawPath);
        const twice = once.includes('%') ? decodeURIComponent(once) : once;
        if (twice !== once) return null;
        return once;
    } catch {
        return null;
    }
};

export function publicRequestGuardMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        res.status(405).json({ statusCode: 405, message: 'Method not allowed' });
        return;
    }

    const rawPath = req.originalUrl.split('?')[0] ?? req.path;
    const decoded = decodePath(rawPath);
    if (!decoded || decoded.includes('\0') || decoded.includes('\\')) {
        res.status(404).json({ statusCode: 404, message: 'Not found' });
        return;
    }

    const segments = decoded.split('/').filter(Boolean);
    const lowerSegments = segments.map((segment) => segment.toLowerCase());
    const isAppConfig = decoded === '/assets/.app-config-v2.json';
    if (
        (!isAppConfig && segments.some((segment) => segment === '..' || segment.startsWith('.'))) ||
        lowerSegments.some((segment) => SENSITIVE_SEGMENTS.has(segment)) ||
        decoded.toLowerCase().endsWith('.map') ||
        segments.some((segment) => /^[A-Za-z]:/u.test(segment))
    ) {
        res.status(404).json({ statusCode: 404, message: 'Not found' });
        return;
    }

    if (decoded.startsWith('/assets/') || decoded.startsWith('/locales/')) {
        const extension = path.posix.extname(decoded).toLowerCase();
        const isAllowed = decoded.startsWith('/locales/')
            ? extension === '.json'
            : ASSET_EXTENSIONS.has(extension);
        if (!isAllowed) {
            res.status(404).json({ statusCode: 404, message: 'Not found' });
            return;
        }
    }

    next();
}

export const createHostGuardMiddleware = (allowedHostsValue: string | undefined) => {
    const allowedHosts = new Set(
        (allowedHostsValue ?? '')
            .split(',')
            .map((host) => parseHost(host.trim()))
            .filter((host): host is string => Boolean(host)),
    );

    return (req: Request, res: Response, next: NextFunction) => {
        if (allowedHosts.size === 0) return next();
        const host = parseHost(req.headers.host);
        if (!host || !allowedHosts.has(host)) {
            res.status(400).json({ statusCode: 400, message: 'Invalid host' });
            return;
        }
        next();
    };
};

function parseHost(value: string | undefined): string | null {
    if (!value || /[\s,@/\\]/u.test(value)) return null;
    try {
        return new URL(`http://${value}`).hostname.toLowerCase();
    } catch {
        return null;
    }
}
