function base64ToBytes(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}


// Basic compressor and decompressor
export async function encodeForUrl(text: string): Promise<string> {
  let response = new Response(new Blob([text], { type : 'plain/text' }).stream().pipeThrough(
    new CompressionStream("gzip"),
  ));
  let compressed = await response.bytes();
  return bytesToBase64(compressed).replace(/\+/g, '-')
            .replace(/\//g, '_');
}

export async function decodeFromUrl(text: string): Promise<string> {
  let bytes = base64ToBytes(text.replace(/-/g, '+').replace(/_/g, '/'));
  let decompressed = await new Response(new Blob([bytes], { type: "application/octet-stream" }).stream().pipeThrough(
  new DecompressionStream("gzip"),
)).text();
  return decompressed;
}

const urlParams = new URLSearchParams(window.location.search);

export async function urlGetObject<T extends Object>(name: string): Promise<T | null> {
  if (urlParams.has(name)) {
    return JSON.parse(await decodeFromUrl(urlParams.get(name)))
  }
  else {
    return null
  }
}

export function urlGetString(name: string): string | null {
  return urlParams.get(name)
}

