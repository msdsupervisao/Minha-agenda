import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { IsomorphicDRM } from 'edge-tts-universal';

// The library's stream waits only for "open", leaving rejected handshakes pending.
// Own the socket lifecycle so failures and cancellation always close the connection.
export async function synthesizeEdge(voice: string, text: string, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const token = await IsomorphicDRM.generateSecMsGec();
  signal.throwIfAborted();
  const connectionId = randomUUID().replaceAll('-', '');
  const endpoint = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
  const url = `${endpoint}?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connectionId}`;
  const socket = new WebSocket(url, { handshakeTimeout: 3000, headers: IsomorphicDRM.headersWithMuid({
    Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    'Cache-Control': 'no-cache', Pragma: 'no-cache',
  }) });
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
      if (error) reject(error);
      else if (!parts.length) reject(new Error('tts_empty_audio'));
      else resolve(new Uint8Array(Buffer.concat(parts)));
    };
    const abort = () => finish(new Error('tts_timeout'));
    socket.on('error', () => finish(new Error('tts_edge_connection_failed')));
    socket.on('unexpected-response', (_request, response) => {
      if (response.statusCode === 403) {
        try { IsomorphicDRM.handleClientResponseError({ status: 403, headers: response.headers as Record<string, string> }); } catch { /* report the rejected handshake */ }
      }
      response.resume();
      finish(new Error(`tts_edge_http_${response.statusCode}`));
    });
    socket.on('close', () => finish(new Error('tts_edge_connection_closed')));
    socket.on('open', () => {
      if (settled) return;
      const timestamp = new Date().toISOString();
      socket.send(`X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } })}`);
      const escaped = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'><voice name='${escaped(voice)}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escaped(text)}</prosody></voice></speak>`;
      socket.send(`X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`);
    });
    socket.on('message', (data, binary) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (!binary) {
        if (/Path:turn\.end(?:\r\n|$)/.test(bytes.toString())) finish();
        return;
      }
      if (bytes.length < 2) return finish(new Error('tts_invalid_audio'));
      const headerEnd = 2 + bytes.readUInt16BE(0);
      if (headerEnd > bytes.length) return finish(new Error('tts_invalid_audio'));
      if (/Path:audio(?:\r\n|$)/.test(bytes.subarray(2, headerEnd).toString())) parts.push(bytes.subarray(headerEnd));
      if (parts.reduce((size, part) => size + part.length, 0) > 2_000_000) finish(new Error('tts_invalid_audio'));
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
