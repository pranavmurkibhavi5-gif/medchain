/**
 * One conversation.
 *
 * Messages are decrypted here and nowhere else. Opening this screen is what
 * starts the 24-hour clock on anything addressed to you - the server sets it,
 * so a client cannot dodge the rule by not reporting a read.
 *
 * Each read message carries a visible countdown, because a message that
 * silently disappears is alarming and one that announces itself is not.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useApp } from "../../context/AppContext";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { MAX_LENGTH, clockTime, expiryLabel, groupByDay } from "../../lib/messages";
import { openThread, sendMessage } from "../../lib/messages-store";
import { Spinner } from "../../components/ui";
import Avatar from "../../components/Avatar";

export default function Chat() {
  const { address: wallet } = useParams();
  const { address, keyPair, notify } = useApp();
  const t = useT();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [other, setOther] = useState(null);
  const [theirKey, setTheirKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Drives the countdown labels without refetching anything.
  const [, setTick] = useState(0);

  const endRef = useRef(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!keyPair) return;
      if (!quiet) setLoading(true);
      try {
        const { messages, other } = await openThread(wallet, keyPair);
        setMessages(messages);
        setOther(other);
      } catch (err) {
        notify(err.message, "error");
      } finally {
        setLoading(false);
      }
    },
    [wallet, keyPair, notify]
  );

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 10000);
    const clock = setInterval(() => setTick((n) => n + 1), 60000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  // The recipient's public key is needed to seal each message to them.
  useEffect(() => {
    api
      .userByWallet(wallet)
      .then(({ user }) => setTheirKey(user?.encryptionPublicKey || ""))
      .catch(() => setTheirKey(""));
  }, [wallet]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;

    if (!theirKey) {
      notify(t("chat.noKey"), "error");
      return;
    }

    setSending(true);
    try {
      await sendMessage(
        body,
        { address, publicKey: keyPair.publicKey },
        { address: wallet, publicKey: theirKey }
      );
      setText("");
      await load(true);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <header className="glass mb-3 flex items-center gap-3 border p-3">
        <button onClick={() => navigate("/app/messages")} className="px-1 text-xl text-slate-500">
          ‹
        </button>
        <Avatar wallet={wallet} name={other?.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{other?.name}</p>
          <p className="truncate text-xs text-slate-500">
            {other?.specialization ||
              (other?.role === "doctor" ? t("auth.doctor") : t("auth.patient"))}
          </p>
        </div>
      </header>

      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        ⏳ {t("chat.expiryNotice")}
      </p>

      <div className="flex-1 space-y-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">{t("chat.startHint")}</p>
        )}

        {groupByDay(messages).map((group) => (
          <div key={group.day} className="space-y-2">
            <p className="text-center text-xs font-medium text-slate-400">
              {new Date(group.items[0].sentAt).toLocaleDateString()}
            </p>

            {group.items.map((m) => {
              const mine = m.from?.toLowerCase() === address?.toLowerCase();
              const countdown = expiryLabel(m, t);
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      mine
                        ? "rounded-br-md bg-brand-600 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    {m.unreadable ? (
                      <p className={`text-sm italic ${mine ? "text-white/70" : "text-slate-400"}`}>
                        {t("chat.unreadable")}
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                    )}

                    <p
                      className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${
                        mine ? "text-white/70" : "text-slate-400"
                      }`}
                    >
                      <span>{clockTime(m.sentAt)}</span>
                      {mine && <span>{m.readAt ? "✓✓" : "✓"}</span>}
                      {countdown && <span>· {countdown}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="sticky bottom-0 mt-3 flex gap-2 bg-transparent pb-2 pt-1">
        <input
          className="input-lg flex-1"
          placeholder={t("chat.placeholder")}
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="btn-primary px-5 disabled:opacity-50"
        >
          {sending ? "…" : "➤"}
        </button>
      </form>
    </div>
  );
}
