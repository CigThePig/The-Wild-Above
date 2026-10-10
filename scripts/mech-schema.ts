// Writes schemas/mech-spec.schema.json from the Zod mech spec schema.
import { writeFileSync } from "node:fs";
import { format } from "prettier";
import { mechJsonSchema } from "../src/mechs/json-schema";

const path = "schemas/mech-spec.schema.json";
writeFileSync(
  path,
  await format(JSON.stringify(mechJsonSchema()), { parser: "json" }),
);
console.log(`wrote ${path}`);
