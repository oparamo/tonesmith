export const fetchPage = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
};
