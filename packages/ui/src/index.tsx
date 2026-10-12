import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

export type ButtonKind = "primary" | "secondary" | "ghost";

const buttonBase =
  "adm-btn inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border px-3.5 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vh-bg)] disabled:pointer-events-none disabled:opacity-45";

const buttonKinds: Record<ButtonKind, string> = {
  primary:
    "border-[var(--vh-accent)] bg-[var(--vh-accent)] text-[#171b11] hover:bg-[var(--vh-accent-hover)]",
  secondary:
    "border-[#363d48] bg-[var(--vh-panel-raised)] text-[#d5dae2] hover:border-[#7c8d5a]",
  ghost:
    "border-transparent bg-transparent text-[#929ba8] hover:bg-white/5",
};

/** Shared button primitive; the kind prop stays compatible with existing admin screens. */
export function Button({
  children,
  kind = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  kind?: ButtonKind;
}) {
  return (
    <button
      className={buttonBase + " " + buttonKinds[kind] + (className ? " " + className : "")}
      {...props}
    >
      {children}
    </button>
  );
}

export type MessageTone = "error" | "success" | "info";

const messageTones: Record<MessageTone, string> = {
  error: "border-[#633039] bg-[var(--vh-danger-bg)] text-[var(--vh-danger)]",
  success: "border-[#354c2d] bg-[var(--vh-success-bg)] text-[var(--vh-success)]",
  info: "border-[#2c4055] bg-[var(--vh-info-bg)] text-[var(--vh-info)]",
};

/** Accessible feedback box shared by admin and future desktop workflows. */
export function Message({
  children,
  tone = "error",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: MessageTone;
}) {
  return (
    <div
      className={
        "adm-message rounded-[7px] border px-3 py-2.5 text-[11px] leading-[1.65] [overflow-wrap:anywhere] " +
        messageTones[tone] +
        (className ? " " + className : "")
      }
      role={tone === "error" ? "alert" : "status"}
      {...props}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  wide = false,
  hint,
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={
        "adm-field flex min-w-0 flex-col gap-[7px] " +
        (wide ? "wide " : "") +
        className
      }
      {...props}
    >
      <span className="text-[10px] font-semibold text-[#b9c1cd]">{label}</span>
      {children}
      {hint && <small className="text-[9px] leading-[1.6] text-[#6f7988]">{hint}</small>}
    </label>
  );
}

export type BadgeTone = "neutral" | "accent" | "success" | "danger" | "series";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-[#343c47] bg-[#252c35] text-[#aab4c2]",
  accent: "border-[#819e54] bg-[#c7f36b10] text-[var(--vh-accent)]",
  success: "border-[#354c2d] bg-[var(--vh-success-bg)] text-[var(--vh-success)]",
  danger: "border-[#633039] bg-[var(--vh-danger-bg)] text-[var(--vh-danger)]",
  series: "border-transparent bg-[#312544] text-[#cbb2f1]",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={
        "adm-pill inline-flex items-center rounded border px-2 py-1 text-[10px] font-medium leading-none " +
        badgeTones[tone] +
        (className ? " " + className : "")
      }
      {...props}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section
      className={
        "adm-panel min-w-0 overflow-hidden rounded-[var(--vh-radius-panel)] border border-[var(--vh-line)] bg-[var(--vh-panel)] " +
        className
      }
      {...props}
    >
      {children}
    </section>
  );
}
