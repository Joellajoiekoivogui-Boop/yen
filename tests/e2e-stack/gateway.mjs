/**
 * Passerelle de test locale : reproduit le routage d'un projet Supabase
 *   /auth/v1/*    -> GoTrue (port 9999)
 *   /rest/v1/*    -> PostgREST (port 3001)
 *   /storage/v1/* -> émulateur de stockage ci-dessous (RLS appliqué comme
 *                    Supabase Storage : requêtes exécutées avec le rôle et le JWT
 *                    de l'appelant sur storage.objects).
 * Usage strictement réservé aux tests ; ne pas déployer.
 */
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const SECRET = process.env.JWT_SECRET;
const DB = process.env.DATABASE_URL;
const DATA = process.env.STORAGE_DIR ?? "/var/tmp/sbstack/files";
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
mkdirSync(DATA, { recursive: true });
const pool = new pg.Pool({ connectionString: DB, max: 5 });

const b64url = (b) => Buffer.from(b).toString("base64url");
function verify(token) {
  const [h, p, s] = String(token ?? "").split(".");
  if (!h || !p || !s) return null;
  const expected = createHmac("sha256", SECRET).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}
function sign(payload) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
async function asRole(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const role = claims.role === "service_role" ? "service_role" : claims.role === "authenticated" ? "authenticated" : "anon";
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
// Comme Supabase Storage : requêtes depuis le navigateur autorisées (téléversement direct par URL signée)
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-upsert, cache-control",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...CORS, ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok) => { const chunks = []; req.on("data", (d) => chunks.push(d)); req.on("end", () => ok(Buffer.concat(chunks))); });
const fileOf = (bucket, name) => path.join(DATA, bucket, ...name.split("/").map((x) => x.replace(/\.\./g, "")));

async function storage(req, res, url) {
  const rest = url.pathname.replace(/^\/storage\/v1\//, "");
  const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? req.headers.apikey;
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  // Téléversement via URL signée (navigateur, sans session) : propriétaire et chemin portés par le jeton
  if (req.method === "PUT" && rest.startsWith("object/upload/sign/")) {
    const claims = verify(url.searchParams.get("token"));
    const [, , , bucket, ...p] = rest.split("/");
    const name = decodeURIComponent(p.join("/"));
    if (!claims || claims.url !== `${bucket}/${name}` || claims.kind !== "upload") return send(res, 400, { statusCode: "400", error: "InvalidSignature", message: "Invalid signature" });
    const raw = await readBody(req);
    let body = raw;
    let mime = req.headers["content-type"] ?? "application/octet-stream";
    if (/^multipart\/form-data/i.test(mime)) {
      const form = await new Response(raw, { headers: { "content-type": mime } }).formData();
      const file = [...form.values()].find((v) => typeof v === "object");
      if (!file) return send(res, 400, { statusCode: "400", error: "InvalidRequest", message: "No file" });
      body = Buffer.from(await file.arrayBuffer());
      mime = file.type || "application/octet-stream";
    }
    const { rows: [b] } = await pool.query("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
    if (!b) return send(res, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    if (b.allowed_mime_types?.length && !b.allowed_mime_types.includes(mime.split(";")[0])) return send(res, 400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${mime} is not supported` });
    if (b.file_size_limit && body.length > Number(b.file_size_limit)) return send(res, 400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    try {
      await pool.query("insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)", [bucket, name, claims.owner ?? null, { mimetype: mime, size: body.length }]);
    } catch {
      return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    }
    mkdirSync(path.dirname(fileOf(bucket, name)), { recursive: true });
    writeFileSync(fileOf(bucket, name), body);
    return send(res, 200, { Key: `${bucket}/${name}` });
  }
  // Téléchargement via URL signée
  if (req.method === "GET" && rest.startsWith("object/sign/")) {
    const claims = verify(url.searchParams.get("token"));
    const [, , bucket, ...p] = rest.split("/");
    const name = decodeURIComponent(p.join("/"));
    if (!claims || claims.url !== `${bucket}/${name}`) return send(res, 400, { error: "InvalidSignature" });
    const f = fileOf(bucket, name);
    if (!existsSync(f)) return send(res, 404, { error: "not_found" });
    const mime = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[name.split(".").pop().toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": mime, "x-content-type-options": "nosniff", ...(url.searchParams.has("download") ? { "content-disposition": `attachment; filename="${url.searchParams.get("download") || "fichier.pdf"}"` } : {}) });
    return res.end(readFileSync(f));
  }
  const claims = verify(auth);
  if (!claims) return send(res, 401, { statusCode: "401", error: "Unauthorized", message: "Invalid JWT" });
  try {
    // Création d'une URL de téléversement signée : droit d'insertion vérifié (RLS) sans rien écrire
    if (req.method === "POST" && rest.startsWith("object/upload/sign/")) {
      const [, , , bucket, ...p] = rest.split("/");
      const name = decodeURIComponent(p.join("/"));
      await asRole(claims, async (c) => {
        await c.query("savepoint probe");
        await c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, claims.sub ?? null]);
        await c.query("rollback to savepoint probe");
      });
      const token = sign({ url: `${bucket}/${name}`, kind: "upload", owner: claims.sub ?? null, exp: Math.floor(Date.now() / 1000) + 7200 });
      return send(res, 200, { url: `/object/upload/sign/${bucket}/${p.join("/")}?token=${token}` });
    }
    // Liste d'un dossier
    if (req.method === "POST" && rest.startsWith("object/list/")) {
      const [, , bucket] = rest.split("/");
      const { prefix = "", search = "", limit = 100 } = JSON.parse((await readBody(req)).toString() || "{}");
      const dir = prefix ? `${prefix.replace(/\/$/, "")}/` : "";
      const r = await asRole(claims, (c) =>
        c.query("select id, name, created_at, metadata from storage.objects where bucket_id = $1 and name like $2 order by name limit $3", [bucket, `${dir}${search}%`, limit]),
      );
      return send(res, 200, r.rows.filter((o) => !o.name.slice(dir.length).includes("/")).map((o) => ({ id: o.id, name: o.name.slice(dir.length), created_at: o.created_at, updated_at: o.created_at, metadata: o.metadata })));
    }
    // Téléversement
    if (req.method === "POST" && rest.startsWith("object/") && !rest.startsWith("object/sign/")) {
      const [, bucket, ...p] = rest.split("/");
      const name = decodeURIComponent(p.join("/"));
      const body = await readBody(req);
      await asRole(claims, (c) => c.query("insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)", [bucket, name, claims.sub ?? null, { mimetype: req.headers["content-type"], size: body.length }]));
      mkdirSync(path.dirname(fileOf(bucket, name)), { recursive: true });
      writeFileSync(fileOf(bucket, name), body);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: name });
    }
    // Création d'URL signée
    if (req.method === "POST" && rest.startsWith("object/sign/")) {
      const [, , bucket, ...p] = rest.split("/");
      const name = decodeURIComponent(p.join("/"));
      const { expiresIn } = JSON.parse((await readBody(req)).toString() || "{}");
      const rows = await asRole(claims, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      if (!rows.rowCount) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      const token = sign({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + Number(expiresIn ?? 60) });
      return send(res, 200, { signedURL: `/object/sign/${bucket}/${p.join("/")}?token=${token}` });
    }
    // Téléchargement authentifié
    if (req.method === "GET" && rest.startsWith("object/authenticated/")) {
      const [, , bucket, ...p] = rest.split("/");
      const name = decodeURIComponent(p.join("/"));
      const rows = await asRole(claims, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      if (!rows.rowCount || !existsSync(fileOf(bucket, name))) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end(readFileSync(fileOf(bucket, name)));
    }
    // Téléchargement par le client Supabase (GET /object/<bucket>/<chemin>, droits de l'appelant)
    if (req.method === "GET" && rest.startsWith("object/")) {
      const [, bucket, ...p] = rest.split("/");
      const name = decodeURIComponent(p.join("/"));
      const rows = await asRole(claims, (c) => c.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      if (!rows.rowCount || !existsSync(fileOf(bucket, name))) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "content-type": rows.rows[0].metadata?.mimetype ?? "application/octet-stream", ...CORS });
      return res.end(readFileSync(fileOf(bucket, name)));
    }
    // Suppression
    if (req.method === "DELETE" && rest.startsWith("object/")) {
      const [, bucket] = rest.split("/");
      const { prefixes } = JSON.parse((await readBody(req)).toString() || "{}");
      const deleted = [];
      for (const name of prefixes ?? []) {
        const r = await asRole(claims, (c) => c.query("delete from storage.objects where bucket_id = $1 and name = $2 returning name", [bucket, name]));
        if (r.rowCount) { deleted.push({ name }); const f = fileOf(bucket, name); if (existsSync(f)) unlinkSync(f); }
      }
      return send(res, 200, deleted);
    }
  } catch (e) {
    return send(res, 400, { statusCode: "403", error: "Unauthorized", message: e.message });
  }
  return send(res, 404, { error: "unsupported" });
}

function proxy(req, res, port, stripPrefix) {
  const target = req.url.replace(stripPrefix, "") || "/";
  const upstream = http.request({ host: "127.0.0.1", port, path: target, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  upstream.on("error", () => send(res, 502, { error: "upstream_unavailable" }));
  req.pipe(upstream);
}

// Mesure des performances : latence réseau simulée (GATEWAY_DELAY_MS) et compteur d'appels (GET /__stats)
const DELAY = Number(process.env.GATEWAY_DELAY_MS ?? 0);
const stats = { auth: 0, rest: 0, storage: 0 };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/__stats") {
    const out = { ...stats };
    if (url.searchParams.has("reset")) Object.keys(stats).forEach((k) => (stats[k] = 0));
    return send(res, 200, out);
  }
  const kind = url.pathname.startsWith("/auth/v1") ? "auth" : url.pathname.startsWith("/rest/v1") ? "rest" : url.pathname.startsWith("/storage/v1") ? "storage" : null;
  if (kind) stats[kind]++;
  if (DELAY && kind) await new Promise((r) => setTimeout(r, DELAY));
  if (url.pathname.startsWith("/auth/v1")) return proxy(req, res, 9999, /^\/auth\/v1/);
  if (url.pathname.startsWith("/rest/v1")) return proxy(req, res, 3001, /^\/rest\/v1/);
  if (url.pathname.startsWith("/storage/v1")) return storage(req, res, url);
  send(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`gateway sur :${PORT}`));
