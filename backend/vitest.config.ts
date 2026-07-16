import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@common': path.resolve(process.cwd(), 'src/common'),
            '@modules': path.resolve(process.cwd(), 'src/modules'),
        },
    },
    test: {
        clearMocks: true,
    },
});
