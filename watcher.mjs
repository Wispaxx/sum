import fs from "node:fs/promises";

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const ANNOUNCE_STARTUP = process.env.ANNOUNCE_STARTUP === "true";
const STATE_FILE = process.env.STATE_FILE || "state.json";

const LIVE_TARGET = {
  id: "windows-player",
  label: "Roblox Player Windows",
  binary: "WindowsPlayer"
};

const FUTURE_TARGETS = [
  {
    id: "windows-player-zcanary",
    label: "Roblox Player Windows zcanary",
    binary: "WindowsPlayer",
    channel: "zcanary"
  },
  {
    id: "windows-player-zintegration",
    label: "Roblox Player Windows zintegration",
    binary: "WindowsPlayer",
    channel: "zintegration"
  }
];

if (!WEBHOOK_URL) {
  throw new Error("Missing DISCORD_WEBHOOK_URL environment variable.");
}

function versionUrl(target) {
  const base = `https://clientsettingscdn.roblox.com/v2/client-version/${target.binary}`;
  return target.channel ? `${base}/channel/${encodeURIComponent(target.channel)}` : base;
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

function formatHash(guid) {
  return guid ? `\`${guid}\`` : "Unknown";
}

function buildLiveUpdateEmbed(guid) {
  return {
    title: "A Roblox update has been detected!",
    description: "This is a live update, Roblox exploits are patched.",
    color: 0xff3b30,
    fields: [
      { name: "Hash:", value: formatHash(guid) },
      { name: "Date:", value: formatBrusselsDate() }
    ],
    timestamp: new Date().toISOString()
  };
}

function buildFutureUpdateEmbed(guid) {
  return {
    title: "A future Roblox update has been detected!",
    description: "This is a future update, no need to worry about Roblox exploits being patched yet.",
    color: 0xffcc00,
    fields: [
      { name: "Hash:", value: formatHash(guid) },
      { name: "Date:", value: formatBrusselsDate() }
    ],
    timestamp: new Date().toISOString()
  };
}

async function findFutureVersion(liveGuid) {
  for (const target of FUTURE_TARGETS) {
    try {
      const version = await fetchJson(versionUrl(target));
      const guid = version.clientVersionUpload || null;

      if (guid && guid !== liveGuid) {
        return { target, version, guid };
      }
    } catch (error) {
      console.error(`[${target.label}] ${error.message}`);
    }
  }

  return null;
}

async function main() {
  const state = await loadState();
  let stateChanged = false;

  const liveVersion = await fetchJson(versionUrl(LIVE_TARGET));
  const liveGuid = liveVersion.clientVersionUpload;

  if (!liveGuid) {
    throw new Error("No clientVersionUpload in live Roblox response.");
  }

  const previousLive = state[LIVE_TARGET.id];
  const liveChanged = previousLive?.guid && previousLive.guid !== liveGuid;

  if (ANNOUNCE_STARTUP || liveChanged) {
    await sendDiscord({
      username: "Roblox Update Watcher",
      embeds: [buildLiveUpdateEmbed(liveGuid)]
    });
  }

  const nextLive = { guid: liveGuid, version: liveVersion.version };
  stateChanged ||= JSON.stringify(previousLive || null) !== JSON.stringify(nextLive);
  state[LIVE_TARGET.id] = nextLive;

  const future = await findFutureVersion(liveGuid);
  const previousFuture = state["future-update"];

  if (future) {
    const nextFuture = {
      guid: future.guid,
      version: future.version.version,
      channel: future.target.channel
    };

    if (ANNOUNCE_STARTUP || previousFuture?.guid !== future.guid) {
      await sendDiscord({
        username: "Roblox Update Watcher",
        embeds: [buildFutureUpdateEmbed(future.guid)]
      });
    }

    stateChanged ||= JSON.stringify(previousFuture || null) !== JSON.stringify(nextFuture);
    state["future-update"] = nextFuture;
  } else {
    const nextFuture = { guid: null, status: "unknown" };

    if (ANNOUNCE_STARTUP) {
      await sendDiscord({
        username: "Roblox Update Watcher",
        embeds: [buildFutureUpdateEmbed(null)]
      });
    }

    stateChanged ||= JSON.stringify(previousFuture || null) !== JSON.stringify(nextFuture);
    state["future-update"] = nextFuture;
  }

  if (stateChanged) {
    await saveState(state);
  }
}

await main();
