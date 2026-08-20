export type ConnectionState = 'offline' | 'connecting' | 'online' | 'error'
export type PresenceState = 'online' | 'away' | 'dnd' | 'offline'
export type OwnPresenceState = 'online' | 'away' | 'dnd' | 'invisible'

export interface Contact {
  jid: string
  name: string
  groups: string[]
  presence: PresenceState
  status?: string
}

export interface ChatMessage {
  id: string
  account: string
  conversation: string
  from: string
  to: string
  body: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  imported?: boolean
}

export interface LoginData {
  username: string
  password: string
  server: string
}

export interface XmppMessageEvent {
  id?: string
  from: string
  to: string
  body: string
  timestamp: number
}
