const fetchDocument = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "tonesmith-doc-to-md (+https://github.com/oparamo/tonesmith)",
      "Accept": "text/html,application/xhtml+xml,application/pdf",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
};

export { fetchDocument };
