const { readAccessSettings } = require('./access-config.cjs');

// @group Authentication : Standalone deployments must always require configured accounts
delete process.env.EZKAFKA_LOCAL_AUTHORITY;
try { readAccessSettings(process.env); } catch (error) {
  console.error(error.message);
  process.exit(1);
}

// @group Configuration : Execute the Next-generated standalone server after validation
require('../server.js');
