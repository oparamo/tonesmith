const fetchDocument = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml,application/pdf",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
};

export { fetchDocument };
