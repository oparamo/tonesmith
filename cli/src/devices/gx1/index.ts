import type { gx1 } from "@tonesmith/core";
import { cliDevice } from "../../common";
import { printPatch } from "./print";

const gx1Cli = cliDevice<gx1.Patch>("gx1", printPatch);

export { gx1Cli };
