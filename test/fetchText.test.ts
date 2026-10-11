import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DOMAIN_MIN_INTERVAL_MS = "0"; // the local test server is one "site"
process.env.FETCH_RETRY_DELAY_MS = "0";
const { fetchText } = await import("../src/ingest/article.js");

let server: Server;
let base = "";
const hits: Record<string, number> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? "/";
    hits[path] = (hits[path] ?? 0) + 1;
    const n = hits[path]!;
    if (path === "/flaky") return n === 1 ? (res.writeHead(503), res.end("busy")) : (res.writeHead(200), res.end("ok after retry"));
    if (path === "/reset") return n === 1 ? req.socket.destroy() : (res.writeHead(200), res.end("ok after reset"));
    if (path === "/always503") return void (res.writeHead(503), res.end("down"));
    if (path === "/missing") return void (res.writeHead(404), res.end("nope"));
    if (path === "/forbidden") return void (res.writeHead(403), res.end("no"));
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("fetchText", () => {
  it("tries again once when the server answers 503, and returns the second answer", async () => {
    await expect(fetchText(`${base}/flaky`)).resolves.toBe("ok after retry");
    expect(hits["/flaky"]).toBe(2);
  });

  it("tries again once when the connection is dropped", async () => {
    await expect(fetchText(`${base}/reset`)).resolves.toBe("ok after reset");
    expect(hits["/reset"]).toBe(2);
  });

  it("gives up after one retry and reports the status", async () => {
    await expect(fetchText(`${base}/always503`)).rejects.toThrow(/HTTP 503/);
    expect(hits["/always503"]).toBe(2);
  });

  it("does not retry an answer that will not change: 404 and 403", async () => {
    await expect(fetchText(`${base}/missing`)).rejects.toThrow(/HTTP 404/);
    await expect(fetchText(`${base}/forbidden`)).rejects.toThrow(/HTTP 403/);
    expect(hits["/missing"]).toBe(1);
    expect(hits["/forbidden"]).toBe(1);
  });

  it("says why a connection failed, not just that it did", async () => {
    // A port nothing listens on: the reason must name the cause so a failing source can be diagnosed.
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const closedPort = (probe.address() as AddressInfo).port;
    await new Promise((r) => probe.close(r));

    await expect(fetchText(`http://127.0.0.1:${closedPort}/feed`)).rejects.toThrow(/ECONNREFUSED/);
  });
});
