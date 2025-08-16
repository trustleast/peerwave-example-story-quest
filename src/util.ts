export function getToken(): string | null {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const token = hashParams.get("token");
  return token;
}
