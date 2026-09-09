export function callbackCode(url: string, redirect: string): string {
  const incoming = new URL(url), expected = new URL(redirect);
  if (incoming.protocol !== expected.protocol || incoming.host !== expected.host || incoming.pathname !== expected.pathname) throw new Error("Unexpected sign-in callback.");
  const fragment = new URLSearchParams(incoming.hash.replace(/^#/, ""));
  const error = incoming.searchParams.get("error_description") ?? incoming.searchParams.get("error") ?? fragment.get("error_description") ?? fragment.get("error");
  if (error) throw new Error(error);
  const code = incoming.searchParams.get("code");
  if (!code) throw new Error("Google did not return a sign-in code. Please try again.");
  return code;
}
