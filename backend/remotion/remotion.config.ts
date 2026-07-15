import { Config } from "@remotion/cli";

Config.set({
  // Disable tailwind if not needed
  // The output file should be placed in the render directory
});

export const remotionConfig = {
  // Remotion will look for compositions in this directory
  entryPoint: "./Root.jsx",
};