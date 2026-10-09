// Arabic.IImgage game server. No extra packages needed.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const page = fs.readFileSync(path.join(__dirname, "index.html"));
const rooms = new Map(); // room name -> Map(peer id -> { presence, res })
const OK = /^[a-z0-9._-]{1,48}$/;

function broadcast(name) {
  const room = rooms.get(name);
  if (!room) return;
  const list = [...room.entries()].map(([peer, v]) => ({ peer, presence: v.presence }));
  const data = "data: " + JSON.stringify(list) + "\n\n";
  for (const v of room.values()) v.res.write(data);
}

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const name = u.searchParams.get("room") || "";
  const id = u.searchParams.get("id") || "";

  if (u.pathname === "/ev") {
    if (!OK.test(name) || !OK.test(id)) { res.writeHead(400); return res.end(); }
    if (!rooms.has(name) && rooms.size >= 500) { res.writeHead(503); return res.end(); }
    const room = rooms.get(name) || new Map();
    if (room.size >= 20 && !room.has(id)) { res.writeHead(503); return res.end(); }
    rooms.set(name, room);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const old = room.get(id);
    room.set(id, { presence: old ? old.presence : {}, res });
    const beat = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => {
      clearInterval(beat);
      const cur = rooms.get(name);
      if (cur && cur.get(id) && cur.get(id).res === res) {
        cur.delete(id);
        if (cur.size === 0) rooms.delete(name); else broadcast(name);
      }
    });
    return broadcast(name);
  }

  if (u.pathname === "/pr" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 32000) req.destroy(); });
    req.on("end", () => {
      const room = rooms.get(name);
      const peer = room && room.get(id);
      if (!peer) { res.writeHead(404); return res.end(); }
      try {
        const patch = JSON.parse(body);
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw 0;
        const next = { ...peer.presence };
        for (const k of Object.keys(patch)) {
          if (patch[k] === null) delete next[k]; else next[k] = patch[k];
        }
        if (JSON.stringify(next).length > 16000) throw 0;
        peer.presence = next;
      } catch (e) { res.writeHead(400); return res.end(); }
      broadcast(name);
      res.writeHead(204); res.end();
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page);
}).listen(PORT, () => console.log("Game running on port " + PORT));
