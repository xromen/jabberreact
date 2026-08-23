import { initials } from "../lib/display";
import type { Contact } from "../types";

type ServerRailProps = {
  groups: string[];
  activeGroup: string;
  contacts: Contact[];
  unread: Record<string, number>;
  onSelectGroup: (group: string) => void;
  onAddConversation: () => void;
};

export function ServerRail({
  groups,
  activeGroup,
  contacts,
  unread,
  onSelectGroup,
  onAddConversation,
}: ServerRailProps) {
  return (
    <nav className="server-rail" aria-label="Группы контактов">
      <button
        className={`server-button brand-button ${!activeGroup ? "active" : ""}`}
        onClick={() => onSelectGroup("")}
        aria-pressed={!activeGroup}
        title="Все контакты"
      >
        J
      </button>
      <div className="rail-divider" aria-hidden="true" />
      {groups.map((group) => {
        const groupUnread = contacts.reduce(
          (total, contact) =>
            contact.groups.includes(group)
              ? total + (unread[contact.jid] || 0)
              : total,
          0,
        );

        return (
          <button
            key={group}
            className={`server-button ${activeGroup === group ? "active" : ""}`}
            onClick={() => onSelectGroup(group)}
            aria-pressed={activeGroup === group}
            title={group}
          >
            {initials(group)}
            {!!groupUnread && (
              <span className="unread-badge">{groupUnread}</span>
            )}
          </button>
        );
      })}
      <button
        className="server-button add-server"
        onClick={onAddConversation}
        aria-label="Начать беседу"
        title="Начать беседу"
      >
        +
      </button>
    </nav>
  );
}
