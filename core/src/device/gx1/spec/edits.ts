/**
 * The GX-1's dot-path edit surface. Where a path lands and whether what lands there is storable are
 * questions the catalog answers the same way for every device, so the engine is core's; the GX-1
 * supplies its catalog, and its own builder for re-seeding a block whose type an edit switches.
 */
import { applyEdits as applyCatalogEdits } from "../../../service/specService";
import type { FieldEdit, FieldEdits } from "../../../model";
import { gx1Capabilities } from "../catalog/capabilities";
import type { Patch } from "../model";
import { buildPatch } from "./build";

const applyEdits = (patch: Patch, edits: readonly FieldEdit[]): FieldEdits =>
  applyCatalogEdits({ capabilities: gx1Capabilities, buildPatch }, patch, edits);

export { applyEdits };
