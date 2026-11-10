import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { useI18n } from "@/shared/i18n";
import { Button } from "./Button";

type Variant = "success" | "error";
interface Message { id: number; text: string; variant: Variant }
interface FeedbackChannel {
  notify: (message: string, variant?: Variant) => void;
  dismiss: (id: number) => void;
}
const FeedbackContext = createContext<FeedbackChannel | null>(null);

/** In-memory only. Messages persist across routes, never across app restarts. */
export function FeedbackProvider({ children }: PropsWithChildren) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const notify = useCallback((message: string, variant: Variant = "success") => {
    setMessages((current) => {
      if (current.some((item) => item.text === message && item.variant === variant)) return current;
      const id = (current.at(-1)?.id ?? 0) + 1;
      return [...current.slice(-3), { id, text: message, variant }];
    });
  }, []);
  const dismiss = useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);
  const channel = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <FeedbackContext.Provider value={channel}>
      {children}
      <aside className="feedback-channel" aria-label={t("feedback.title")}>
        {messages.map((message) => (
          <div key={message.id} className={`feedback-message feedback-${message.variant}`}>
            <span role={message.variant === "error" ? "alert" : "status"}>{message.text}</span>
            <Button variant="ghost" onClick={() => dismiss(message.id)}>{t("actions.dismiss")}</Button>
          </div>
        ))}
      </aside>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackChannel {
  const channel = useContext(FeedbackContext);
  if (!channel) throw new Error("FeedbackProvider is required");
  return channel;
}
