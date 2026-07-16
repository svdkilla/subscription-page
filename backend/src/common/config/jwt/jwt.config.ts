import { JwtModuleAsyncOptions } from '@nestjs/jwt';

import { INTERNAL_JWT_AUDIENCE, INTERNAL_JWT_ISSUER } from '@common/constants';

export const getJWTConfig = (): JwtModuleAsyncOptions => ({
    useFactory: () => ({
        secret: process.env.INTERNAL_JWT_SECRET,
        signOptions: {
            algorithm: 'HS256',
            issuer: INTERNAL_JWT_ISSUER,
            audience: INTERNAL_JWT_AUDIENCE,
        },
    }),
});
