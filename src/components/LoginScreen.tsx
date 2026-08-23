import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadLogin } from "../lib/credentials";
import type { ConnectionState, LoginData } from "../types";

type LoginScreenProps = {
  state: ConnectionState;
  error: string;
  onLogin: (
    data: LoginData,
    notifications: boolean,
    mode: "automatic" | "remember" | "temporary",
  ) => void;
};

export function LoginScreen({ state, error, onLogin }: LoginScreenProps) {
  const autoLoginAttemptedRef = useRef(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(
    () =>
      window.__JABBER_CONFIG__?.defaultServer ||
      localStorage.getItem("jabber:last-server") ||
      "",
  );
  const [notifications, setNotifications] = useState(true);
  const [rememberLogin, setRememberLogin] = useState(true);

  useEffect(() => {
    let active = true;
    void loadLogin()
      .then((login) => {
        if (!active || !login || autoLoginAttemptedRef.current) {
          return;
        }

        autoLoginAttemptedRef.current = true;
        setUsername(login.username);
        setPassword(login.password);
        setServer(login.server);
        onLogin(login, notifications, "automatic");
      })
      .catch(() => {
        // Ручной вход остаётся доступен, если защищённое хранилище недоступно.
      });

    return () => {
      active = false;
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const login = readLoginData(event.currentTarget);
    if (login) {
      autoLoginAttemptedRef.current = true;
      onLogin(
        login,
        notifications,
        rememberLogin ? "remember" : "temporary",
      );
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">J</div>
        <h1>С возвращением!</h1>
        <p className="login-subtitle">Подключитесь к своему серверу Openfire</p>
        <label>
          Логин <span className="required-mark">*</span>
          <input
            name="username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="user или user@domain"
            required
          />
        </label>
        <label>
          Пароль <span className="required-mark">*</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Сервер Openfire <span className="required-mark">*</span>
          <input
            name="server"
            value={server}
            onChange={(event) => setServer(event.target.value)}
            placeholder="chat.company.local"
            required
          />
        </label>
        <div className="login-options">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(event) => setRememberLogin(event.target.checked)}
            />
            <span>Запомнить вход и подключаться автоматически</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={notifications}
              onChange={(event) => setNotifications(event.target.checked)}
            />
            <span>Разрешить уведомления о новых сообщениях</span>
          </label>
        </div>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button className="login-submit" disabled={state === "connecting"}>
          {state === "connecting" ? "Подключение…" : "Войти"}
        </button>
        <p className="plain-warning">
          <span>WebSocket</span> Браузер подключается напрямую к Openfire через
          порт 7070 без Node.js-шлюза.
        </p>
      </form>
    </main>
  );
}

function readLoginData(form: HTMLFormElement): LoginData | null {
  const data = new FormData(form);
  const username = String(data.get("username") || "").trim();
  const password = String(data.get("password") || "");
  const server = String(data.get("server") || "").trim();

  return username && password && server ? { username, password, server } : null;
}
