import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { mergeContacts, mergeDirectoryContacts } from "./lib/contacts";
import {
  clearAccountHistory,
  exportHistory,
  getMessages,
  saveMessage,
  saveMessages,
} from "./lib/history";
import { parseHistoryBackup, parseSparkTranscript } from "./lib/spark-import";
import type {
  ChatMessage,
  ConnectionState,
  Contact,
  LoginData,
  OwnPresenceState,
  XmppMessageEvent,
} from "./types";
import { xmppConnection } from "./xmpp";

const defaultServer =
  window.__JABBER_CONFIG__?.defaultServer ||
  localStorage.getItem("jabber:last-server") ||
  "";
const bare = (jid: string) => jid.split("/")[0].toLowerCase();

export default function App() {
  const [account, setAccount] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("offline");
  const [ownPresence, setOwnPresence] = useState<OwnPresenceState>("online");
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState("");
  const [activeGroup, setActiveGroup] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const selectedRef = useRef("");
  const accountRef = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    selectedRef.current = selected;
    if (selected) setUnread((current) => ({ ...current, [selected]: 0 }));
  }, [selected]);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          state: ConnectionState;
          account?: string;
          error?: string;
        }>
      ).detail;
      setConnection(detail.state);
      if (detail.account) setAccount(detail.account);
      if (detail.error) setError(detail.error);
    };
    const onRoster = (event: Event) => {
      const roster = (event as CustomEvent<Contact[]>).detail;
      console.log(roster);
      setContacts((current) => mergeContacts(current, roster));
    };
    // const onDirectory = (event: Event) => {
    //   const directory = (event as CustomEvent<Contact[]>).detail;
    //   setContacts((current) => mergeDirectoryContacts(current, directory));
    // };
    const onDirectoryError = (event: Event) =>
      setToast((event as CustomEvent<string>).detail);
    const onPresence = (event: Event) => {
      const presence = (
        event as CustomEvent<Pick<Contact, "jid" | "presence" | "status">>
      ).detail;
      setContacts((current) =>
        ensureContact(current, presence.jid).map((contact) =>
          contact.jid === presence.jid ? { ...contact, ...presence } : contact,
        ),
      );
    };
    const onMessage = (event: Event) => {
      const incoming = (event as CustomEvent<XmppMessageEvent>).detail;
      const activeAccount = accountRef.current;
      if (!activeAccount || !incoming.from) return;
      const message: ChatMessage = {
        ...incoming,
        id: `${activeAccount}:${incoming.id || crypto.randomUUID()}`,
        account: activeAccount,
        conversation: incoming.from,
        direction: "incoming",
      };
      void saveMessage(message);
      setContacts((current) => ensureContact(current, incoming.from));
      if (selectedRef.current === incoming.from)
        setMessages((current) => [...current, message]);
      else
        setUnread((current) => ({
          ...current,
          [incoming.from]: (current[incoming.from] || 0) + 1,
        }));
      notify(incoming.from, incoming.body);
    };

    xmppConnection.addEventListener("state", onState);
    xmppConnection.addEventListener("roster", onRoster);
    //xmppConnection.addEventListener("directory", onDirectory);
    xmppConnection.addEventListener("directory-error", onDirectoryError);
    xmppConnection.addEventListener("presence", onPresence);
    xmppConnection.addEventListener("message", onMessage);
    return () => {
      xmppConnection.removeEventListener("state", onState);
      xmppConnection.removeEventListener("roster", onRoster);
      //xmppConnection.removeEventListener("directory", onDirectory);
      xmppConnection.removeEventListener("directory-error", onDirectoryError);
      xmppConnection.removeEventListener("presence", onPresence);
      xmppConnection.removeEventListener("message", onMessage);
      void xmppConnection.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!account || !selected) {
      setMessages([]);
      return;
    }
    let current = true;
    void getMessages(account, selected).then(
      (history) => current && setMessages(history),
    );
    return () => {
      current = false;
    };
  }, [account, selected]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const groups = useMemo(
    () => [...new Set(contacts.flatMap((contact) => contact.groups))].sort(),
    [contacts],
  );
  const visibleContacts = useMemo(
    () =>
      contacts
        .filter(
          (contact) => !activeGroup || contact.groups.includes(activeGroup),
        )
        .filter((contact) =>
          `${contact.name} ${contact.jid}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            presenceRank(a) - presenceRank(b) || a.name.localeCompare(b.name),
        ),
    [activeGroup, contacts, search],
  );
  const selectedContact = contacts.find((contact) => contact.jid === selected);

  async function login(data: LoginData, notifications: boolean) {
    setError("");
    if (
      notifications &&
      "Notification" in window &&
      Notification.permission === "default"
    )
      void Notification.requestPermission();
    try {
      const jid = await xmppConnection.connect(data);
      localStorage.setItem("jabber:last-server", data.server);
      setAccount(jid);
      setOwnPresence("online");
    } catch (reason) {
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function logout() {
    await xmppConnection.disconnect();
    setAccount("");
    setContacts([]);
    setSelected("");
    setMessages([]);
    setConnection("offline");
  }

  function changePresence(next: OwnPresenceState) {
    setOwnPresence(next);
    xmppConnection.setPresence(next);
  }

  async function send(body: string) {
    const text = body.trim();
    if (!text || !selected) return;
    try {
      const id = await xmppConnection.sendMessage(selected, text);
      const message: ChatMessage = {
        id: `${account}:${id}`,
        account,
        conversation: selected,
        from: account,
        to: selected,
        body: text,
        timestamp: Date.now(),
        direction: "outgoing",
      };
      await saveMessage(message);
      setMessages((current) => [...current, message]);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files) return;
    try {
      const imported = (
        await Promise.all(
          [...files].map(async (file) => {
            const text = await file.text();
            return file.name.toLowerCase().endsWith(".json")
              ? parseHistoryBackup(text, account)
              : parseSparkTranscript(text, account);
          }),
        )
      ).flat();
      await saveMessages(imported);
      setContacts((current) =>
        imported.reduce(
          (result, message) => ensureContact(result, message.conversation),
          current,
        ),
      );
      if (selected) setMessages(await getMessages(account, selected));
      setToast(`Импортировано сообщений: ${imported.length}`);
    } catch (reason) {
      setToast(
        reason instanceof Error
          ? reason.message
          : "Не удалось импортировать историю",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeHistory() {
    if (
      !confirm(
        "Удалить всю локальную историю этого аккаунта? Отменить действие будет нельзя.",
      )
    )
      return;
    await clearAccountHistory(account);
    setMessages([]);
    setToast("Локальная история удалена");
  }

  function addConversation() {
    const value = prompt(
      "Введите полный JID контакта, например anna@example.org",
    )
      ?.trim()
      .toLowerCase();
    if (!value || !value.includes("@")) return;
    setContacts((current) => ensureContact(current, bare(value)));
    setSelected(bare(value));
  }

  if (!account)
    return <LoginScreen state={connection} error={error} onLogin={login} />;

  return (
    <main className="app-shell">
      <nav className="server-rail" aria-label="Группы контактов">
        <button
          className={`server-button brand-button ${!activeGroup ? "active" : ""}`}
          onClick={() => setActiveGroup("")}
          title="Все контакты"
        >
          J
        </button>
        <div className="rail-divider" />
        {groups.map((group) => (
          <button
            key={group}
            className={`server-button ${activeGroup === group ? "active" : ""}`}
            onClick={() => setActiveGroup(group)}
            title={group}
          >
            {initials(group)}
            {contacts.some(
              (c) => c.groups.includes(group) && !!unread[c.jid],
            ) && <span className="unread-badge">{1}</span>}
          </button>
        ))}
        <button
          className="server-button add-server"
          onClick={addConversation}
          title="Начать беседу"
        >
          +
        </button>
      </nav>

      <aside className={`contact-sidebar ${selected ? "mobile-hidden" : ""}`}>
        <header className="workspace-header">
          <span className="workspace-title">
            {activeGroup || "Jabber React"}
          </span>
          <span
            className={`connection-dot ${connection}`}
            title={connection === "online" ? "Подключено" : "Нет соединения"}
          />
        </header>
        <div className="search-wrap">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти беседу"
            aria-label="Поиск контактов"
          />
        </div>
        <section className="contact-list" aria-label="Контакты">
          <div className="section-title">
            <span>{activeGroup || "Личные сообщения"}</span>
            <button onClick={addConversation} title="Начать беседу">
              +
            </button>
          </div>
          {visibleContacts.map((contact) => (
            <button
              key={contact.jid}
              className={`contact-row ${selected === contact.jid ? "selected" : ""}`}
              onClick={() => setSelected(contact.jid)}
            >
              <Avatar name={contact.name} presence={contact.presence} />
              <span className="contact-copy">
                <strong>{contact.name}</strong>
                <small>{contact.status || contact.jid}</small>
              </span>
              {!!unread[contact.jid] && (
                <span className="unread-badge">{unread[contact.jid]}</span>
              )}
            </button>
          ))}
          {!visibleContacts.length && (
            <p className="empty-list">
              Контакты появятся после синхронизации с Openfire.
            </p>
          )}
        </section>
        <footer className="account-panel">
          <Avatar
            name={account}
            presence={
              connection === "online" && ownPresence !== "invisible"
                ? ownPresence
                : "offline"
            }
          />
          <span className="account-copy">
            <strong>{account.split("@")[0]}</strong>
            <select
              className="presence-select"
              value={ownPresence}
              onChange={(event) =>
                changePresence(event.target.value as OwnPresenceState)
              }
              aria-label="Ваш статус"
            >
              <option value="online">В сети</option>
              <option value="away">Отошёл</option>
              <option value="dnd">Не беспокоить</option>
              <option value="invisible">Невидимый</option>
            </select>
          </span>
          <button
            onClick={() => fileInput.current?.click()}
            title="Импорт истории Spark"
          >
            ⇧
          </button>
          <button
            onClick={() => void exportHistory(account)}
            title="Резервная копия истории"
          >
            ⇩
          </button>
          <button onClick={() => void logout()} title="Выйти">
            ⏻
          </button>
        </footer>
      </aside>

      <section className={`chat-panel ${selected ? "mobile-visible" : ""}`}>
        {selectedContact ? (
          <Chat
            contact={selectedContact}
            messages={messages}
            account={account}
            onSend={send}
            onBack={() => setSelected("")}
            onImport={() => fileInput.current?.click()}
            onClear={() => void removeHistory()}
          />
        ) : (
          <div className="welcome-state">
            <div className="welcome-mark">J</div>
            <h1>Добро пожаловать в Jabber React</h1>
            <p>
              Выберите контакт слева, чтобы открыть локальную историю и начать
              переписку.
            </p>
          </div>
        )}
      </section>

      <input
        ref={fileInput}
        hidden
        multiple
        type="file"
        accept=".xml,.json,text/xml,application/json"
        onChange={(event) => void importFiles(event.target.files)}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

function LoginScreen({
  state,
  error,
  onLogin,
}: {
  state: ConnectionState;
  error: string;
  onLogin(data: LoginData, notifications: boolean): void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(defaultServer);
  const [notifications, setNotifications] = useState(true);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLogin(
      { username: username.trim(), password, server: server.trim() },
      notifications,
    );
  };

  return (
    <main className="login-page">
      <div className="login-orb orb-one" />
      <div className="login-orb orb-two" />
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">J</div>
        <h1>С возвращением!</h1>
        <p className="login-subtitle">Подключитесь к своему серверу Openfire</p>
        <label>
          Логин <span>*</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="user или user@domain"
            required
          />
        </label>
        <label>
          Пароль <span>*</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Сервер Openfire <span>*</span>
          <input
            value={server}
            onChange={(event) => setServer(event.target.value)}
            placeholder="chat.company.local"
            required
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(event) => setNotifications(event.target.checked)}
          />
          <span>Разрешить уведомления о новых сообщениях</span>
        </label>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button className="login-submit" disabled={state === "connecting"}>
          {state === "connecting" ? "Подключение…" : "Войти"}
        </button>
        <p className="plain-warning">
          <span>HTTP / BOSH</span> Браузер подключается напрямую к Openfire
          через порт 7070 без Node.js-шлюза.
        </p>
      </form>
    </main>
  );
}

function Chat({
  contact,
  messages,
  account,
  onSend,
  onBack,
  onImport,
  onClear,
}: {
  contact: Contact;
  messages: ChatMessage[];
  account: string;
  onSend(body: string): void;
  onBack(): void;
  onImport(): void;
  onClear(): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    inputRef.current?.focus();
  }, [messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <>
      <header className="chat-header">
        <button className="back-button" onClick={onBack} aria-label="Назад">
          ‹
        </button>
        <span className="hash">@</span>
        <strong>{contact.name}</strong>
        <span className="header-status">{contact.status || contact.jid}</span>
        <div className="header-actions">
          <button onClick={onImport} title="Импорт истории Spark">
            ⇧
          </button>
          <button onClick={onClear} title="Удалить локальную историю">
            ⌫
          </button>
        </div>
      </header>
      <div className="message-list">
        {messages.length === 0 && (
          <div className="conversation-start">
            <Avatar name={contact.name} presence={contact.presence} large />
            <h1>{contact.name}</h1>
            <p>
              Начало вашей локальной истории с <strong>{contact.jid}</strong>.
            </p>
          </div>
        )}
        {messages.map((message, index) => {
          const author =
            message.direction === "outgoing" ? account : contact.name;
          const needDivider =
            index === 0 ||
            +getDate(messages[index - 1].timestamp) !==
              +getDate(message.timestamp);
          const compact =
            index > 0 &&
            messages[index - 1].from === message.from &&
            !needDivider;
          //&& message.timestamp - messages[index - 1].timestamp < 5 * 60_000
          return (
            <>
              {needDivider && (
                <div className="day-divider">
                  <span>{formatDividerDate(message.timestamp)}</span>
                </div>
              )}
              <article
                className={`message ${compact ? "compact" : ""}`}
                key={message.id}
              >
                {!compact && (
                  <Avatar
                    name={author}
                    presence={
                      message.direction === "outgoing"
                        ? "online"
                        : contact.presence
                    }
                  />
                )}
                <div className="message-body">
                  {!compact && (
                    <div className="message-meta">
                      <strong>
                        {message.direction === "outgoing"
                          ? account.split("@")[0]
                          : contact.name}
                      </strong>
                      <time>{formatDate(message.timestamp)}</time>
                      {message.imported && (
                        <span className="imported">Spark</span>
                      )}
                    </div>
                  )}
                  <p>{message.body}</p>
                </div>
              </article>
            </>
          );
        })}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={submit}>
        <button type="button" title="Файлы появятся в следующей версии">
          +
        </button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Написать @${contact.name}`}
          aria-label={`Сообщение для ${contact.name}`}
          ref={inputRef}
        />
        <button className="send-button" aria-label="Отправить">
          ➤
        </button>
      </form>
    </>
  );
}

