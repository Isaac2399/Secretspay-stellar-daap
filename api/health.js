const PLACEHOLDER = /ENTER_YOUR_/i;
export default function handler(_req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
        ok: true,
        service: 'stellar-web-app',
        vercelEnv: process.env.VERCEL_ENV ?? 'local',
        loyalty: {
            LOYALTY_CODE: hasEnv('LOYALTY_CODE'),
            VITE_LOYALTY_CODE: hasEnv('VITE_LOYALTY_CODE'),
            LOYALTY_ISSUER: hasEnv('LOYALTY_ISSUER'),
            VITE_LOYALTY_ISSUER: hasEnv('VITE_LOYALTY_ISSUER'),
        },
    }));
}
function hasEnv(key) {
    const value = String(process.env[key] ?? '').trim();
    return Boolean(value) && !PLACEHOLDER.test(value);
}
