import type { DeviceCapabilities, CapabilityGroup, CapabilityType, ParamSpec } from "@tonesmith/core";
import { BOLD, CYAN, DIM, GREEN, RESET, YELLOW } from "./color";

/**
 * Print the settings the patch carries itself. They belong to no group, so the chain view is where
 * a reader meets them: a device with a reference tempo has nowhere else to say so.
 */
const printPatchSettings = (settings: ParamSpec[]): void => {
  if (settings.length === 0) return;
  console.info(`${YELLOW}Patch settings:${RESET}`);
  for (const setting of settings) {
    const keyTag = setting.key ? `  ${GREEN}${setting.key}${RESET}` : "";
    console.info(`  ${setting.name.padEnd(14)} ${DIM}${setting.range}${RESET}${keyTag}`);
  }
  console.info();
};

/** Print the device's signal-chain model: default order, plus how ordering and bypass work. */
const printChain = (caps: DeviceCapabilities): void => {
  console.info(`\n${BOLD}Signal chain${RESET}  ${DIM}[chain]${RESET}\n`);
  console.info(`${YELLOW}Default order:${RESET} ${caps.chain.defaultOrder.join(" → ")}\n`);
  console.info(caps.chain.description);
  console.info();
  printPatchSettings(caps.patchSettings);
};

/** Print a summary table of all groups (id, name, type count), led by a chain pointer. */
const printGroups = (caps: DeviceCapabilities): void => {
  console.info(`\n${BOLD}Capability groups${RESET}\n`);
  console.info(`  ${CYAN}${"chain".padEnd(10)}${RESET}  ${BOLD}Signal Chain${RESET}  ${DIM}(block order + bypass)${RESET}`);
  console.info(`  ${"".padEnd(10)}  Default: ${caps.chain.defaultOrder.join(" → ")}  ${DIM}(run \`capabilities chain\` for details)${RESET}`);
  console.info();
  for (const group of caps.groups) {
    const count = group.types.length > 0 ? `${group.types.length} types` : "no types";
    console.info(`  ${CYAN}${group.id.padEnd(10)}${RESET}  ${BOLD}${group.name}${RESET}  ${DIM}(${count})${RESET}`);
    console.info(`  ${"".padEnd(10)}  ${group.description}`);
    console.info();
  }
};

const printBlockControls = (params: CapabilityGroup["params"]): void => {
  if (!params || params.length === 0) return;
  console.info(`${YELLOW}Block controls:${RESET}`);
  for (const param of params) {
    console.info(`  ${param.name.padEnd(14)} ${DIM}${param.range}${RESET}`);
  }
  console.info();
};

const printGroupTypes = (types: CapabilityGroup["types"]): void => {
  console.info(`${YELLOW}Types:${RESET}`);
  for (const capType of types) {
    const modelTag = capType.models ? `  ${DIM}[models: ${capType.models}]${RESET}` : "";
    console.info(`  ${CYAN}${capType.id}${RESET}${modelTag}`);
    console.info(`    ${capType.description}`);
    if (capType.subTypes && capType.subTypes.length > 0) {
      const subTypeIds = capType.subTypes.map(subType => subType.id).join(", ");
      console.info(`    ${DIM}Subtypes: ${subTypeIds}${RESET}`);
    }
    console.info();
  }
};

/** Print every type in a group, with name, optional models tag, and short description. */
const printGroup = (group: CapabilityGroup): void => {
  console.info(`\n${BOLD}${group.name}${RESET}  ${DIM}[${group.id}]${RESET}`);
  console.info(`${group.description}\n`);

  printBlockControls(group.params);

  if (group.types.length === 0) {
    console.info(`${DIM}(no selectable types for this block)${RESET}`);
    printExample(group.example);
    return;
  }

  printGroupTypes(group.types);
};

// Most subtypes are pure model variants and carry no params. Where one does carry its own set,
// picking that subtype is what puts those params in reach, so they belong under it rather than in
// the type's shared list.
const printSubTypeParams = (params: CapabilityType["params"]): void => {
  if (!params || params.length === 0) return;
  for (const param of params) {
    console.info(`      ${param.name.padEnd(12)} ${DIM}${param.range}${RESET}`);
  }
};

const printTypeSubTypes = (subTypes: CapabilityType["subTypes"]): void => {
  if (!subTypes || subTypes.length === 0) return;
  console.info(`\n${YELLOW}Subtypes:${RESET}`);
  for (const subType of subTypes) {
    const modelTag = subType.models ? `  ${DIM}[models: ${subType.models}]${RESET}` : "";
    console.info(`  ${CYAN}${subType.id}${RESET}${modelTag}`);
    console.info(`    ${subType.description}`);
    printSubTypeParams(subType.params);
  }
};

const printTypeParams = (params: CapabilityType["params"]): void => {
  if (!params || params.length === 0) return;
  console.info(`\n${YELLOW}Parameters:${RESET}`);
  for (const param of params) {
    // `key` is the name this param answers to in `write` dot-paths, and `range` is only a summary
    // for lookup params. Without both, the printed param can't actually be set from the CLI.
    const keyTag = param.key ? `  ${GREEN}${param.key}${RESET}` : "";
    console.info(`  ${param.name.padEnd(14)} ${DIM}${param.range}${RESET}${keyTag}`);
    console.info(`  ${"".padEnd(14)} ${param.description}`);
    // A param that takes named values gets them listed whether or not it also takes a number:
    // `range` summarizes the list, and the exact spelling is what a write has to match.
    if (param.kind === "discrete" || param.kind === "numericOrNamed") {
      console.info(`  ${"".padEnd(14)} ${DIM}Values: ${param.values.join(", ")}${RESET}`);
    }
  }
};

/**
 * Print the block's spec at factory defaults. It is what an agent copies into a generate call, and
 * for a person reading the terminal it is the one place the block's own key and nesting are shown
 * rather than left to be inferred from the param list above.
 */
const printExample = (example: CapabilityType["example"]): void => {
  if (!example) return;
  console.info(`\n${YELLOW}Spec at factory defaults:${RESET}`);
  console.info(JSON.stringify(example, null, 2));
};

/** Print full detail for a single type: description, models, subTypes, params. */
const printType = (group: CapabilityGroup, capType: CapabilityType): void => {
  console.info(`\n${BOLD}${capType.name}${RESET}  ${DIM}[${group.id} / ${capType.id}]${RESET}\n`);
  console.info(capType.description);

  if (capType.models) {
    console.info(`\n${GREEN}Models:${RESET} ${capType.models}`);
  }

  printTypeSubTypes(capType.subTypes);

  const params = [...(group.params ?? []), ...(capType.params ?? [])];
  printTypeParams(params);
  printExample(capType.example);

  console.info();
};

export { printChain, printGroups, printGroup, printType };
