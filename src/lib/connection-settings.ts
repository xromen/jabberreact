import type { LoginData } from '../types'

export function connectionSettings(login: LoginData, config: { defaultHttpPort?: number; defaultHttpPath?: string } = {}) {
  const raw = login.server.trim().replace(/^https?:\/\//i, '')
  const slash = raw.indexOf('/')
  const address = slash === -1 ? raw : raw.slice(0, slash)
  const path = slash === -1 ? '' : raw.slice(slash)
  const httpAddress = address.includes(':') ? address : `${address}:${config.defaultHttpPort ?? 7070}`
  const httpPath = path || config.defaultHttpPath || '/http-bind/'
  const username = login.username.trim()
  const domain = username.includes('@') ? username.slice(username.indexOf('@') + 1) : address.split(':')[0]

  return {
    service: `http://${httpAddress}${httpPath.startsWith('/') ? httpPath : `/${httpPath}`}`,
    jid: username.includes('@') ? username : `${username}@${domain}`,
  }
}
