import express from 'express';
import path from 'path'
import oidc from 'express-openid-connect';
import { auth as jwtAuth, requiredScopes } from 'express-oauth2-jwt-bearer';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
const { auth, requiresAuth } = oidc;
import dotenv from 'dotenv'
import { Pass, getPasses, getPass, savePass, cancelPass, deletePass, countPasses } from './db.js';
dotenv.config()

const app = express();
app.set("views", path.join(import.meta.dirname, "views"));
app.set('view engine', 'ejs');

const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 4080;
const baseURL = externalUrl || `http://localhost:${port}`;


const config = { 
  authRequired : false,
  idpLogout : true, 
  secret: process.env.SECRET,
  baseURL: baseURL,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: process.env.ISSUER_BASE_URL,
  clientSecret: process.env.CLIENT_SECRET,
  routes: {
    logout: false as const 
  },
  authorizationParams: {
    response_type: 'code' ,
  },
};
app.use(auth(config));

app.post('/logout', (req, res) => res.oidc.logout());

const verifyM2mToken = jwtAuth({
  issuerBaseURL: process.env.ISSUER_BASE_URL,
  audience: process.env.M2M_AUDIENCE,
  tokenSigningAlg: 'RS256',
  secret: '',
});

app.get(
  '/passes/:id',
  verifyM2mToken,
  requiredScopes('read:passes'),
  async (req, res) => {
    const pass = await getPass(String(req.params.id));
    if (!pass) return res.sendStatus(404);
    res.json(pass);
  },
);

app.post(
  '/passes',
  verifyM2mToken,
  requiredScopes('create:passes'),
  express.json(),
  async (req, res) => {
    const { name, document } = req.body ?? {};
    if (
      typeof name !== 'string' || name.trim().length === 0 ||
      typeof document !== 'string' || document.trim().length === 0
    ) {
      return res.status(400).json({ error: 'name and document must be included' });
    }

    const pass: Pass = {
      id: randomUUID(),
      name,
      document,
      issuedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    const publicPassUrl = `${baseURL}/pass-info/${pass.id}`;
    const passApiUrl = `${baseURL}/passes/${pass.id}`;
    const qrCode = await QRCode.toBuffer(publicPassUrl);
    await savePass(pass);

    res
      .status(201)
      .set('Location', passApiUrl)
      .type('image/png')
      .send(qrCode);
  },
);

const getUsername = (req: express.Request): string | undefined =>
  req.oidc.isAuthenticated() ? (req.oidc.user?.name ?? req.oidc.user?.sub) : undefined;

app.get('/',  async function (req, res) {
  const username = getUsername(req);
  const { total, active } = await countPasses();
  res.render('passes', {
    username,
    total,
    active,
    passes: username ? await getPasses() : [],
  });
});

app.get('/pass-info/:id', async function (req, res) {
  const pass = await getPass(String(req.params.id));
  const username = getUsername(req);
  if (!pass) return res.status(404).render('404', {username: getUsername(req)});
  res.render('pass-info', {username, pass});
});

app.post('/pass-info/:id/cancel', requiresAuth(), async function (req, res) {
  if (!(await cancelPass(String(req.params.id)))) return res.status(404).render('404', {username: getUsername(req)});
  res.redirect(`/pass-info/${req.params.id}`);
});

app.post('/pass-info/:id/delete', requiresAuth(), async function (req, res) {
  if (!(await deletePass(String(req.params.id)))) return res.status(404).render('404', {username: getUsername(req)});
  res.redirect(`/`);
});

app.get("/sign-up", (req, res) => {
  res.oidc.login({
    returnTo: '/',
    authorizationParams: {      
      screen_hint: "signup",
    },
  });
});

app.use((req, res) => {
  res.status(404).render('404', {username: getUsername(req)});
});

const hostname = externalUrl ? '0.0.0.0': '127.0.0.1';
app.listen(port, hostname, () => {
console.log(`Server locally running at http://${hostname}:${port}`)
if (externalUrl)
  console.log(`External URL: ${externalUrl}`);
});