function Avatar({
  name,
  presence,
  large = false,
}: {
  name: string;
  presence: Contact["presence"];
  large?: boolean;
}) {
  return (
    <span
      className={`avatar ${large ? "large" : ""}`}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
      <i className={`presence ${presence}`} />
    </span>
  );
}

function ensureContact(contacts: Contact[], jid: string): Contact[] {
  return contacts.some((contact) => contact.jid === jid)
    ? contacts
    : [
        ...contacts,
        { jid, name: jid.split("@")[0], groups: [], presence: "offline" },
      ];
}

function notify(from: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  const notification = new Notification(from.split("@")[0], {
    body,
    icon: "/favicon.svg",
    tag: from,
  });
  notification.onclick = () => window.focus();
}

function presenceRank(contact: Contact) {
  return contact.presence === "online"
    ? 0
    : contact.presence === "away"
      ? 1
      : contact.presence === "dnd"
        ? 2
        : 3;
}
function initials(value: string) {
  return (
    value.substring(0, 2) ||
    // .split(/[\s._-]+/)
    // .filter(Boolean)
    // .slice(0, 2)
    // .map((part) => part[0])
    // .join("")
    // .toUpperCase()
    "?"
  );
}
function avatarColor(value: string) {
  const colors = [
    "#5865f2",
    "#3ba55c",
    "#eb459e",
    "#faa61a",
    "#ed4245",
    "#00a8fc",
  ];
  return colors[
    [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
      colors.length
  ];
}
function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
function formatDividerDate(timestamp: number) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(timestamp);
}
function getDate(timestamp: number) {
  let date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}
