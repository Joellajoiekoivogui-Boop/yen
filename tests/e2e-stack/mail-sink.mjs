/**
 * Boîte aux lettres de test (pile locale uniquement) : remplace Resend pendant les tests.
 * - SMTP sur 127.0.0.1:54325 : GoTrue y dépose ses e-mails (aucun envoi réel, rien ne sort).
 * - HTTP sur 127.0.0.1:54326 :
 *     GET /messages?to=adresse  → e-mails reçus pour cette adresse (texte décodé), du plus ancien au plus récent ;
 *     GET /templates/<nom>.html → modèles d'e-mail du dépôt (supabase/templates), lus par GoTrue.
 */
import http from "node:http";
import net from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SMTP_PORT = Number(process.env.MAIL_SINK_SMTP_PORT ?? 54325);
const HTTP_PORT = Number(process.env.MAIL_SINK_HTTP_PORT ?? 54326);
const messages = [];

function decodeQuotedPrintable(s) {
  return Buffer.from(
    s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
    "latin1",
  ).toString("utf8");
}

/** Corps lisible d'un message MIME simple ou multipart (quoted-printable ou base64). */
function decodeBody(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const body = rest.join("\n\n");
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(head)?.[1];
  if (boundary) return body.split(`--${boundary}`).slice(1, -1).map((part) => decodeBody(part.replace(/^\r?\n/, ""))).join("\n");
  const encoding = /content-transfer-encoding:\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
  if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  return body;
}

function header(raw, name) {
  const value = new RegExp(`^${name}:\\s*(.+)$`, "im").exec(raw.split(/\r?\n\r?\n/)[0])?.[1] ?? "";
  // sujet encodé (=?UTF-8?B?...?= ou =?UTF-8?Q?...?=)
  return value.replace(/=\?utf-8\?([bq])\?([^?]+)\?=/gi, (_, enc, text) =>
    enc.toLowerCase() === "b" ? Buffer.from(text, "base64").toString("utf8") : decodeQuotedPrintable(text.replace(/_/g, " ")),
  );
}

net
  .createServer((socket) => {
    let buffer = "";
    let inData = false;
    let rcpt = [];
    const reply = (line) => socket.write(`${line}\r\n`);
    reply("220 boite-de-test ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      while (true) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const raw = Buffer.from(buffer.slice(0, end), "latin1").toString("latin1").replace(/^\.\./gm, ".");
          buffer = buffer.slice(end + 5);
          inData = false;
          const text = decodeBody(raw).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
          for (const to of rcpt) messages.push({ to: to.toLowerCase(), subject: header(raw, "Subject"), text, receivedAt: new Date().toISOString() });
          rcpt = [];
          reply("250 OK");
          continue;
        }
        const eol = buffer.indexOf("\r\n");
        if (eol < 0) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") reply("250 boite-de-test");
        else if (cmd === "MAIL") reply("250 OK");
        else if (cmd === "RCPT") {
          rcpt.push(/<([^>]+)>/.exec(line)?.[1] ?? "");
          reply("250 OK");
        } else if (cmd === "DATA") {
          inData = true;
          reply("354 Fin par <CRLF>.<CRLF>");
        } else if (cmd === "QUIT") {
          reply("221 Au revoir");
          socket.end();
        } else reply("250 OK");
      }
    });
    socket.on("error", () => {});
  })
  .listen(SMTP_PORT, "127.0.0.1");

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/messages") {
      const to = (url.searchParams.get("to") ?? "").toLowerCase();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(messages.filter((m) => !to || m.to === to)));
    }
    const template = /^\/templates\/([a-z-]+\.html)$/.exec(url.pathname)?.[1];
    if (template) {
      try {
        const html = readFileSync(path.join(ROOT, "supabase/templates", template));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      } catch {
        /* modèle absent */
      }
    }
    res.writeHead(404).end();
  })
  .listen(HTTP_PORT, "127.0.0.1");

console.log(`Boîte de test : SMTP ${SMTP_PORT}, HTTP ${HTTP_PORT}`);
