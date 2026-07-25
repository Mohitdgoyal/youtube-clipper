/**
 * End-to-end smoke: create clip → poll status → download.
 * Talks to the Next.js API only (auth secret stays in server env).
 *
 * Usage (servers must already be running):
 *   FRONTEND_URL=http://localhost:3000 bun run smoke:clip
 */

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const YT_URL =
  process.env.SMOKE_YT_URL || "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const START = process.env.SMOKE_START || "00:00:00";
const END = process.env.SMOKE_END || "00:00:03";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 180_000);

function log(step, msg) {
  console.log(`[smoke:${step}] ${msg}`);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log("ping", `GET ${FRONTEND_URL}/api/ping`);
  const pingRes = await fetch(`${FRONTEND_URL}/api/ping`);
  const pingBody = await pingRes.json().catch(() => ({}));
  if (!pingRes.ok || pingBody.success !== true) {
    throw new Error(
      `Ping failed (${pingRes.status}): ${JSON.stringify(pingBody)}. Is backend + frontend up?`
    );
  }
  log("ping", "ok");

  log("create", `POST clip ${YT_URL} ${START}-${END}`);
  const createRes = await fetch(`${FRONTEND_URL}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: YT_URL,
      startTime: START,
      endTime: END,
      subtitles: false,
      formatId: "",
      isBulk: false,
    }),
  });
  const createBody = await createRes.json().catch(() => ({}));
  if (createRes.status !== 202 || !createBody.id) {
    throw new Error(
      `Create failed (${createRes.status}): ${JSON.stringify(createBody)}`
    );
  }
  const id = createBody.id;
  log("create", `job id=${id}`);

  const deadline = Date.now() + TIMEOUT_MS;
  let delay = 1000;
  let last = null;

  while (Date.now() < deadline) {
    const statusRes = await fetch(`${FRONTEND_URL}/api/clip/${id}`);
    last = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      throw new Error(`Status failed (${statusRes.status}): ${JSON.stringify(last)}`);
    }
    log(
      "poll",
      `status=${last.status} stage=${last.stage ?? "-"} progress=${last.progress ?? 0}`
    );
    if (last.status === "ready") break;
    if (last.status === "error") {
      throw new Error(`Job error: ${last.error || "unknown"}`);
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 5000);
  }

  if (!last || last.status !== "ready") {
    throw new Error(`Timed out waiting for ready. Last=${JSON.stringify(last)}`);
  }

  log("download", `GET /api/clip/${id}/download`);
  const dlRes = await fetch(
    `${FRONTEND_URL}/api/clip/${id}/download?filename=smoke-clip.mp4`,
    { redirect: "manual" }
  );
  const loc = dlRes.headers.get("location");
  if (dlRes.status !== 307 && dlRes.status !== 302) {
    const body = await dlRes.text().catch(() => "");
    throw new Error(
      `Download expected redirect, got ${dlRes.status}: ${body.slice(0, 200)}`
    );
  }
  if (!loc) {
    throw new Error("Download redirect missing Location header");
  }
  log("download", `redirect → ${loc.slice(0, 120)}…`);

  const fileRes = await fetch(loc);
  if (!fileRes.ok) {
    throw new Error(`Signed download failed (${fileRes.status})`);
  }
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (buf.byteLength < 1000) {
    throw new Error(`Download too small (${buf.byteLength} bytes)`);
  }
  log("download", `ok bytes=${buf.byteLength}`);
  log("done", "create → poll → download passed");
}

main().catch((err) => {
  console.error(`[smoke:fail] ${err.message || err}`);
  process.exit(1);
});
