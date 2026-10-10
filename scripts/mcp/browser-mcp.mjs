// Starts a browser MCP server for coding agents (see .mcp.json):
//   node scripts/mcp/browser-mcp.mjs playwright [extra @playwright/mcp flags]
//   node scripts/mcp/browser-mcp.mjs devtools   [extra chrome-devtools-mcp flags]
// Both run the pinned devDependency, headless and isolated, on the same
// Chromium the Playwright tests use, with software WebGL so Phaser renders.
// Nothing may be printed to stdout here: it carries the MCP protocol.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
const [kind, ...extra] = process.argv.slice(2);

// Same precedence as playwright.config.ts: explicit override, Playwright's
// pinned build, then the Claude Code cloud image's preinstalled Chromium.
function chromium() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH];
  try {
    candidates.push(require("@playwright/test").chromium.executablePath());
  } catch {
    // Playwright not installed; fall through.
  }
  candidates.push("/opt/pw-browsers/chromium");
  return candidates.find((path) => path && existsSync(path));
}
const webgl = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];
const executable = chromium(),
  output = join(root, "artifacts/mcp");
mkdirSync(output, { recursive: true });

let args;
if (kind === "playwright") {
  const config = join(output, "playwright-mcp.config.json");
  writeFileSync(
    config,
    JSON.stringify(
      {
        browser: {
          browserName: "chromium",
          launchOptions: {
            args: webgl,
            ...(executable && { executablePath: executable }),
          },
          contextOptions: { viewport: { width: 1200, height: 760 } },
        },
      },
      null,
      2,
    ),
  );
  args = [
    join(root, "node_modules/@playwright/mcp/cli.js"),
    "--config",
    config,
    "--headless",
    "--isolated",
    "--no-sandbox",
    "--output-dir",
    output,
    ...extra,
  ];
} else if (kind === "devtools") {
  args = [
    join(
      root,
      "node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
    ),
    "--headless",
    "--isolated",
    "--viewport=1200x760",
    // Off by default here: Google usage statistics and sending trace URLs to CrUX.
    "--usageStatistics=false",
    "--performanceCrux=false",
    ...(executable ? [`--executablePath=${executable}`] : []),
    ...[...webgl, "--no-sandbox"].map((a) => `--chromeArg=${a}`),
    ...extra,
  ];
} else {
  console.error("usage: node scripts/mcp/browser-mcp.mjs playwright|devtools");
  process.exit(2);
}
const child = spawn(process.execPath, args, { stdio: "inherit", cwd: root });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
