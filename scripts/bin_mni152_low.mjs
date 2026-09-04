#!/usr/bin/env node
/**
 * Rebuild data/mni152_low_stack.npy from the native High cube.
 * 2× mean bin — same as Source → Load NumPy factor 2 / mean.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseNpy, serializeNpy } from "../src/npy.js";
import { binCountDense } from "../src/volume-prep.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "data/mni152_stack.npy");
const dstPath = join(root, "data/mni152_low_stack.npy");
const npy = parseNpy(readFileSync(srcPath));
const binned = binCountDense(npy.data, npy.shape, 2, "mean");
writeFileSync(dstPath, serializeNpy(binned.data, binned.shape, "<u2"));
process.stdout.write(
  `wrote ${dstPath} shape ${binned.shape.join(" × ")} (${binned.data.length} cells)\n`,
);
