#!/usr/bin/env bun
import { run } from "./adapters/cli/cli";

const exit = await run({
  argv: process.argv.slice(2),
  env: process.env,
});
process.exit(exit);
