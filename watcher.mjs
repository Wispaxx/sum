import fs from "node:fs/promises";
import crypto from "node:crypto";

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const ANNOUNCE_STARTUP = process.env.ANNOUNCE_STARTUP === "true";
const STATE_FILE = process.env.STATE_FILE || "state.json";

const TARGETS = [
  { id: "windows-player", label: "Roblox Player Windows", binary: "WindowsPlayer" },

  // Optional future/canary channel. It only works if Roblox exposes the channel publicly.
  // { id: "windows-player-zcanary", label: "Roblox Player Windows zcanary", binary: "WindowsPlayer", channel: "zcanary" }
];

if (!WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK_URL environment variable.");
}

function versionUrl(target) {
  const base = `https://clientsettingscdn.roblox.com/v2/client-version/${target.binary}`;
  return target.channel ? `${base}/channel/${encodeURIComponent(target.channel)}` : base;
}

function manifestUrl(guid, channel) {
  const prefix = channel ? `/channel/${encodeURIComponent(channel)}` : "";
  return `https://setup.rbxcdn.com${prefix}/${guid}-rbxPkgManifest.txt`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "RobloxUpdateWatcher/1.0" }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }

  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveState(state) {
  await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function getManifestInfo(guid, channel) {
  const url = manifestUrl(guid, channel);
  const text = await fetchText(url);
  const lines = text.split(/\r?\n/).filter(Boolean);

  const packages = [];
  const start = lines[0]?.startsWith("v") ? 1 : 0;

  for (let i = start; i + 3 < lines.length; i += 4) {
    packages.push({
      file: lines[i],
      md5: lines[i + 1],
      compressedSize: Number(lines[i + 2]),
      decompressedSize: Number(lines[i + 3])
    });
  }

  return {
    url,
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
    packageCount: packages.length,
    totalCompressedSize: packages.reduce((sum, pkg) => sum + (pkg.compressedSize || 0), 0),
    firstPackageMd5: packages[0]?.md5 || "unknown"
  };
}

async function sendDiscord(payload) {
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      allowed_mentions: { parse: [] }
    })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${await response.text()}`);
  }
}

function formatBrusselsDate() {
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date());
}

function buildEmbed({ version }) {
  return {
    title: "A Roblox update has been detected!",
    description: "This is a live update, Roblox exploits are patched.",
    color: 0xff3b30,
    fields: [
      { name: "Hash:", value: `\`${version.clientVersionUpload}\`` },
      { name: "Date:", value: formatBrusselsDate() }
    ],
    timestamp: new Date().toISOString()
  };
}

async function checkTarget(target, previous) {
  const version = await fetchJson(versionUrl(target));
  const guid = version.clientVersionUpload;

  if (!guid) {
    throw new Error(`No clientVersionUpload in response for ${target.label}.`);
  }

  const changed = previous?.guid && previous.guid !== guid;
  const shouldAnnounceStartup = ANNOUNCE_STARTUP;

  if (!changed && !shouldAnnounceStartup) {
    return {
      changed: false,
      state: previous || { guid, version: version.version }
    };
  }

  await sendDiscord({
    username: "Roblox Update Watcher",
    embeds: [
      buildEmbed({
        version
      })
    ]
  });

  return {
    changed: true,
    state: {
      guid,
      version: version.version,
      updatedAt: new Date().toISOString()
    }
  };
}

async function main() {
  const state = await loadState();
  let stateChanged = false;

  for (const target of TARGETS) {
    try {
      const previousState = JSON.stringify(state[target.id] || null);
      const result = await checkTarget(target, state[target.id]);
      state[target.id] = result.state;
      stateChanged ||= result.changed || JSON.stringify(result.state) !== previousState;
    } catch (error) {
      console.error(`[${target.label}] ${error.message}`);
    }
  }

  if (stateChanged) {
    await saveState(state);
  }
}

await main();
