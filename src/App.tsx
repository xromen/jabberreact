import {useEffect, useMemo, useRef, useState} from "react";
import {Chat} from "./components/Chat";
import {ContactSidebar} from "./components/ContactSidebar";
import {LoginScreen} from "./components/LoginScreen";
import {ServerRail} from "./components/ServerRail";
import {WelcomeState} from "./components/WelcomeState";
import {ensureContact, presenceRank} from "./lib/contact-utils";
import {clearLogin, saveLogin} from "./lib/credentials";
import {bareJid} from "./lib/jid";
import {mergeContacts, mergeDirectoryContacts} from "./lib/contacts";
import {
    clearAccountHistory,
    exportHistory,
    getMessagePage,
    getMessagesFrom,
    saveMessage,
    saveMessages,
    searchMessages,
} from "./lib/history";
import {parseHistoryBackup, parseSparkTranscript} from "./lib/spark-import";
import type {
    ChatMessage,
    ConnectionState,
    Contact,
    LoginData,
    OwnPresenceState,
    XmppMessageEvent,
} from "./types";
import {xmppConnection} from "./xmpp";

export default function App() {
    const [account, setAccount] = useState("");
    const [connection, setConnection] = useState<ConnectionState>("offline");
    const [ownPresence, setOwnPresence] = useState<OwnPresenceState>("online");
    const [error, setError] = useState("");
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [selected, setSelected] = useState("");
    const [activeGroup, setActiveGroup] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [unread, setUnread] = useState<Record<string, number>>({});
    const [search, setSearch] = useState("");
    const [toast, setToast] = useState("");
    const selectedRef = useRef("");
    const accountRef = useRef("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const loadingOlderRef = useRef(false);

    useEffect(() => {
        selectedRef.current = selected;
        if (selected) {
            setUnread((current) => ({...current, [selected]: 0}));
        }
    }, [selected]);

    useEffect(() => {
        accountRef.current = account;
    }, [account]);

    useEffect(() => {
        const onState = (event: Event) => {
            const detail = (event as CustomEvent<{
                state: ConnectionState;
                account?: string;
                error?: string;
            }>).detail;

            setConnection(detail.state);
            if (detail.account) {
                setAccount(detail.account);
            }
            if (detail.error) {
                setError(detail.error);
            }
        };
        const onRoster = (event: Event) => {
            const roster = (event as CustomEvent<Contact[]>).detail;
            setContacts((current) => mergeContacts(current, roster));
        };
        const onDirectory = (event: Event) => {
            const directory = (event as CustomEvent<Contact[]>).detail;
            setContacts((current) => mergeDirectoryContacts(current, directory));
        };
        const onDirectoryError = (event: Event) => {
            setToast((event as CustomEvent<string>).detail);
        };
        const onPresence = (event: Event) => {
            const presence = (event as CustomEvent<
                Pick<Contact, "jid" | "presence" | "status">
            >).detail;

            setContacts((current) =>
                ensureContact(current, presence.jid).map((contact) =>
                    contact.jid === presence.jid
                        ? {
                            ...contact,
                            ...presence,
                            lastSeen:
                                presence.presence === "offline"
                                    ? Date.now()
                                    : contact.lastSeen,
                        }
                        : contact,
                ),
            );
        };
        const onLastSeen = (event: Event) => {
            const detail = (event as CustomEvent<
                Pick<Contact, "jid" | "lastSeen">
            >).detail;
            setContacts((current) =>
                current.map((contact) =>
                    contact.jid === detail.jid ? {...contact, ...detail} : contact,
                ),
            );
        };
        const onMessage = (event: Event) => {
            const incoming = (event as CustomEvent<XmppMessageEvent>).detail;
            const activeAccount = accountRef.current;
            if (!activeAccount || !incoming.from) {
                return;
            }

            const message: ChatMessage = {
                ...incoming,
                id: `${activeAccount}:${incoming.id || crypto.randomUUID()}`,
                account: activeAccount,
                conversation: incoming.from,
                direction: "incoming",
            };

            void saveMessage(message);
            setContacts((current) => ensureContact(current, incoming.from));
            if (selectedRef.current === incoming.from) {
                setMessages((current) => [...current, message]);
            } else {
                setUnread((current) => ({
                    ...current,
                    [incoming.from]: (current[incoming.from] || 0) + 1,
                }));
            }
            showNotification(incoming.from, incoming.body);
        };
        const onReconnectFailed = () => void logout();

        xmppConnection.addEventListener("state", onState);
        xmppConnection.addEventListener("roster", onRoster);
        xmppConnection.addEventListener("directory", onDirectory);
        xmppConnection.addEventListener("directory-error", onDirectoryError);
        xmppConnection.addEventListener("presence", onPresence);
        xmppConnection.addEventListener("last-seen", onLastSeen);
        xmppConnection.addEventListener("message", onMessage);
        xmppConnection.addEventListener("reconnect-failed", onReconnectFailed);

        return () => {
            xmppConnection.removeEventListener("state", onState);
            xmppConnection.removeEventListener("roster", onRoster);
            xmppConnection.removeEventListener("directory", onDirectory);
            xmppConnection.removeEventListener("directory-error", onDirectoryError);
            xmppConnection.removeEventListener("presence", onPresence);
            xmppConnection.removeEventListener("last-seen", onLastSeen);
            xmppConnection.removeEventListener("message", onMessage);
            xmppConnection.removeEventListener("reconnect-failed", onReconnectFailed);
            void xmppConnection.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!account || !selected) {
            setMessages([]);
            setHasOlderMessages(false);
            return;
        }

        let isCurrent = true;
        loadingOlderRef.current = false;
        setLoadingOlderMessages(true);
        setMessages([]);
        void getMessagePage(account, selected)
            .then((page) => {
                if (isCurrent) {
                    setMessages(page.messages);
                    setHasOlderMessages(page.hasMore);
                }
            })
            .finally(() => {
                if (isCurrent) {
                    setLoadingOlderMessages(false);
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [account, selected]);

    useEffect(() => {
        if (!toast) {
            return;
        }

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
                    (first, second) =>
                        presenceRank(first) - presenceRank(second) ||
                        first.name.localeCompare(second.name),
                ),
        [activeGroup, contacts, search],
    );
    const selectedContact = contacts.find((contact) => contact.jid === selected);

    async function login(
        data: LoginData,
        notifications: boolean,
        mode: "automatic" | "remember" | "temporary",
    ) {
        setError("");
        if (
            notifications &&
            "Notification" in window &&
            Notification.permission === "default"
        ) {
            void Notification.requestPermission();
        }

        try {
            const jid = await xmppConnection.connect(data);
            try {
                localStorage.setItem("jabber:last-server", data.server);
                localStorage.removeItem("jabber:auto-login");
                if (mode === "remember") {
                    await saveLogin(data);
                } else if (mode === "temporary") {
                    await clearLogin();
                }
            } catch (reason) {
                setToast(
                    reason instanceof Error
                        ? `Не удалось сохранить вход: ${reason.message}`
                        : "Не удалось сохранить вход",
                );
            }
            setAccount(jid);
            setOwnPresence("online");
        } catch (reason) {
            if (mode === "automatic") {
                try {
                    await clearLogin();
                } catch {
                    // Ошибка хранилища не должна скрывать причину отказа подключения.
                }
            }
            setConnection("error");
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    }

    async function logout() {
        localStorage.removeItem("jabber:auto-login");
        try {
            await clearLogin();
        } catch (reason) {
            setToast(reason instanceof Error ? reason.message : String(reason));
        }
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

    async function sendMessage(body: string) {
        const text = body.trim();
        if (!text || !selected) {
            return;
        }

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

    async function loadOlderMessages() {
        const activeAccount = account;
        const conversation = selected;
        const before = messages[0]?.timestamp;
        if (
            !account ||
            !selected ||
            !before ||
            !hasOlderMessages ||
            loadingOlderRef.current
        ) {
            return;
        }

        loadingOlderRef.current = true;
        setLoadingOlderMessages(true);
        try {
            const page = await getMessagePage(
                activeAccount,
                conversation,
                before,
            );
            if (
                accountRef.current !== activeAccount ||
                selectedRef.current !== conversation
            ) {
                return;
            }
            setMessages((current) => {
                const loaded = new Set(current.map((message) => message.id));
                return [
                    ...page.messages.filter((message) => !loaded.has(message.id)),
                    ...current,
                ];
            });
            setHasOlderMessages(page.hasMore);
        } finally {
            loadingOlderRef.current = false;
            setLoadingOlderMessages(false);
        }
    }

    function findMessages(query: string) {
        return searchMessages(account, selected, query);
    }

    async function navigateToMessage(message: ChatMessage) {
        const [older, newer] = await Promise.all([
            getMessagePage(account, selected, message.timestamp + 1, 25),
            getMessagesFrom(account, selected, message.timestamp, 25),
        ]);
        const window = [...older.messages, ...newer]
            .filter(
                (candidate, index, all) =>
                    all.findIndex((item) => item.id === candidate.id) === index,
            )
            .sort((first, second) => first.timestamp - second.timestamp);

        setMessages(window);
        setHasOlderMessages(older.hasMore);
    }

    async function navigateToDate(timestamp: number): Promise<string | null> {
        let window = await getMessagesFrom(account, selected, timestamp);
        let target: string | undefined = window[0]?.id;

        if (!window.length) {
            const previous = await getMessagePage(
                account,
                selected,
                timestamp + 24 * 60 * 60 * 1000,
            );
            window = previous.messages;
            target = window.at(-1)?.id;
            setHasOlderMessages(previous.hasMore);
        } else {
            setHasOlderMessages(true);
        }

        setMessages(window);
        return target || null;
    }

    async function importFiles(files: FileList | null) {
        if (!files) {
            return;
        }

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
            if (selected) {
                const page = await getMessagePage(account, selected);
                setMessages(page.messages);
                setHasOlderMessages(page.hasMore);
            }
            setToast(`Импортировано сообщений: ${imported.length}`);
        } catch (reason) {
            setToast(
                reason instanceof Error
                    ? reason.message
                    : "Не удалось импортировать историю",
            );
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }

    async function removeHistory() {
        if (
            !confirm(
                "Удалить всю локальную историю этого аккаунта? Отменить действие будет нельзя.",
            )
        ) {
            return;
        }

        await clearAccountHistory(account);
        setMessages([]);
        setHasOlderMessages(false);
        setToast("Локальная история удалена");
    }

    function addConversation() {
        const value = prompt(
            "Введите полный JID контакта, например anna@example.org",
        )
            ?.trim()
            .toLowerCase();
        if (!value || !value.includes("@")) {
            return;
        }

        const jid = bareJid(value);
        setContacts((current) => ensureContact(current, jid));
        setSelected(jid);
    }

    if (!account) {
        return <LoginScreen state={connection} error={error} onLogin={login}/>;
    }

    return (
        <main className="app-shell">
            <ServerRail
                groups={groups}
                activeGroup={activeGroup}
                contacts={contacts}
                unread={unread}
                onSelectGroup={setActiveGroup}
                onAddConversation={addConversation}
            />
            <ContactSidebar
                account={account}
                connection={connection}
                ownPresence={ownPresence}
                activeGroup={activeGroup}
                contacts={visibleContacts}
                selected={selected}
                unread={unread}
                search={search}
                onSearchChange={setSearch}
                onSelect={setSelected}
                onPresenceChange={changePresence}
                onAddConversation={addConversation}
                onImport={() => fileInputRef.current?.click()}
                onExport={() => void exportHistory(account)}
                onLogout={() => void logout()}
            />
            <section className={`chat-panel ${selected ? "mobile-visible" : ""}`}>
                {selectedContact ? (
                    <Chat
                        contact={selectedContact}
                        messages={messages}
                        account={account}
                        hasOlderMessages={hasOlderMessages}
                        loadingOlderMessages={loadingOlderMessages}
                        onSend={sendMessage}
                        onLoadOlder={loadOlderMessages}
                        onSearch={findMessages}
                        onNavigateToMessage={navigateToMessage}
                        onNavigateToDate={navigateToDate}
                        onBack={() => setSelected("")}
                        onImport={() => fileInputRef.current?.click()}
                        onClear={() => void removeHistory()}
                    />
                ) : (
                    <WelcomeState/>
                )}
            </section>
            <input
                ref={fileInputRef}
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

function showNotification(from: string, body: string) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    const notification = new Notification(from.split("@")[0], {
        body,
        icon: "/favicon.svg",
        tag: from,
    });
    notification.onclick = () => window.focus();
}
