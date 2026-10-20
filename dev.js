#!/usr/bin/env node

// @group Configuration : Start development with an explicit, validated bind address
require('./scripts/launch-next.cjs').launchNext('dev', process.argv[2]);
