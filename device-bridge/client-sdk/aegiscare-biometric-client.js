/**
 * AEGISCARE BIOMETRIC CLIENT SDK
 * ─────────────────────────────────────────────────────────
 * Plain JavaScript browser module.
 * NO bundler required — import directly in React via URL.
 *
 * USAGE IN AEGISCARE FRONTEND (rooms.$id.tsx):
 *
 *   import { BiometricClient } from
 *     'http://localhost:4000/sdk/aegiscare-biometric-client.js'
 *
 *   const client = new BiometricClient({
 *     bridgeUrl:   'ws://localhost:4000/device',
 *     httpBase:    'http://localhost:4000',
 *     workstation: 'WS-RECEPTION-01',
 *     onDecision:  (decision) => { ... },
 *     onError:     (err)      => { ... },
 *   });
 *
 *   await client.connect();
 *
 *   // At check-in:
 *   await client.startVerification({
 *     patientId:   'uuid',
 *     fundType:    'SHIF',
 *     trigger:     'CHECK_IN',
 *     initiatedBy: 'staff-uuid',
 *   });
 *
 *   // Decision arrives in onDecision callback:
 *   // {
 *   //   verdict:      'PROCEED' | 'BLOCKED' | 'OTP_FALLBACK',
 *   //   method:       'BIOMETRIC' | 'OTP' | 'NONE_REQUIRED' | 'NONE',
 *   //   otpNeeded:    boolean,
 *   //   exemptionCode: string | null,
 *   //   reason:       string,
 *   // }
 *
 * THREE TRIGGER POINTS:
 *   CHECK_IN   — patient arrives at reception
 *   SIGN_LOCK  — clinician signs encounter
 *   DISCHARGE  — patient discharge / close visit
 *
 * ─────────────────────────────────────────────────────────
 */

class BiometricClient {
  /**
   * @param {object} options
   * @param {string}   options.bridgeUrl    ws://localhost:4000/device
   * @param {string}   options.httpBase     http://localhost:4000
   * @param {string}   options.workstation  Workstation ID (for logs)
   * @param {function} options.onDecision   Called with decision object
   * @param {function} options.onConnected  Called when WS connects
   * @param {function} options.onError      Called on error
   * @param {function} options.onScanRequested  Called when scan activates
   * @param {number}   [options.reconnectMs=3000] Reconnect delay ms
   */
  constructor({
    bridgeUrl,
    httpBase,
    workstation,
    onDecision,
    onConnected,
    onError,
    onScanRequested,
    reconnectMs = 3000,
  }) {
    this.bridgeUrl        = bridgeUrl    || 'ws://localhost:4000/device';
    this.httpBase         = httpBase     || 'http://localhost:4000';
    this.workstation      = workstation  || 'WS-UNKNOWN';
    this.onDecision       = onDecision       || (() => {});
    this.onConnected      = onConnected      || (() => {});
    this.onError          = onError          || (() => {});
    this.onScanRequested  = onScanRequested  || (() => {});
    this.reconnectMs      = reconnectMs;
    this.ws               = null;
    this.connected        = false;
    this._reconnectTimer  = null;
  }

