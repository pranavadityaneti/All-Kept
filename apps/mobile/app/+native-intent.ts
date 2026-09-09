import { shareRoute } from "../lib/incoming-share";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return shareRoute(path);
}
