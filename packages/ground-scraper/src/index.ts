#!/usr/bin/env bun
import { run } from "./cli";

const exit = await run({
  argv: process.argv.slice(2),
  stdout: (l) => process.stdout.write(`${l}\n`),
  stderr: (l) => process.stderr.write(`${l}\n`),
});
process.exit(exit);
