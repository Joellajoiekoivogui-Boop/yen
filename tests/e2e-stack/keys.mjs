// Génère les clés anon / service_role (JWT HS256) à partir de JWT_SECRET.
import { createHmac } from "node:crypto";
const secret = process.env.JWT_SECRET;
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b({ alg: "HS256", typ: "JWT" }); const pl = b(p); return `${h}.${pl}.${createHmac("sha256", secret).update(`${h}.${pl}`).digest("base64url")}`; };
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
console.log(`ANON_KEY=${sign({ role: "anon", iss: "supabase-local", exp })}`);
console.log(`SERVICE_KEY=${sign({ role: "service_role", iss: "supabase-local", exp })}`);
