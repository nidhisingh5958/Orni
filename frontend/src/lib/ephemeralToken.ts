export async function fetchEphemeralToken(): Promise<string> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
  const response = await fetch(`${backendUrl}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ephemeral token: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error('No token returned from backend');
  }

  return data.token;
}
