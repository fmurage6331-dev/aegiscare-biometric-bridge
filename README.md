# AegisCare Biometric Bridge

Standalone Node.js microservice providing:
- WebSocket endpoint: `ws://localhost:4000/device`
- HTTP endpoint: `GET http://localhost:4000/health`

Enforces SHA biometric (fingerprint) verification at
patient check-in and discharge/close-visit, with
OTP fallback ONLY for DHA-whitelisted exemptions.

## Quick Start
```bash
cd device-bridge
cp .env.example .env
# Edit .env
npm run dev
```
