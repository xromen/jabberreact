import { $iq, $msg, $pres, Strophe } from "strophe.js";
import { connectionSettings } from "./lib/connection-settings";
import { bareJid } from "./lib/jid";
import type {
  Contact,
  LoginData,
  OwnPresenceState,
  XmppMessageEvent,
} from "./types";

type StropheConnection = InstanceType<typeof Strophe.Connection>;

class XmppConnection extends EventTarget {
  private connection?: StropheConnection;
  private account = "";

  async connect(login: LoginData): Promise<string> {
    await this.disconnect();

    const settings = connectionSettings(login, window.__JABBER_CONFIG__);
    this.emit("state", { state: "connecting" });

    const connection = new Strophe.Connection(settings.service);
    connection.maxRetries = 5;
    this.connection = connection;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        this.emit("state", { state: "error", error: message });
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };

      connection.connect(settings.jid, login.password, (status, condition) => {
        if (this.connection !== connection) {
          return;
        }

        if (
          status === Strophe.Status.CONNECTING ||
          status === Strophe.Status.AUTHENTICATING
        ) {
          this.emit("state", { state: "connecting" });
          return;
        }
        if (
          status === Strophe.Status.CONNECTED ||
          status === Strophe.Status.ATTACHED
        ) {
          const account = this.handleConnected(
            connection,
            settings.jid,
            login.server,
          );
          if (!settled) {
            settled = true;
            resolve(account);
          }
          return;
        }
        if (status === Strophe.Status.AUTHFAIL) {
          fail("Неверный логин или пароль");
          return;
        }
        if (status === Strophe.Status.CONNTIMEOUT) {
          fail("Сервер не ответил вовремя");
          return;
        }
        if (
          status === Strophe.Status.CONNFAIL ||
          status === Strophe.Status.ERROR
        ) {
          fail(readableCondition(condition));
          return;
        }
        if (status === Strophe.Status.DISCONNECTED) {
          this.emit("state", { state: "offline" });
          if (!settled) {
            fail("Соединение с Openfire закрыто");
          }
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    const activeConnection = this.connection;
    this.connection = undefined;

    if (activeConnection) {
      activeConnection.disconnect("Выход из Jabber React");
    }
  }

  async sendMessage(to: string, body: string): Promise<string> {
    if (!this.connection?.connected) {
      throw new Error("Нет соединения с сервером");
    }

    const id = this.connection.getUniqueId("message");
    this.connection.send($msg({ to, type: "chat", id }).c("body").t(body));
    return id;
  }

  setPresence(presence: OwnPresenceState): void {
    if (!this.connection?.connected) {
      return;
    }
    if (presence === "invisible") {
      this.connection.send(
        $pres({ type: "unavailable" }).c("status").t("Невидимый режим"),
      );
      return;
    }

    const stanza = $pres();
    if (presence !== "online") {
      stanza.c("show").t(presence);
    }
    this.connection.send(stanza);
  }

  private handleConnected(
    connection: StropheConnection,
    configuredJid: string,
    server: string,
  ): string {
    this.account = bareJid(connection.jid);
    this.registerHandlers(connection);
    this.emit("state", { state: "online", account: this.account });
    this.setPresence("online");
    connection.sendIQ(
      $iq({ type: "get" }).c("query", { xmlns: Strophe.NS.ROSTER }),
      (stanza) => this.onRoster(stanza),
    );

    const domain =
      Strophe.getDomainFromJid(connection.jid) ||
      Strophe.getDomainFromJid(configuredJid) ||
      server;
    this.loadServerUsers(connection, domain);

    return this.account;
  }

  private registerHandlers(connection: StropheConnection): void {
    connection.addHandler(
      (stanza) => this.onMessage(stanza),
      null,
      "message",
      null,
    );
    connection.addHandler(
      (stanza) => this.onPresence(stanza),
      null,
      "presence",
      null,
    );
    connection.addHandler(
      (stanza) => {
        this.onRoster(stanza);
        this.confirmRosterUpdate(connection, stanza);
        return true;
      },
      Strophe.NS.ROSTER,
      "iq",
      "set",
    );
  }

  private confirmRosterUpdate(connection: StropheConnection, stanza: Element): void {
    const attributes: Record<string, string> = { type: "result" };
    const id = stanza.getAttribute("id");
    const from = stanza.getAttribute("from");

    if (id) {
      attributes.id = id;
    }
    if (from) {
      attributes.to = from;
    }
    connection.send($iq(attributes));
  }

  private onRoster(stanza: Element): void {
    const contacts: Contact[] = [...stanza.getElementsByTagName("item")]
      .filter((item) => item.getAttribute("subscription") !== "remove")
      .map((item) => {
        const jid = item.getAttribute("jid") || "";

        return {
          jid: bareJid(jid),
          name: item.getAttribute("name") || jid.split("@")[0],
          groups: [...item.getElementsByTagName("group")]
            .map((group) => group.textContent || "")
            .filter(Boolean),
          presence: "offline",
        };
      });

    this.emit("roster", contacts);
  }

  private loadServerUsers(connection: StropheConnection, domain: string): void {
    const fallbackService = `search.${domain}`;

    connection.sendIQ(
      $iq({ type: "get", to: domain }).c("query", {
        xmlns: Strophe.NS.DISCO_ITEMS,
      }),
      (stanza) => {
        const searchService =
          [...stanza.getElementsByTagName("item")]
            .find((item) =>
              /search/i.test(
                `${item.getAttribute("jid")} ${item.getAttribute("name")}`,
              ),
            )
            ?.getAttribute("jid") || fallbackService;

        this.searchServerUsers(connection, searchService);
      },
      () => this.searchServerUsers(connection, fallbackService),
    );
  }

  private searchServerUsers(
    connection: StropheConnection,
    service: string,
  ): void {
    const query = $iq({ type: "set", to: service })
      .c("query", { xmlns: "jabber:iq:search" })
      .c("x", { xmlns: "jabber:x:data", type: "submit" })
      .c("field", { var: "FORM_TYPE", type: "hidden" })
      .c("value")
      .t("jabber:iq:search")
      .up()
      .up()
      .c("field", { var: "search" })
      .c("value")
      .t("*")
      .up()
      .up();

    for (const field of ["Username", "Name", "Email"]) {
      query.c("field", { var: field }).c("value").t("1").up().up();
    }

    connection.sendIQ(
      query,
      (stanza) => this.onServerUsers(stanza),
      () =>
        this.emit(
          "directory-error",
          "Список всех пользователей недоступен. Проверьте Search Plugin в Openfire.",
        ),
    );
  }

  private onServerUsers(stanza: Element): void {
    const contacts = [...stanza.getElementsByTagName("item")]
      .map((item): Contact | null => {
        const jid = bareJid(
          item.getAttribute("jid") || searchField(item, "jid"),
        );
        if (!jid || jid === this.account) {
          return null;
        }

        const name =
          searchField(item, "Name", "name", "nick", "Username", "username") ||
          jid.split("@")[0];
        return { jid, name, groups: [], presence: "offline" };
      })
      .filter((contact): contact is Contact => contact !== null);

    this.emit("directory", contacts);
  }

  private onPresence(stanza: Element): boolean {
    const from = bareJid(stanza.getAttribute("from") || "");
    if (!from || from === this.account) {
      return true;
    }

    const show = stanza.getElementsByTagName("show")[0]?.textContent;
    const detail = {
      jid: from,
      presence:
        stanza.getAttribute("type") === "unavailable"
          ? "offline"
          : show === "dnd"
            ? "dnd"
            : show === "away" || show === "xa"
              ? "away"
              : "online",
      status: stanza.getElementsByTagName("status")[0]?.textContent || "",
    };

    this.emit("presence", detail);
    return true;
  }

  private onMessage(stanza: Element): boolean {
    const type = stanza.getAttribute("type");
    const body = stanza.getElementsByTagName("body")[0]?.textContent;
    if (!body || (type && !["chat", "normal"].includes(type))) {
      return true;
    }

    const delay = [...stanza.getElementsByTagName("delay")].find(
      (item) => item.getAttribute("xmlns") === "urn:xmpp:delay",
    );
    const detail: XmppMessageEvent = {
      id: stanza.getAttribute("id") || undefined,
      from: bareJid(stanza.getAttribute("from") || ""),
      to: bareJid(stanza.getAttribute("to") || this.account),
      body,
      timestamp: delay?.getAttribute("stamp")
        ? Date.parse(delay.getAttribute("stamp")!)
        : Date.now(),
    };

    this.emit("message", detail);
    return true;
  }

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

function searchField(item: Element, ...names: string[]): string {
  for (const name of names) {
    const field = [...item.getElementsByTagName("field")].find(
      (candidate) => candidate.getAttribute("var") === name,
    );
    const value =
      field?.getElementsByTagName("value")[0]?.textContent ||
      item.getElementsByTagName(name)[0]?.textContent;

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readableCondition(condition?: string | Element | null): string {
  const value =
    typeof condition === "string" ? condition : condition?.textContent || "";

  if (/remote-connection-failed|service-unavailable/i.test(value)) {
    return "Openfire недоступен по HTTP-порту 7070";
  }

  return value || "Не удалось подключиться к Openfire по HTTP";
}

export const xmppConnection = new XmppConnection();
