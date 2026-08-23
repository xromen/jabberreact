import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { formatDate } from "../lib/display";
import type {
  ConnectionState,
  Contact,
  OwnPresenceState,
} from "../types";

const presenceOptions: Array<{
  value: OwnPresenceState;
  label: string;
}> = [
  { value: "online", label: "В сети" },
  { value: "away", label: "Отошёл" },
  { value: "dnd", label: "Не беспокоить" },
  { value: "invisible", label: "Невидимый" },
];

type ContactSidebarProps = {
  account: string;
  connection: ConnectionState;
  ownPresence: OwnPresenceState;
  activeGroup: string;
  contacts: Contact[];
  selected: string;
  unread: Record<string, number>;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (jid: string) => void;
  onPresenceChange: (presence: OwnPresenceState) => void;
  onAddConversation: () => void;
  onImport: () => void;
  onExport: () => void;
  onLogout: () => void;
};

export function ContactSidebar({
  account,
  connection,
  ownPresence,
  activeGroup,
  contacts,
  selected,
  unread,
  search,
  onSearchChange,
  onSelect,
  onPresenceChange,
  onAddConversation,
  onImport,
  onExport,
  onLogout,
}: ContactSidebarProps) {
  const presenceMenuRef = useRef<HTMLDivElement>(null);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const presence =
    connection === "online" && ownPresence !== "invisible"
      ? ownPresence
      : "offline";
  const presenceLabel = presenceOptions.find(
    (option) => option.value === ownPresence,
  )?.label ?? "В сети";

  useEffect(() => {
    if (!presenceMenuOpen) {
      return;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!presenceMenuRef.current?.contains(event.target as Node)) {
        setPresenceMenuOpen(false);
      }
    };
    const closeOnKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPresenceMenuOpen(false);
      }
    };
    const closeOnWindowBlur = () => setPresenceMenuOpen(false);

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("blur", closeOnWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("blur", closeOnWindowBlur);
    };
  }, [presenceMenuOpen]);

  return (
    <aside className={`contact-sidebar ${selected ? "mobile-hidden" : ""}`}>
      <header className="workspace-header">
        <span className="workspace-title">{activeGroup || "Jabber React"}</span>
        <span
          className={`connection-dot ${connection}`}
          role="status"
          aria-label={connection === "online" ? "Подключено" : "Нет соединения"}
          title={connection === "online" ? "Подключено" : "Нет соединения"}
        />
      </header>
      <div className="search-wrap">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Найти беседу"
          aria-label="Поиск контактов"
        />
      </div>
      <section className="contact-list" aria-label="Контакты">
        <div className="section-title">
          <span>{activeGroup || "Личные сообщения"}</span>
          <button
            onClick={onAddConversation}
            aria-label="Начать беседу"
            title="Начать беседу"
          >
            +
          </button>
        </div>
        {contacts.map((contact) => (
          <button
            key={contact.jid}
            className={`contact-row ${selected === contact.jid ? "selected" : ""}`}
            onClick={() => onSelect(contact.jid)}
            aria-pressed={selected === contact.jid}
          >
            <Avatar name={contact.name} presence={contact.presence} />
            <span className="contact-copy">
              <strong>{contact.name}</strong>
              <small>
                {contact.presence === "offline" && contact.lastSeen !== undefined
                  ? `Последний раз в сети: ${formatDate(contact.lastSeen)}`
                  : contact.status || contact.jid}
              </small>
            </span>
            {!!unread[contact.jid] && (
              <span className="unread-badge">{unread[contact.jid]}</span>
            )}
          </button>
        ))}
        {!contacts.length && (
          <p className="empty-list">
            Контакты появятся после синхронизации с Openfire.
          </p>
        )}
      </section>
      <footer className="account-panel">
        <Avatar name={account} presence={presence} />
        <div className="account-copy">
          <strong>{account.split("@")[0]}</strong>
          <div
            className="presence-control"
            ref={presenceMenuRef}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (nextTarget && !event.currentTarget.contains(nextTarget)) {
                setPresenceMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              className="presence-trigger"
              onClick={() => setPresenceMenuOpen((open) => !open)}
              aria-label={`Ваш статус: ${presenceLabel}`}
              aria-haspopup="listbox"
              aria-expanded={presenceMenuOpen}
            >
              <span className={`status-dot ${ownPresence}`} />
              <span>{presenceLabel}</span>
            </button>
            {presenceMenuOpen && (
              <div
                className="presence-menu"
                role="listbox"
                aria-label="Ваш статус"
              >
                {presenceOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`presence-option ${option.value === "invisible" ? "separated" : ""}`}
                    onClick={() => {
                      onPresenceChange(option.value);
                      setPresenceMenuOpen(false);
                    }}
                    role="option"
                    aria-selected={ownPresence === option.value}
                  >
                    <span className={`status-dot ${option.value}`} />
                    <span>{option.label}</span>
                    {ownPresence === option.value && (
                      <span className="status-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onImport}
          aria-label="Импорт истории Spark"
          title="Импорт истории Spark"
        >
          <Icon name="upload" />
        </button>
        <button
          onClick={onExport}
          aria-label="Резервная копия истории"
          title="Резервная копия истории"
        >
          <Icon name="download" />
        </button>
        <button onClick={onLogout} aria-label="Выйти" title="Выйти">
          <Icon name="logout" />
        </button>
      </footer>
    </aside>
  );
}
