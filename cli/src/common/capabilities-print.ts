import type { DeviceCapabilities, CapabilityGroup, CapabilityItem, ChainSpec } from "@tonesmith/core";

// Redirected into a file or piped into another command, an escape sequence is literal garbage in
// the destination rather than color, so ask the same two questions every colored CLI asks.
const colored = process.stdout.isTTY && !process.env.NO_COLOR;
const sgr = (code: string): string => (colored ? `\x1b[${code}m` : "");

const RESET  = sgr("0");
const BOLD   = sgr("1");
const DIM    = sgr("2");
const CYAN   = sgr("36");
const YELLOW = sgr("33");
const GREEN  = sgr("32");

/** Print the device's signal-chain model: default order, plus how ordering and bypass work. */
const printChain = (chain: ChainSpec): void => {
  console.info(`\n${BOLD}Signal chain${RESET}  ${DIM}[chain]${RESET}\n`);
  console.info(`${YELLOW}Default order:${RESET} ${chain.defaultOrder.join(" → ")}\n`);
  console.info(chain.description);
  console.info();
};

/** Print a summary table of all groups (id, name, item count), led by a chain pointer. */
const printGroups = (caps: DeviceCapabilities): void => {
  console.info(`\n${BOLD}Capability groups${RESET}\n`);
  console.info(`  ${CYAN}${"chain".padEnd(10)}${RESET}  ${BOLD}Signal Chain${RESET}  ${DIM}(block order + bypass)${RESET}`);
  console.info(`  ${"".padEnd(10)}  Default: ${caps.chain.defaultOrder.join(" → ")}  ${DIM}(run \`capabilities chain\` for details)${RESET}`);
  console.info();
  for (const group of caps.groups) {
    const count = group.items.length > 0 ? `${group.items.length} types` : "no types";
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

const printGroupItems = (items: CapabilityGroup["items"]): void => {
  console.info(`${YELLOW}Types:${RESET}`);
  for (const item of items) {
    const modelTag = item.models ? `  ${DIM}[models: ${item.models}]${RESET}` : "";
    console.info(`  ${CYAN}${item.id}${RESET}${modelTag}`);
    console.info(`    ${item.description}`);
    if (item.subTypes && item.subTypes.length > 0) {
      const subTypeIds = item.subTypes.map(subType => subType.id).join(", ");
      console.info(`    ${DIM}Subtypes: ${subTypeIds}${RESET}`);
    }
    console.info();
  }
};

/** Print all items in a group, with name, optional models tag, and short description. */
const printGroup = (group: CapabilityGroup): void => {
  console.info(`\n${BOLD}${group.name}${RESET}  ${DIM}[${group.id}]${RESET}`);
  console.info(`${group.description}\n`);

  printBlockControls(group.params);

  if (group.items.length === 0) {
    console.info(`${DIM}(no selectable types for this block)${RESET}`);
    printExample(group.example);
    return;
  }

  printGroupItems(group.items);
};

// Most subtypes are pure model variants with no params of their own. FX-slot DELAY is the
// exception, since each sub-algorithm carries a distinct param set, so print those inline.
const printSubTypeParams = (params: CapabilityItem["params"]): void => {
  if (!params || params.length === 0) return;
  for (const param of params) {
    console.info(`      ${param.name.padEnd(12)} ${DIM}${param.range}${RESET}`);
  }
};

const printItemSubTypes = (subTypes: CapabilityItem["subTypes"]): void => {
  if (!subTypes || subTypes.length === 0) return;
  console.info(`\n${YELLOW}Subtypes:${RESET}`);
  for (const subType of subTypes) {
    const modelTag = subType.models ? `  ${DIM}[models: ${subType.models}]${RESET}` : "";
    console.info(`  ${CYAN}${subType.id}${RESET}${modelTag}`);
    console.info(`    ${subType.description}`);
    printSubTypeParams(subType.params);
  }
};

const printItemParams = (params: CapabilityItem["params"]): void => {
  if (!params || params.length === 0) return;
  console.info(`\n${YELLOW}Parameters:${RESET}`);
  for (const param of params) {
    // `key` is the name this param answers to in `write` dot-paths, and `range` is only a summary
    // for lookup params. Without both, the printed param can't actually be set from the CLI.
    const keyTag = param.key ? `  ${GREEN}${param.key}${RESET}` : "";
    console.info(`  ${param.name.padEnd(14)} ${DIM}${param.range}${RESET}${keyTag}`);
    console.info(`  ${"".padEnd(14)} ${param.description}`);
    if (param.kind === "discrete") {
      console.info(`  ${"".padEnd(14)} ${DIM}Values: ${param.values.join(", ")}${RESET}`);
    }
  }
};

/**
 * Print the block's spec at factory defaults. It is what an agent copies into a generate call, and
 * for a person reading the terminal it is the one place the block's own key and nesting are shown
 * rather than left to be inferred from the param list above.
 */
const printExample = (example: CapabilityItem["example"]): void => {
  if (!example) return;
  console.info(`\n${YELLOW}Spec at factory defaults:${RESET}`);
  console.info(JSON.stringify(example, null, 2));
};

/** Print full detail for a single item: description, models, subTypes, params. */
const printItem = (group: CapabilityGroup, item: CapabilityItem): void => {
  console.info(`\n${BOLD}${item.name}${RESET}  ${DIM}[${group.id} / ${item.id}]${RESET}\n`);
  console.info(item.description);

  if (item.models) {
    console.info(`\n${GREEN}Models:${RESET} ${item.models}`);
  }

  printItemSubTypes(item.subTypes);

  const params = [...(group.params ?? []), ...(item.params ?? [])];
  printItemParams(params);
  printExample(item.example);

  console.info();
};

export { printChain, printGroups, printGroup, printItem };
