import { readFile, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const paths = execFileSync(
  "npm",
  ["ls", "--omit=dev", "--parseable", "--all"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .slice(1);
let text =
  "# Third-party notices\n\nGenerated from installed production dependencies. This does not license the project itself.\n";
for (const path of [...new Set(paths)].sort()) {
  const pkg = JSON.parse(await readFile(`${path}/package.json`, "utf8"));
  text += `\n## ${pkg.name} ${pkg.version}\n\nDeclared license: ${pkg.license ?? "see upstream"}\n\n`;
  for (const name of (await readdir(path)).filter((n) =>
    /^(licen[sc]e|copying|notice)(\.|$)/i.test(n),
  )) {
    try {
      text += `### ${name}\n\n\`\`\`text\n${await readFile(`${path}/${name}`, "utf8")}\n\`\`\`\n`;
    } catch {
      /* Some packages use a LICENSE directory. */
    }
  }
}
await writeFile("docs/third-party-notices.md", text);
