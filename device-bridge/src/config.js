require('dotenv').config();

module.exports = {
  PORT:                process.env.PORT || 4000,
  WORKSTATION_ID:      process.env.WORKSTATION_ID || 'WS-UNKNOWN-01',
  AEGISCARE_API_URL:   process.env.AEGISCARE_API_URL,
  AEGISCARE_SERVICE_KEY: process.env.AEGISCARE_SERVICE_KEY,
  SCANNER_SIMULATE:    process.env.SCANNER_SIMULATE === 'true',
};
