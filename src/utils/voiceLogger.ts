const ENDPOINT = 'https://script.google.com/macros/s/AKfycbx22J1x9cS8GlyDoTB6o8QhuLw2rFXmZvyZ1NlJt7QZrV5AH8OzuzqqmI3-UZxUlQ8S/exec';

interface VoiceLog {
  raw: string;
  matched: string | null;
  confidence: 'exact' | 'close' | 'none';
  distance: number;
  source: 'voice' | 'text';
  category: string;
  confirmed?: string | null;
  ts: string;
}

const queue: VoiceLog[] = [];
let flushing = false;

export function logVoiceResult(entry: Omit<VoiceLog, 'ts'>) {
  if (ENDPOINT.startsWith('__')) return;
  queue.push({ ...entry, ts: new Date().toISOString() });
  flush();
}

async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    console.log('[VoiceLogger] Sending batch of', batch.length, 'logs to', ENDPOINT);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
    });
    console.log('[VoiceLogger] Response:', res.status, res.redirected ? '(redirected)' : '', 'type:', res.type);
    const text = await res.text();
    console.log('[VoiceLogger] Body:', text.slice(0, 300));
  } catch (err) {
    console.warn('[VoiceLogger] Fetch failed:', err);
  } finally {
    flushing = false;
    if (queue.length > 0) flush();
  }
}
