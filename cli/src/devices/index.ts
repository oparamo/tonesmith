import type { CliDescriptor } from "../types/index.js";
import { gx1Cli } from "./gx1/index.js";

const devices: CliDescriptor[] = [gx1Cli];

export { devices };
