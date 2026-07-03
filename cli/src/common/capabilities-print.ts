import type { DeviceCapabilities, CapabilityGroup, CapabilityItem } from "@tonesmith/core";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const CYAN   = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";

/** Print a summary table of all groups (id, name, item count). */
const printGroups = (caps: DeviceCapabilities): void => {
  console.info(`\n${BOLD}Capability groups${RESET}\n`);
  for (const group of caps.groups) {
    const count = group.items.length > 0 ? `${group.items.length} types` : "—";
    console.info(`  ${CYAN}${group.id.padEnd(10)}${RESET}  ${BOLD}${group.name}${RESET}  ${DIM}(${count})${RESET}`);
    console.info(`  ${"".padEnd(10)}  ${group.description}`);
    console.info();
  }
};

/** Print all items in a group, with name, optional models tag, and short description. */
const printGroup = (group: CapabilityGroup): void => {
  console.info(`\n${BOLD}${group.name}${RESET}  ${DIM}[${group.id}]${RESET}`);
  console.info(`${group.description}\n`);

  if (group.params && group.params.length > 0) {
    console.info(`${YELLOW}Block controls:${RESET}`);
    for (const param of group.params) {
      console.info(`  ${param.name.padEnd(14)} ${DIM}${param.range}${RESET}`);
    }
    console.info();
  }

  if (group.items.length === 0) {
    console.info(`${DIM}(no selectable types for this block)${RESET}`);
    return;
  }

  console.info(`${YELLOW}Types:${RESET}`);
  for (const item of group.items) {
    const modelTag = item.models ? `  ${DIM}[models: ${item.models}]${RESET}` : "";
    console.info(`  ${CYAN}${item.id}${RESET}${modelTag}`);
    console.info(`    ${item.description}`);
    if (item.subTypes && item.subTypes.length > 0) {
      console.info(`    ${DIM}Subtypes: ${item.subTypes.map(subType => subType.id).join(", ")}${RESET}`);
    }
    console.info();
  }
};

/** Print full detail for a single item — description, models, subTypes, params. */
const printItem = (group: CapabilityGroup, item: CapabilityItem): void => {
  console.info(`\n${BOLD}${item.name}${RESET}  ${DIM}[${group.id} / ${item.id}]${RESET}\n`);
  console.info(item.description);

  if (item.models) {
    console.info(`\n${GREEN}Models:${RESET} ${item.models}`);
  }

  if (item.subTypes && item.subTypes.length > 0) {
    console.info(`\n${YELLOW}Subtypes:${RESET}`);
    for (const subType of item.subTypes) {
      const modelTag = subType.models ? `  ${DIM}[models: ${subType.models}]${RESET}` : "";
      console.info(`  ${CYAN}${subType.id}${RESET}${modelTag}`);
      console.info(`    ${subType.description}`);
    }
  }

  const params = [...(group.params ?? []), ...(item.params ?? [])];
  if (params.length > 0) {
    console.info(`\n${YELLOW}Parameters:${RESET}`);
    for (const param of params) {
      console.info(`  ${param.name.padEnd(14)} ${DIM}${param.range}${RESET}`);
      console.info(`  ${"".padEnd(14)} ${param.description}`);
    }
  }
  console.info();
};

export { printGroups, printGroup, printItem };
