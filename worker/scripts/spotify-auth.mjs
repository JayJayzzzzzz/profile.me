/**
 * One-off helper: obtain a Spotify refresh token for the worker.
 *
 *   1. Create an app at https://developer.spotify.com/dashboard
 *   2. In its settings add the redirect URI:  http://127.0.0.1:8888/callback
 *   3. Run:
 *        SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/spotify-auth.mjs
 *      (on Windows PowerShell:
 *        $env:SPOTIFY_CLIENT_ID="xxx"; $env:SPOTIFY_CLIENT_SECRET="yyy"; node scripts/spotify-auth.mjs)
 *   4. Open the printed URL, approve, and copy the SPOTIFY_REFRESH_TOKEN it logs.
 *   5. npx wrangler secret put SPOTIFY_REFRESH_TOKEN
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT = "http://127.0.0.1:8888/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.");
  process.exit(1);
}

const state = randomBytes(8).toString("hex");
const authUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: "user-read-recently-played user-read-currently-playing user-top-read",
    redirect_uri: REDIRECT,
    state,
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8888");
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  if (url.searchParams.get("state") !== state) {
    res.writeHead(400).end("state mismatch");
    return;
  }

  const code = url.searchParams.get("code");
  const token = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
    }),
  }).then((r) => r.json());

  res
    .writeHead(200, { "Content-Type": "text/plain" })
    .end("Done — check your terminal. You can close this tab.");

  if (token.refresh_token) {
    console.log("\n  SPOTIFY_REFRESH_TOKEN:\n\n  " + token.refresh_token + "\n");
  } else {
    console.error("\n  No refresh token in response:\n", token, "\n");
  }
  server.close();
});

server.listen(8888, () => {
  console.log("\n  Redirect URI to register in the Spotify app:\n  " + REDIRECT);
  console.log("\n  Now open this URL and approve:\n  " + authUrl + "\n");
});
