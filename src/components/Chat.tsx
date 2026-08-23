import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { EmojiClickData } from "emoji-picker-react";
import { formatDate, formatDividerDate, isSameDay } from "../lib/display";
import type { ChatMessage, Contact } from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

const EmojiPicker = lazy(async () => {
  const [pickerModule, dataModule] = await Promise.all([
    import("emoji-picker-react"),
    import("emoji-picker-react/dist/data/emojis-ru"),
  ]);
  const Picker = pickerModule.default;

  return {
    default: (props: ComponentProps<typeof Picker>) => (
      <Picker
        {...props}
        emojiData={dataModule.default}
        emojiStyle={pickerModule.EmojiStyle.NATIVE}
        theme={pickerModule.Theme.DARK}
      />
    ),
  };
});

type ChatProps = {
  contact: Contact;
  messages: ChatMessage[];
  account: string;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  onSend: (body: string) => void;
  onLoadOlder: () => Promise<void>;
  onSearch: (query: string) => Promise<ChatMessage[]>;
  onNavigateToMessage: (message: ChatMessage) => Promise<void>;
  onNavigateToDate: (timestamp: number) => Promise<string | null>;
  onBack: () => void;
  onImport: () => void;
  onClear: () => void;
};

export function Chat({
  contact,
  messages,
  account,
  hasOlderMessages,
  loadingOlderMessages,
  onSend,
  onLoadOlder,
  onSearch,
  onNavigateToMessage,
  onNavigateToDate,
  onBack,
  onImport,
  onClear,
}: ChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const historyToolsRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const previousContactRef = useRef("");
  const previousLastMessageRef = useRef("");
  const preserveScrollHeightRef = useRef<number | null>(null);
  const navigationTargetRef = useRef<string | null>(null);
  const suppressAutoScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const [draft, setDraft] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<"date" | "search" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [jumpDate, setJumpDate] = useState("");
  const [highlightedMessage, setHighlightedMessage] = useState("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list || suppressAutoScrollRef.current) {
      return;
    }

    if (preserveScrollHeightRef.current !== null) {
      list.scrollTop += list.scrollHeight - preserveScrollHeightRef.current;
      preserveScrollHeightRef.current = null;
    } else if (navigationTargetRef.current) {
      const target = list.querySelector(
        `[data-message-id="${CSS.escape(navigationTargetRef.current)}"]`,
      );
      target?.scrollIntoView({ block: "center" });
      navigationTargetRef.current = null;
    } else {
      const lastMessage = messages.at(-1)?.id || "";
      const contactChanged = previousContactRef.current !== contact.jid;
      const appended =
        !!previousLastMessageRef.current &&
        previousLastMessageRef.current !== lastMessage;

      if (contactChanged || (!previousLastMessageRef.current && lastMessage)) {
        bottomRef.current?.scrollIntoView({ block: "end" });
      } else if (appended && nearBottomRef.current) {
        bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    }

    previousContactRef.current = contact.jid;
    previousLastMessageRef.current = messages.at(-1)?.id || "";
    updateScrollPosition(list);
  }, [contact.jid, hasOlderMessages, highlightedMessage, messages]);

  useEffect(() => {
    inputRef.current?.focus();
    setActiveTool(null);
    setSearchQuery("");
    setSearchResults([]);
    setSearchPerformed(false);
    setHighlightedMessage("");
    setShowScrollToBottom(false);
  }, [contact.jid]);

  useEffect(() => {
    const list = messageListRef.current;
    if (
      list &&
      hasOlderMessages &&
      !loadingOlderMessages &&
      list.scrollHeight <= list.clientHeight
    ) {
      void loadOlder();
    }
  }, [hasOlderMessages, loadingOlderMessages, messages]);

  useEffect(() => {
    if (!activeTool) {
      return;
    }

    const closeOutside = (event: Event) => {
      if (!historyToolsRef.current?.contains(event.target as Node)) {
        setActiveTool(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTool(null);
      }
    };
    const closeOnWindowBlur = () => setActiveTool(null);

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnWindowBlur);
    };
  }, [activeTool]);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    const closeOnWindowBlur = () => setEmojiPickerOpen(false);

    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("blur", closeOnWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("blur", closeOnWindowBlur);
    };
  }, [emojiPickerOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }

    onSend(draft);
    setDraft("");
    selectionRef.current = { start: 0, end: 0 };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function insertEmoji({ emoji }: EmojiClickData) {
    const input = inputRef.current;
    const { start, end } = selectionRef.current;
    const cursor = start + emoji.length;

    selectionRef.current = { start: cursor, end: cursor };
    setDraft((current) =>
      `${current.slice(0, start)}${emoji}${current.slice(end)}`,
    );
    requestAnimationFrame(() => {
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function rememberSelection(input: HTMLTextAreaElement) {
    selectionRef.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  }

  async function loadOlder() {
    const list = messageListRef.current;
    if (!list || !hasOlderMessages || loadingOlderMessages) {
      return;
    }

    preserveScrollHeightRef.current = list.scrollHeight;
    try {
      await onLoadOlder();
    } catch {
      preserveScrollHeightRef.current = null;
    }
  }

  function handleMessageScroll() {
    const list = messageListRef.current;
    if (!list) {
      return;
    }

    updateScrollPosition(list);
    if (list.scrollTop < 80) {
      void loadOlder();
    }
  }

  function updateScrollPosition(list: HTMLDivElement) {
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    nearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      setSearchResults(await onSearch(searchQuery));
      setSearchPerformed(true);
    } finally {
      setSearching(false);
    }
  }

  async function showMessage(message: ChatMessage) {
    suppressAutoScrollRef.current = true;
    setHighlightedMessage("");
    setActiveTool(null);
    try {
      await onNavigateToMessage(message);
      navigationTargetRef.current = message.id;
      setHighlightedMessage(message.id);
    } finally {
      suppressAutoScrollRef.current = false;
    }
  }

  async function submitDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jumpDate) {
      return;
    }

    suppressAutoScrollRef.current = true;
    try {
      const target = await onNavigateToDate(
        new Date(`${jumpDate}T00:00:00`).getTime(),
      );
      if (target) {
        navigationTargetRef.current = target;
        setHighlightedMessage(target);
      }
      setActiveTool(null);
    } finally {
      suppressAutoScrollRef.current = false;
    }
  }

  return (
    <>
      <header className="chat-header">
        <button className="back-button" onClick={onBack} aria-label="Назад">
          <Icon name="back" />
        </button>
        <span className="hash">@</span>
        <strong>{contact.name}</strong>
        <span className="header-status">{contact.status || contact.jid}</span>
        <div className="header-actions">
          <div className="history-tools" ref={historyToolsRef}>
            <button
              onClick={() =>
                setActiveTool((tool) =>
                  tool === "search" ? null : "search",
                )
              }
              aria-label="Найти сообщение"
              aria-expanded={activeTool === "search"}
              title="Найти сообщение"
            >
              <Icon name="search" />
            </button>
            <button
              onClick={() =>
                setActiveTool((tool) => (tool === "date" ? null : "date"))
              }
              aria-label="Перейти к дате"
              aria-expanded={activeTool === "date"}
              title="Перейти к дате"
            >
              <Icon name="calendar" />
            </button>
            {activeTool === "search" && (
              <div
                className="chat-tool-panel search-panel"
                role="dialog"
                aria-label="Поиск сообщений"
              >
                <strong>Поиск сообщений</strong>
                <form className="chat-tool-form" onSubmit={submitSearch}>
                  <input
                    autoFocus
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchPerformed(false);
                    }}
                    placeholder="Введите текст сообщения"
                    aria-label="Текст сообщения"
                  />
                  <button disabled={searching || !searchQuery.trim()}>
                    {searching ? "Поиск…" : "Найти"}
                  </button>
                </form>
                {!!searchResults.length && (
                  <div
                    className="search-results"
                    aria-label="Результаты поиска"
                  >
                    {searchResults.map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        className="search-result"
                        onClick={() => void showMessage(message)}
                      >
                        <span>
                          <strong>
                            {message.direction === "outgoing"
                              ? account.split("@")[0]
                              : contact.name}
                          </strong>
                          <time>
                            {formatDividerDate(message.timestamp)}, {" "}
                            {formatDate(message.timestamp)}
                          </time>
                        </span>
                        <p>{message.body}</p>
                      </button>
                    ))}
                  </div>
                )}
                {searchPerformed && !searching && !searchResults.length && (
                  <p className="tool-empty">Совпадений не найдено</p>
                )}
              </div>
            )}
            {activeTool === "date" && (
              <div
                className="chat-tool-panel date-panel"
                role="dialog"
                aria-label="Переход к дате"
              >
                <strong>Перейти к дате</strong>
                <p>Покажем первое сообщение начиная с выбранного дня.</p>
                <form className="chat-tool-form" onSubmit={submitDate}>
                  <input
                    autoFocus
                    type="date"
                    value={jumpDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setJumpDate(event.target.value)}
                    aria-label="Дата сообщения"
                  />
                  <button disabled={!jumpDate}>Перейти</button>
                </form>
              </div>
            )}
          </div>
          <button
            onClick={onImport}
            aria-label="Импорт истории Spark"
            title="Импорт истории Spark"
          >
            <Icon name="upload" />
          </button>
          <button
            onClick={onClear}
            aria-label="Удалить локальную историю"
            title="Удалить локальную историю"
          >
            <Icon name="trash" />
          </button>
        </div>
      </header>
      <div className="message-area">
        <div
          className="message-list"
          ref={messageListRef}
          onScroll={handleMessageScroll}
        >
          {loadingOlderMessages && (
            <div className="history-loader">Загрузка истории…</div>
          )}
          {!hasOlderMessages && !!messages.length && (
            <div className="history-start">Начало истории</div>
          )}
          {!messages.length && !loadingOlderMessages && (
            <div className="conversation-start">
              <Avatar name={contact.name} presence={contact.presence} large />
              <h1>{contact.name}</h1>
              <p>
                Начало вашей локальной истории с <strong>{contact.jid}</strong>.
              </p>
            </div>
          )}
          {messages.map((message, index) => {
          const previous = messages[index - 1];
          const needDivider =
            !previous || !isSameDay(previous.timestamp, message.timestamp);
          const compact =
            !!previous && previous.from === message.from && message.timestamp - previous.timestamp < 5 * 60 * 1000 && !needDivider;
          const author =
            message.direction === "outgoing" ? account : contact.name;

          return (
            <div key={message.id}>
              {needDivider && (
                <div className="day-divider">
                  <span>{formatDividerDate(message.timestamp)}</span>
                </div>
              )}
              <article
                className={`message ${compact ? "compact" : ""} ${highlightedMessage === message.id ? "highlighted" : ""}`}
                data-message-id={message.id}
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
            </div>
          );
          })}
          <div ref={bottomRef} />
        </div>
        {showScrollToBottom && (
          <button
            type="button"
            className="scroll-to-bottom"
            onClick={scrollToBottom}
            aria-label="Перейти в конец истории"
            title="В конец истории"
          >
            <Icon name="down" />
          </button>
        )}
      </div>
      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          disabled
          aria-label="Прикрепление файлов пока недоступно"
          title="Прикрепление файлов пока недоступно"
        >
          +
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            rememberSelection(event.target);
          }}
          onSelect={(event) => rememberSelection(event.currentTarget)}
          onKeyDown={handleKeyDown}
          placeholder={`Написать @${contact.name}`}
          aria-label={`Сообщение для ${contact.name}`}
        />
        <div
          className="emoji-picker"
          ref={emojiPickerRef}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (nextTarget && !event.currentTarget.contains(nextTarget)) {
              setEmojiPickerOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="emoji-picker-toggle"
            onClick={() => setEmojiPickerOpen((open) => !open)}
            aria-label="Выбрать эмодзи"
            aria-expanded={emojiPickerOpen}
            title="Эмодзи"
          >
            ☺
          </button>
          {emojiPickerOpen && (
            <div className="emoji-menu">
              <Suspense fallback={<div className="emoji-loading">Загрузка…</div>}>
                <EmojiPicker
                  width="min(350px, calc(100vw - 32px))"
                  height={420}
                  onEmojiClick={insertEmoji}
                  searchPlaceholder="Найти эмодзи"
                  searchClearButtonLabel="Очистить поиск"
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis
                />
              </Suspense>
            </div>
          )}
        </div>
        <button
          className="send-button"
          disabled={!draft.trim()}
          aria-label="Отправить"
        >
          <Icon name="send" />
        </button>
      </form>
    </>
  );
}
