import type { CliDescriptor } from "../../types";
import { configureGx1Commands } from "./command";

const gx1Cli: CliDescriptor = {
  id: "gx1",
  description: "BOSS GX-1",
  configure: configureGx1Commands,
};

export { gx1Cli };
