// All configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

// Note: When using the Node.JS APIs, the config file doesn't apply. Instead, pass options directly to the APIs
// However, file:// URLs work with absolute paths, and we can use public dir for serving assets

import { Config } from "@remotion/cli/config";
import path from 'path';
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setVideoImageFormat("jpeg");
Config.overrideWebpackConfig(enableTailwind);

// Serve the jobs folder as public directory for audio files
// When running from remotion directory, use ../jobs to get to backend/jobs
Config.setPublicDir(path.join(process.cwd(), '..', 'jobs'));
