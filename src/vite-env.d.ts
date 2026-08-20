/// <reference types="vite/client" />

interface Window {
  __JABBER_CONFIG__?: {
    defaultServer?: string
    defaultHttpPort?: number
    defaultHttpPath?: string
  }
}
