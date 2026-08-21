#!/usr/bin/env node

import { buildManifestQuery } from "./catalog.mjs";

process.stdout.write(buildManifestQuery());
