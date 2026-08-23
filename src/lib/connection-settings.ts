import type { LoginData } from "../types";

type JabberConfig = {
  defaultHttpPort?: number;
  defaultHttpPath?: string;
};

export function connectionSettings(
  login: LoginData,
  config: JabberConfig = {},
) {
  const rawServer = login.server.trim().replace(/^https?:\/\//i, "");
  const pathStart = rawServer.indexOf("/");
  const address =
    pathStart === -1 ? rawServer : rawServer.slice(0, pathStart);
  const configuredPath =
    pathStart === -1 ? "" : rawServer.slice(pathStart);
  const httpAddress = address.includes(":")
    ? address
    : `${address}:${config.defaultHttpPort ?? 7070}`;
    const httpPath = configuredPath || config.defaultHttpPath || '/ws/'
  const username = login.username.trim();
  const domain = username.includes("@")
    ? username.slice(username.indexOf("@") + 1)
    : address.split(":")[0];

  return {
      service: `ws://${httpAddress}${httpPath.startsWith('/') ? httpPath : `/${httpPath}`}`,
    jid: username.includes("@") ? username : `${username}@${domain}`,
  };
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}
