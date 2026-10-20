#!/usr/bin/env node

// @group Configuration : Start production with the same binding and access policy as development
require('./scripts/launch-next.cjs').launchNext('start', process.argv[2]);
