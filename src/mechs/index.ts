import { parseMechSpec, type MechSpec } from "./schema";
import { paletteHex } from "./palette";
import standard from "./specs/standard.json" with { type: "json" };

// Registered Mech designs. Add a spec file under ./specs and list it here.
// Tooling (npm run look/mech:check, rigLab.previewMech) can register drafts
// at runtime without editing this list.
const registry = new Map<string, MechSpec>();
export const STANDARD_ID = "standard";

/** Validate and register a spec; replacing a registered ID must be explicit. */
export function registerMech(value: unknown, replace = false): MechSpec {
  const spec = parseMechSpec(value);
  if (registry.has(spec.id) && !replace)
    throw Error(`Mech "${spec.id}" is already registered`);
  registry.set(spec.id, spec);
  return spec;
}
for (const spec of [standard]) registerMech(spec);

export const hasMech = (id: string) => registry.has(id);
export function getMech(id: string = STANDARD_ID): MechSpec {
  const spec = registry.get(id);
  if (!spec) throw Error(`Unknown mech "${id}"`);
  return spec;
}
export const listMechs = () => [...registry.values()];
export const STANDARD = getMech(STANDARD_ID);

/** Select a Mech in a config, applying its default paint. */
export function configForMech<T extends { mech?: string; color: string }>(
  config: T,
  id: string,
): T {
  return { ...config, mech: id, color: paletteHex(getMech(id).paint) };
}
export type { MechSpec };
