import { z } from "zod";
import { mechSpecSchema } from "./schema";

/** JSON Schema for editors and agents; regenerate with npm run mech:schema. */
export function mechJsonSchema() {
  return {
    ...z.toJSONSchema(mechSpecSchema, { io: "input" }),
    $id: "https://github.com/CigThePig/The-Wild-Above/schemas/mech-spec.schema.json",
    title: "The Wild Above Mech spec",
    description:
      "A Mech design. Generated from src/mechs/schema.ts; see docs/mechs/authoring.md. Cross-field rules (unique part IDs, runSpeed >= walkSpeed) and design checks run in npm run mech:check.",
  };
}
