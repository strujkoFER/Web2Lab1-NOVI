import { writeFile } from 'node:fs/promises';
export async function getToken(authority, audience, clientId, clientSecret, scope) {
    const res = await fetch(`${authority}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            audience,
            scope,
        }),
    });
    if (!res.ok) {
        throw new Error(`Token request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json());
    if (!data.access_token) {
        throw new Error('Response doesn\'t contain access token');
    }
    return data.access_token;
}
export async function issuePass(url, token, name, document) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, document }),
    });
    if (res.status !== 201) {
        throw new Error(`Issuing pass failed: ${res.status} ${res.statusText}`);
    }
    const location = res.headers.get('Location');
    if (!location) {
        throw new Error('Response doesn\'t contain Location header');
    }
    const id = location.split('/').filter(Boolean).pop();
    if (!id) {
        throw new Error(`Invalid Location header: ${location}`);
    }
    const image = Buffer.from(await res.arrayBuffer());
    await writeFile(`${id}.png`, image);
}
async function main() {
    const authority = process.env.ISSUER_BASE_URL;
    const audience = process.env.M2M_AUDIENCE;
    const clientId = process.env.M2M_CLIENT_ID;
    const clientSecret = process.env.M2M_CLIENT_SECRET;
    const scope = 'create:passes';
    const externalUrl = process.env.RENDER_EXTERNAL_URL;
    const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 4080;
    const baseURL = externalUrl || `http://localhost:${port}`;
    if (process.env.RENDER_EXTERNAL_URL === undefined) {
        console.log('Running test on local app');
    }
    const url = `${baseURL}/passes`;
    if (authority === undefined) {
        throw new Error('authority is not defined');
    }
    if (audience === undefined) {
        throw new Error('audience is not defined');
    }
    if (clientId === undefined) {
        throw new Error('clientId is not defined');
    }
    if (clientSecret === undefined) {
        throw new Error('clientSecret is not defined');
    }
    const token = await getToken(authority, audience, clientId, clientSecret, scope);
    console.log('Token obtained: ', token);
    const document = `HR-${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`;
    await issuePass(url, token, 'David Davidović', document);
    console.log('Pass successfully issued.');
}
main().catch(console.error);