  /**
   * Connect to the biometric bridge WebSocket.
   * Automatically reconnects on disconnect.
   * @returns {Promise<void>} Resolves when connected.
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.bridgeUrl);

        this.ws.onopen = () => {
          console.log(
            `[BiometricClient] Connected to bridge at ${this.bridgeUrl}`
          );
        };

        this.ws.onmessage = (event) => {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            console.error('[BiometricClient] Non-JSON message:', event.data);
            return;
          }

          switch (msg.type) {

            case 'CONNECTED':
              this.connected = true;
              console.log(
                '[BiometricClient] Bridge ready —',
                msg.workstationId,
                msg.simulate ? '(SIMULATE MODE)' : '(PRODUCTION)'
              );
              this.onConnected(msg);
              resolve();
              break;

            case 'SCAN_REQUESTED':
              console.log(
                '[BiometricClient] Scanner active — patient:',
                msg.patientId
              );
              this.onScanRequested(msg);
              break;

            case 'DECISION':
              console.log(
                '[BiometricClient] Decision received:',
                msg.verdict,
                msg.method
              );
              this.onDecision(msg);
              break;

            case 'PONG':
              // Silently handled
              break;

            case 'ERROR':
              console.error('[BiometricClient] Bridge error:', msg.message);
              this.onError({ type: 'BRIDGE_ERROR', message: msg.message });
              break;

            default:
              console.warn(
                '[BiometricClient] Unknown message type:', msg.type
              );
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          console.warn(
            `[BiometricClient] Disconnected. Reconnecting in ${this.reconnectMs}ms...`
          );
          this._reconnectTimer = setTimeout(
            () => this.connect(),
            this.reconnectMs
          );
        };

        this.ws.onerror = (err) => {
          console.error('[BiometricClient] WebSocket error:', err);
          this.onError({
            type:    'WS_ERROR',
            message: 'Cannot connect to biometric bridge. Is it running?',
          });
          reject(err);
        };

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnect cleanly.
   */
  disconnect() {
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws        = null;
      this.connected = false;
    }
  }

  /**
   * Send a message to the bridge.
   * @param {object} msg
   */
  _send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError({
        type:    'NOT_CONNECTED',
        message: 'Biometric bridge is not connected.',
      });
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Start biometric verification for a patient.
   * Decision arrives via onDecision callback.
   *
   * @param {object} params
   * @param {string} params.patientId
   * @param {string} params.fundType     SHIF|PHF|POMSF|CASH|CORPORATE|FREE
   * @param {string} params.trigger      CHECK_IN|SIGN_LOCK|DISCHARGE
   * @param {string} params.initiatedBy  Staff user UUID
   */
  startVerification({ patientId, fundType, trigger, initiatedBy }) {
    if (!patientId || !fundType || !trigger) {
      this.onError({
        type:    'INVALID_PARAMS',
        message: 'startVerification requires patientId, fundType, trigger.',
      });
      return;
    }
    this._send({
      type: 'START_SCAN',
      patientId,
      fundType,
      trigger,
      initiatedBy,
    });
  }

  /**
   * Submit a physical scan result to the bridge.
   * Used when a real scanner driver provides the result.
   *
   * @param {object} params
   * @param {string} params.patientId
   * @param {string} params.fundType
   * @param {string} params.trigger
   * @param {string} params.initiatedBy
   * @param {string} params.result      SUCCESS|FAILED|NOT_ATTEMPTED
   */
  submitScanResult({ patientId, fundType, trigger, initiatedBy, result }) {
    this._send({
      type: 'SCAN_RESULT',
      patientId,
      fundType,
      trigger,
      initiatedBy,
      result,
    });
  }

  /**
   * Check if bridge is healthy via HTTP.
   * Call this before connecting WS to confirm bridge is running.
   *
   * @returns {Promise<{ healthy: boolean, workstationId: string|null }>}
   */
  async checkHealth() {
    try {
      const res  = await fetch(`${this.httpBase}/health`);
      const data = await res.json();
      return {
        healthy:       data.status === 'READY',
        workstationId: data.workstationId || null,
        data,
      };
    } catch {
      return { healthy: false, workstationId: null, data: null };
    }
  }

  /**
   * Check if a patient has a valid DHA exemption (whitelist).
   *
   * @param {string} patientId
   * @returns {Promise<{ allowed: boolean, code: string|null, reason: string }>}
   */
  async checkWhitelist(patientId) {
    try {
      const res  = await fetch(
        `${this.httpBase}/whitelist/${encodeURIComponent(patientId)}`
      );
      return await res.json();
    } catch (err) {
      return {
        allowed: false,
        code:    null,
        reason:  `Could not reach bridge: ${err.message}`,
      };
    }
  }

  /**
   * Ping the bridge WebSocket.
   */
  ping() {
    this._send({ type: 'PING' });
  }
}

// ── Export for both browser (global) and module systems ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BiometricClient };
} else if (typeof window !== 'undefined') {
  window.BiometricClient = BiometricClient;
}
