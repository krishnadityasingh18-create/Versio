#!/usr/bin/env node
// @ts-check
// Blocks downloads of one blob by hash (takedown_blob RPC, service role). Files keep their place in
// every manifest; getDownloadUrls returns url: null, blocked: true for them.
// Run: node --env-file-if-exists=.env.local scripts/takedown.mjs <64-char hex sha256>
// Exit 0 = blocked, 1 = bad input / no such blob / error, 2 = SKIPPED (env missing).
import { createClient } from "@supabase/supabase-js";

const hash = (process.argv[2] ?? "").toLowerCase();
if (!/^[0-9a-f]{64}$/.test(hash)) {
  console.log("usage: node scripts/takedown.mjs <64-char hex sha256>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceKey) {
  console.log("SKIPPED: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data, error } = await admin.rpc("takedown_blob", { p_hash: `\\x${hash}` });
if (error) {
  console.log(`FAIL  ${error.message}`);
  process.exit(1);
}
console.log(data ? `BLOCKED  ${hash}` : `NOT FOUND  no blob with hash ${hash}`);
process.exit(data ? 0 : 1);
