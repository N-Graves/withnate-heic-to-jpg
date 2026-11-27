// Disables each guard in src/plan.ts in turn and confirms the tests go red.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FILE = new URL("../src/plan.ts", import.meta.url);
const original = readFileSync(FILE, "utf8");

const probes = [
  ["byte limit", "bytes > MAX_FILE_BYTES", "false"],
  ["megapixel ceiling", "megapixels(s) > MAX_MEGAPIXELS", "false"],
  ["ftyp must be present", `ascii(header, 4, 4) !== "ftyp"`, "false"],
  ["short headers refused", "header.length < 16 ||", ""],
  ["compatible brands read", "for (let i = 16; i + 4 <= end; i += 4)", "for (let i = 16; i < 0; i += 4)"],
  ["brands only inside the box", "Math.min(header.length, boxSize >= 16 ? boxSize : 16)", "header.length"],
  ["only HEIF brands", "(HEIF_BRANDS as readonly string[]).includes(b)", "b.length === 4"],
  ["JPG is matted", `f === "jpeg";`, "false;"],
  ["quality clamped", "Math.min(100, Math.max(50, Math.round(slider)))", "Math.round(slider)"],
  ["bad quality falls back", "if (!Number.isFinite(slider)) return 0.92;", ""],
];

let bad = 0;
try {
  for (const [name, from, to] of probes) {
    const n = original.split(from).length - 1;
    if (n !== 1) throw new Error(`${name}: anchor matched ${n} times`);
    writeFileSync(FILE, original.replace(from, to));
    let red = false;
    try {
      execSync("npx vitest run", { stdio: "ignore", timeout: 120000 });
    } catch {
      red = true;
    }
    console.log(`${red ? "red  " : "GREEN"}  ${name}`);
    if (!red) bad++;
  }
} finally {
  writeFileSync(FILE, original);
}
if (bad) {
  console.error(`${bad} guard(s) not covered`);
  process.exit(1);
}
console.log("every guard is covered");
