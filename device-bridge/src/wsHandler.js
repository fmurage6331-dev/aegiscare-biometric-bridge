/**
 * WEBSOCKET HANDLER
 * ─────────────────────────────────────────────────────────
 * Endpoint: ws://localhost:PORT/device
 *
 * ── MESSAGES CLIENT → BRIDGE ──────────────────────────────
 *
 * { type: 'PING' }
 *   Health check. Bridge replies with PONG.
 *
 * {
 *   type:        'START_SCAN',
 *   patientId:   string,  ← AegisCare UUID
 *   fundType:    string,  ← SHIF|PHF|POMSF|CASH|CORPORATE|FREE
 *   trigger:     string,  ← CHECK_IN|DISCHARGE
 *   initiatedBy: string,  ← staff userId
 * }
 *   Activate the physical scanner for this patient.
 *   In SCANNER_SIMULATE=true mode the bridge auto-resolves
 *   after 2 seconds with scanResult SUCCESS.
 *
 * {
 *   type:        'SCAN_RESULT',
 *   patientId:   string,
 *   fundType:    string,
 *   trigger:     string,
 *   initiatedBy: string,
 *   result:      'SUCCESS'|'FAILED'|'NOT_ATTEMPTED',
 * }
 *   Physical scanner driver posts the actual scan outcome.
 *   Bridge evaluates and replies with DECISION.
 *
 * ── MESSAGES BRIDGE → CLIENT ──────────────────────────────
 *
 * { type: 'CONNECTED', workstationId, message, timestamp }
 *   Sent immediately on connection.
 *
 * { type: 'PONG', timestamp }
 *   Reply to PING.
 *
 * { type: 'SCAN_REQUESTED', workstationId, patientId, trigger, timestamp }
 *   Confirms scanner has been activated.
 *
 * {
 *   type:          'DECISION',
 *   verdict:       'PROCEED'|'BLOCKED'|'OTP_FALLBACK',
 *   method:        'BIOMETRIC'|'OTP'|'NONE_REQUIRED'|'NONE',
 *   otpNeeded:     boolean,
 *   biometricReq:  boolean,
 *   exemptionCode: string|null,
 *   reason:        string,
 *   timestamp:     ISO string,
 *   patientId:     string,
 *   fundType:      string,
 *   trigger:       string,
 *   initiatedBy:   string,
 *   simulated:     boolean (only in simulate mode),
 * }
 *   Final verification decision. Frontend acts on verdict.
 *
 * { type: 'ERROR', message }
 *   Malformed request or internal error.
 */

const { evaluate } = require('./verificationEngine');
const { WORKSTATION_ID, SCANNER_SIMULATE } = require('./config');

function handleWebSocket(ws, req) {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected — ${clientIp}`);

  // ── Send welcome on connect ──────────────────────────────
  ws.send(JSON.stringify({
    type:          'CONNECTED',
    workstationId: WORKSTATION_ID,
    message:       'AegisCare Biometric Bridge ready.',
    simulate:      SCANNER_SIMULATE,
    timestamp:     new Date().toISOString(),
  }));

  // ── Message handler ──────────────────────────────────────
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({
        type:    'ERROR',
        message: 'Invalid JSON. All messages must be valid JSON objects.',
      }));
      return;
    }

    console.log(`[WS] ← ${msg.type}`, JSON.stringify(msg));

    switch (msg.type) {

      // ── PING ───────────────────────────────────────────────
      case 'PING': {
        ws.send(JSON.stringify({
          type:      'PONG',
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      // ── START_SCAN ─────────────────────────────────────────
      case 'START_SCAN': {
        const { patientId, fundType, trigger, initiatedBy } = msg;

        if (!patientId || !fundType || !trigger) {
          ws.send(JSON.stringify({
            type:    'ERROR',
            message: 'START_SCAN requires: patientId, fundType, trigger.',
          }));
          break;
        }

        console.log(
          `[WS] Scan requested — patient:${patientId} ` +
          `fund:${fundType} trigger:${trigger}`
        );

        // Confirm scanner activated
        ws.send(JSON.stringify({
          type:          'SCAN_REQUESTED',
          workstationId: WORKSTATION_ID,
          patientId,
          fundType,
          trigger,
          timestamp:     new Date().toISOString(),
        }));

        // Simulate mode — auto-resolve after 2s
        if (SCANNER_SIMULATE) {
          setTimeout(() => {
            const simulatedResult = 'SUCCESS';
            const decision = evaluate({
              patientId,
              fundType,
              trigger,
              scanResult:  simulatedResult,
              initiatedBy: initiatedBy || 'SYSTEM',
            });
            console.log(`[WS] → DECISION (simulated)`, decision.verdict);
            ws.send(JSON.stringify({
              type:      'DECISION',
              simulated: true,
              ...decision,
            }));
          }, 2000);
        }
        // In production mode the physical scanner driver
        // will send a SCAN_RESULT message after this.
        break;
      }

      // ── SCAN_RESULT ────────────────────────────────────────
      case 'SCAN_RESULT': {
        const { patientId, fundType, trigger, initiatedBy, result } = msg;

        if (!patientId || !fundType || !trigger || !result) {
          ws.send(JSON.stringify({
            type:    'ERROR',
            message:
              'SCAN_RESULT requires: patientId, fundType, ' +
              'trigger, result (SUCCESS|FAILED|NOT_ATTEMPTED).',
          }));
          break;
        }

        const decision = evaluate({
          patientId,
          fundType,
          trigger,
          scanResult:  result,
          initiatedBy: initiatedBy || 'UNKNOWN',
        });

        console.log(`[WS] → DECISION`, decision.verdict);

        ws.send(JSON.stringify({
          type:      'DECISION',
          simulated: false,
          ...decision,
        }));
        break;
      }

      // ── Unknown ────────────────────────────────────────────
      default: {
        ws.send(JSON.stringify({
          type:    'ERROR',
          message: `Unknown message type: ${msg.type}. ` +
                   `Valid types: PING, START_SCAN, SCAN_RESULT.`,
        }));
      }
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected — ${clientIp}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error — ${clientIp}:`, err.message);
  });
}

module.exports = { handleWebSocket };
