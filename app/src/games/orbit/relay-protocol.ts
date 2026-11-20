export const ORBIT_REPORT_EVENT = 'orbit.xr.report.v1';
export interface EncryptedReport { version: 1; iv: string; data: string; }
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
export const newPairingKey = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export const normalizeKey = (key: string) => key.replace(/[\s-]/g, '').toLowerCase();
const text = (value: unknown, length = 200) => typeof value === 'string' ? value.slice(0, length) : null;

// Only diagnostic fields cross the relay, never pose matrices or room coordinates.
export function safeReport(raw: string): string {
  if (raw.length > 16384) throw new Error('Report is too large');
  const input = JSON.parse(raw);
  if (!input || input.report !== 'Orbit XR diagnostics v1') throw new Error('Not an Orbit report');
  const environment = input.environment || {}, attempt = input.attempt;
  const strings = (value: unknown) => Array.isArray(value) ? value.slice(0, 8).map(item => text(item, 64)) : null;
  const sample: Record<string, unknown> = {};
  for (const key of ['sources', 'validHands', 'validShapeHands', 'nearbyHands', 'pinchedHands', 'armedHands',
    'missingJoints', 'emulatedJoints', 'invalidJoints', 'failedJoints']) {
    const value = attempt?.handSample?.[key];
    if (Number.isInteger(value) && value >= 0 && value <= 100) sample[key] = value;
  }
  if (typeof attempt?.handSample?.grabbing === 'boolean') sample.grabbing = attempt.handSample.grabbing;
  const result = {
    report: 'Orbit XR diagnostics v1',
    environment: {
      buildVersion: text(environment.buildVersion), userAgent: text(environment.userAgent, 512),
      secureContext: environment.secureContext === true, webXR: environment.webXR === true,
      webGL: text(environment.webGL, 32)
    },
    attempt: attempt ? {
      mode: text(attempt.mode, 32), profile: text(attempt.profile, 64), state: text(attempt.state, 64),
      requestedFeatures: strings(attempt.requestedFeatures), enabledFeatures: strings(attempt.enabledFeatures),
      referenceSpace: text(attempt.referenceSpace, 32), environmentBlendMode: text(attempt.environmentBlendMode, 32),
      firstFrameRendered: attempt.firstFrameRendered === true,
      handJointPoseAPI: typeof attempt.handJointPoseAPI === 'boolean' ? attempt.handJointPoseAPI : null,
      inputs: Array.isArray(attempt.inputs) ? attempt.inputs.slice(0, 8).map((entry: any) => ({
        handedness: text(entry?.handedness, 16), targetRayMode: text(entry?.targetRayMode, 32),
        handInputAvailable: entry?.handInputAvailable === true, controllerAvailable: entry?.controllerAvailable === true
      })) : [],
      handSample: attempt.handSample ? sample : null
    } : null,
    events: Array.isArray(input.events) ? input.events.slice(-24).map((entry: any) => ({
      event: text(entry?.event, 64), detail: text(entry?.detail)
    })) : []
  };
  return JSON.stringify(result, null, 2);
}

export async function createReportCodec(pairingKey: string) {
  const normalized = normalizeKey(pairingKey);
  if (!/^[a-f0-9]{32}$/.test(normalized)) throw new Error('Use a 32-character pairing key');
  const bytes = new Uint8Array(normalized.match(/../g)!.map(value => parseInt(value, 16)));
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const base64 = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)));
  const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  return {
    room: 'orbit-xr-' + hex(digest.slice(0, 16)),
    async seal(report: string, source: string, sequence: number): Promise<EncryptedReport> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plain = JSON.stringify({ report: safeReport(report), source, sequence, sentAt: Date.now() });
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
      return { version: 1, iv: base64(iv), data: base64(encrypted) };
    },
    async open(value: EncryptedReport) {
      if (!value || value.version !== 1 || typeof value.iv !== 'string' || value.iv.length > 32 ||
          typeof value.data !== 'string' || value.data.length > 30000) throw new Error('Invalid encrypted report');
      const iv = decode(value.iv);
      if (iv.length !== 12) throw new Error('Invalid nonce');
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, decode(value.data));
      const result = JSON.parse(new TextDecoder().decode(decrypted));
      if (typeof result.source !== 'string' || result.source.length > 64 ||
          !Number.isSafeInteger(result.sequence) || result.sequence < 0 ||
          !Number.isFinite(result.sentAt)) throw new Error('Invalid report envelope');
      return { report: safeReport(result.report), source: result.source as string,
        sequence: result.sequence as number, sentAt: result.sentAt as number };
    }
  };
}
