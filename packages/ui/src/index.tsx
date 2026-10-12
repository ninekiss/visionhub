import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TextareaHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
  TrHTMLAttributes,
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


/** Shared navigation item. Routes stay controlled by the host client. */
export function NavigationItem({
  to,
  active,
  onNavigate,
  icon,
  label,
  className = "",
}: {
  to: string;
  active: boolean;
  onNavigate: (path: string) => void;
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  const stateClasses = active
    ? "bg-[#c7f36b15] text-[var(--vh-accent)] after:absolute after:right-[11px] after:h-[5px] after:w-[5px] after:rounded-full after:bg-[var(--vh-accent)]"
    : "text-[#9aa2af]";
  return (
    <a
      href={to}
      aria-current={active ? "page" : undefined}
      className={
        "adm-nav-link relative flex items-center gap-[11px] rounded-lg p-3 text-xs no-underline transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)] " +
        stateClasses +
        (className ? " " + className : "")
      }
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) return;
        event.preventDefault();
        onNavigate(to);
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

/** Search input with optional leading/trailing elements; the input remains fully controlled by its caller. */
export function SearchField({
  leading,
  trailing,
  className = "",
  wrapperClassName = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  leading?: ReactNode;
  trailing?: ReactNode;
  wrapperClassName?: string;
}) {
  return (
    <div
      className={
        "adm-search flex h-9 min-w-[190px] flex-1 items-center gap-2 rounded-[7px] border border-[#353d48] bg-[#151a22] px-2.5 text-[#818c9b] focus-within:border-[#718650] " +
        wrapperClassName
      }
    >
      {leading && <span className="shrink-0">{leading}</span>}
      <input
        {...props}
        className={
          "min-w-0 flex-1 border-0 bg-transparent text-[11px] text-[#e5e9ef] outline-none placeholder:text-[#626c7a] " +
          className
        }
      />
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  );
}

/** Native select styled consistently across Web and future desktop screens. */
export function SelectControl({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "adm-select h-9 min-w-28 rounded-[7px] border border-[#353d48] bg-[#151a22] px-2.5 text-[10px] text-[#c6ccd5] outline-none focus-visible:border-[#718650] focus-visible:ring-2 focus-visible:ring-[#c7f36b1c] " +
        className
      }
    >
      {children}
    </select>
  );
}

/** Compact button for table actions and pagination controls. */
export function IconButton({
  children,
  danger = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      {...props}
      className={
        "adm-icon-button grid h-7 w-7 place-items-center rounded-[5px] border border-[#343c47] bg-[#171c24] text-[#d2d8e0] transition-colors hover:bg-[#252c35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)] disabled:cursor-not-allowed disabled:opacity-35 " +
        (danger ? "danger " : "") +
        className
      }
    >
      {children}
    </button>
  );
}

export function TableContainer({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      {...props}
      className={"adm-table-wrap relative min-h-[80px] overflow-x-auto " + className}
    >
      {children}
    </div>
  );
}

export function DataTable({
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      {...props}
      className={"w-full border-collapse text-left whitespace-nowrap " + className}
    />
  );
}

export function TableHeaderCell({
  className = "",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={
        "border-b border-[#2b313b] bg-[#141921] px-3.5 py-[13px] text-left text-[9px] font-normal tracking-[.3px] text-[#7d8795] max-[600px]:px-2.5 max-[600px]:py-2.5 " +
        className
      }
    />
  );
}

export function TableRow({
  className = "",
  ...props
}: TrHTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...props}
      className={"hover:bg-white/[0.01] " + className}
    />
  );
}

export function TableCell({
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...props}
      className={
        "border-b border-[#252b34] px-3.5 py-3 text-[10px] text-[#bdc4ce] max-[600px]:px-2.5 max-[600px]:py-2.5 " +
        className
      }
    />
  );
}

export function PaginationBar({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      {...props}
      className={
        "adm-table-footer flex items-center justify-between gap-3 border-t border-[#292f39] px-3.5 py-3 text-[10px] text-[#818b99] max-[390px]:text-[9px] " +
        className
      }
    >
      {children}
    </div>
  );
}


/** Shared single-line form input. Field labels remain responsible for field layout. */
export function TextInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "adm-control h-[37px] w-full min-w-0 rounded-[7px] border border-[#343c47] bg-[#0f1319] px-[11px] py-0 text-[11px] leading-[1.6] text-[#e5e9f0] outline-none focus:border-[#718650] focus:ring-2 focus:ring-[#c7f36b0b] " +
        className
      }
    />
  );
}

/** Shared multiline form input. */
export function TextAreaControl({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "adm-control min-h-[70px] w-full min-w-0 resize-y rounded-[7px] border border-[#343c47] bg-[#0f1319] px-[11px] py-2.5 text-[11px] leading-[1.6] text-[#e5e9f0] outline-none focus:border-[#718650] focus:ring-2 focus:ring-[#c7f36b0b] " +
        className
      }
    />
  );
}

export function ChoiceChip({
  selected = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center gap-1 rounded-[5px] border px-[9px] py-1.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)] " +
        (selected
          ? "border-[#819e54] bg-[#c7f36b10] text-[var(--vh-accent)]"
          : "border-[#353d48] bg-[#181e26] text-[#acb5c2] hover:border-[#718650]") +
        (className ? " " + className : "")
      }
    >
      {children}
    </button>
  );
}
