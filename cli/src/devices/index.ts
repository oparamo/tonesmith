import type { CliDescriptor } from "../types/index";
import { gx1Cli } from "./gx1/index";

const devices: CliDescriptor[] = [gx1Cli];

export { devices };
