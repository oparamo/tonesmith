import type { Command } from "commander";
import type { PatchDriver, gx1 } from "@tonesmith/core";
import { patchUtils } from "@tonesmith/core";
import { basename, extname } from "node:path";
import { existsSync } from "node:fs";
import { printPatch } from "./print";
import { printGroups, printGroup, printItem } from "../../common";

const run = (action: () => void): void => {
  try {
    action();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

const configureGx1Commands = (gx1: Command, driver: PatchDriver): void => {
  gx1
    .command("read <file> [ref]")
    .description("display one or all patches from a .tsl file")
    .action((file: string, ref?: string) => run(() => {
      const patchFile = driver.readFile(file);
      console.info(`File: ${file}  |  Set: ${patchFile.name}  |  Device: ${patchFile.device}`);
      const indices = ref !== undefined
        ? [patchUtils.resolvePatchIndex(patchFile.patches, ref)]
        : Array.from({ length: patchFile.patches.length }, (_, index) => index);
      for (const patchIndex of indices) {
        printPatch(patchFile.patches[patchIndex]! as gx1.Patch, patchIndex);
      }
      console.info();
    }));

  gx1
    .command("write <file> <ref> <block> [fields...]")
    .description("update patch fields by dot-path (e.g. amp.gain=72)")
    .action((file: string, ref: string, block: string, fields: string[]) => run(() => {
      const patchFile = driver.readFile(file);
      const idx = patchUtils.resolvePatchIndex(patchFile.patches, ref);
      const patch = patchFile.patches[idx] as unknown as Record<string, unknown>;
      for (const fieldAssignment of fields) {
        const separatorIndex = fieldAssignment.indexOf("=");
        patchUtils.setByPath(patch, `${block}.${fieldAssignment.slice(0, separatorIndex)}`, patchUtils.coerceValue(fieldAssignment.slice(separatorIndex + 1)));
      }
      driver.writeFile(patchFile, file);
      console.info(`Wrote ${file} — patch ${idx} ${block} updated`);
    }));

  gx1
    .command("copy <src> <srcRef> <dst> <dstRef>")
    .description("copy a patch from one .tsl file to another")
    .action((src: string, srcRef: string, dst: string, dstRef: string) => run(() => {
      const srcFile = driver.readFile(src);
      const dstFile = driver.readFile(dst);
      const srcIdx = patchUtils.resolvePatchIndex(srcFile.patches, srcRef);
      const dstIdx = patchUtils.resolvePatchIndex(dstFile.patches, dstRef);
      dstFile.patches[dstIdx] = srcFile.patches[srcIdx]!;
      driver.writeFile(dstFile, dst);
      console.info(`Copied '${srcFile.patches[srcIdx]!.name}' → ${dst} patch ${dstIdx}`);
    }));

  gx1
    .command("new <file> [setName] [nPatches]")
    .description("create a blank .tsl file")
    .action((file: string, setName?: string, patchCountStr?: string) => run(() => {
      if (existsSync(file)) {
        console.error(`${file} already exists — refusing to overwrite`);
        process.exit(1);
      }
      const name = setName ?? basename(file, extname(file));
      const patchCount = patchCountStr !== undefined ? parseInt(patchCountStr, 10) : 1;
      const patchFile = driver.newFile(name, patchCount);
      driver.writeFile(patchFile, file);
      console.info(`Created ${file} — ${patchCount} blank patch(es), set name '${name}'`);
    }));

  gx1
    .command("capabilities [group] [item]")
    .description("browse supported effects, amp models, and other device capabilities")
    .action((groupId?: string, item?: string) => run(() => {
      const caps = driver.capabilities;

      if (!groupId) {
        printGroups(caps);
        return;
      }

      const group = caps.groups.find(capGroup => capGroup.id === groupId.toLowerCase());
      if (!group) {
        throw new Error(
          `Unknown group "${groupId}". Available: ${caps.groups.map(capGroup => capGroup.id).join(", ")}`
        );
      }

      if (!item) {
        printGroup(group);
        return;
      }

      // Match by id (exact, case-insensitive) or by name prefix
      const itemUpper = item.toUpperCase();
      const found =
        group.items.find(capItem => capItem.id.toUpperCase() === itemUpper) ??
        group.items.find(capItem => capItem.name.toUpperCase().startsWith(itemUpper));
      if (!found) {
        throw new Error(
          `Unknown item "${item}" in group "${groupId}". Available: ${group.items.map(capItem => capItem.id).join(", ")}`
        );
      }

      printItem(group, found);
    }));
};

export { configureGx1Commands };
