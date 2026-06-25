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
  for (const g of caps.groups) {
    const count = g.items.length > 0 ? `${g.items.length} types` : "—";
    console.info(`  ${CYAN}${g.id.padEnd(10)}${RESET}  ${BOLD}${g.name}${RESET}  ${DIM}(${count})${RESET}`);
    console.info(`  ${"".padEnd(10)}  ${g.description}`);
    console.info();
  }
};

/** Print all items in a group, with name, optional models tag, and short description. */
const printGroup = (group: CapabilityGroup): void => {
  console.info(`\n${BOLD}${group.name}${RESET}  ${DIM}[${group.id}]${RESET}`);
  console.info(`${group.description}\n`);

  if (group.params && group.params.length > 0) {
    console.info(`${YELLOW}Block controls:${RESET}`);
    for (const p of group.params) {
      console.info(`  ${p.name.padEnd(14)} ${DIM}${p.range}${RESET}`);
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
    if (item.subtypes && item.subtypes.length > 0) {
      console.info(`    ${DIM}Subtypes: ${item.subtypes.map(s => s.id).join(", ")}${RESET}`);
    }
    console.info();
  }
};

/** Print full detail for a single item — description, models, subtypes, params. */
const printItem = (group: CapabilityGroup, item: CapabilityItem): void => {
  console.info(`\n${BOLD}${item.name}${RESET}  ${DIM}[${group.id} / ${item.id}]${RESET}\n`);
  console.info(item.description);

  if (item.models) {
    console.info(`\n${GREEN}Models:${RESET} ${item.models}`);
  }

  if (item.subtypes && item.subtypes.length > 0) {
    console.info(`\n${YELLOW}Subtypes:${RESET}`);
    for (const sub of item.subtypes) {
      const modelTag = sub.models ? `  ${DIM}[models: ${sub.models}]${RESET}` : "";
      console.info(`  ${CYAN}${sub.id}${RESET}${modelTag}`);
      console.info(`    ${sub.description}`);
    }
  }

  const params = [...(group.params ?? []), ...(item.params ?? [])];
  if (params.length > 0) {
    console.info(`\n${YELLOW}Parameters:${RESET}`);
    for (const p of params) {
      console.info(`  ${p.name.padEnd(14)} ${DIM}${p.range}${RESET}`);
      console.info(`  ${"".padEnd(14)} ${p.description}`);
    }
  }
  console.info();
};

export { printGroups, printGroup, printItem };
