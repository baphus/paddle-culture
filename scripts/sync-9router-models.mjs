#!/usr/bin/env node
/**
 * Syncs 9router models from the gateway API into opencode.json.
 * Run: node scripts/sync-9router-models.mjs
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Windows: APPDATA points to roaming; opencode stores config at HOME/.config/opencode/opencode.json
const HOME = process.env.HOME || process.env.USERPROFILE || "";
const TARGET = path.join(HOME, ".config", "opencode", "opencode.json");

const API_KEY = "sk-54491ce9a6841ee9-4wikug-d8483cc6";

function fetchModels() {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(API_KEY).toString("base64");
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 20128,
        path: "/v1/models",
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function loadJson(filepath) {
  const raw = fs.readFileSync(filepath, "utf8");
  return JSON.parse(raw);
}

function saveJson(filepath, obj) {
  fs.writeFileSync(filepath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function inferModelDef(id, name) {
  // 9router gateway rejects "thinking" field — do NOT set reasoning:true
  const isVision = /vision|image|multimodal|glm|gemini/.test(name) || id.includes("vision");
  if (id.includes("combo")) {
    return {
      name,
      attachment: true,
      tool_call: true,
      limit: { context: 1048576, output: 131072, input: 1048576 },
    };
  }
  return {
    name,
    attachment: isVision,
    tool_call: true,
    limit: { context: 128000, output: 64000, input: 128000 },
  };
}

async function main() {
  const config = loadJson(TARGET);
  const existing = config.provider?.["9router"]?.models || {};
  const existingIds = new Set(Object.keys(existing));

  let apiModels;
  try {
    const resp = await fetchModels();
    apiModels = resp.data?.models || resp.models || [];
  } catch (e) {
    console.error("Failed to fetch 9router models:", e.message);
    process.exit(1);
  }

  let changed = false;
  for (const model of apiModels) {
    const id = typeof model === "string" ? model : model.id;
    const name = typeof model === "string" ? model : (model.name || id);
    if (!existingIds.has(id)) {
      existing[id] = inferModelDef(id, name);
      changed = true;
      console.log(`  + added: ${id}`);
    }
  }

  if (!changed) {
    console.log("No new models to add.");
    return;
  }

  if (!config.provider) config.provider = {};
  if (!config.provider["9router"])
    config.provider["9router"] = { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://127.0.0.1:20128/v1", apiKey: API_KEY }, models: {} };
  config.provider["9router"].models = existing;

  saveJson(TARGET, config);
  console.log(`Wrote ${TARGET}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
