import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { capabilityUtils } from "@tonesmith/core";
import { printChain, printGroups, printGroup, printType, run } from "../common";

const addCapabilities = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("capabilities [group] [type]")
    .description("browse supported effects, amp models, and other device capabilities")
    .action((groupId?: string, typeId?: string) =>
      run(() => {
        if (!groupId) {
          printGroups(driver.capabilities);
          return;
        }

        const found = capabilityUtils.lookup(driver.capabilities, groupId, typeId);
        switch (found.kind) {
          case "chain": printChain(found.chain); break;
          case "group": printGroup(found.group); break;
          case "type": printType(found.group, found.type); break;
        }
      })
    );
};

export { addCapabilities };
