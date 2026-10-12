import { useEffect, useId, useRef } from "react";
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
} from "react";

export type ButtonKind = "primary" | "secondary" | "ghost" | "surface" | "heroPrimary" | "heroSecondary" | "danger";
export type ButtonSize = "default" | "compact" | "hero";

const buttonBase =
  "adm-btn inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-[7px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vh-bg)] disabled:pointer-events-none disabled:opacity-45";

const buttonSizes: Record<ButtonSize, string> = {
  default: "min-h-9 gap-2 px-3.5 py-2 text-[11px] font-semibold",
  compact: "gap-[5px] px-3 py-[9px] text-[11px] font-normal",
  hero: "min-h-[40px] flex-none gap-[7px] px-[19px] py-3 text-[12px] font-bold leading-[1.25]",
};

const buttonKinds: Record<ButtonKind, string> = {
  primary:
    "border-[var(--vh-accent)] bg-[var(--vh-accent)] text-[#171b11] hover:bg-[var(--vh-accent-hover)]",
  secondary:
    "border-[#363d48] bg-[var(--vh-panel-raised)] text-[#d5dae2] hover:border-[#7c8d5a]",
  ghost:
    "border-transparent bg-transparent text-[#929ba8] hover:bg-white/5",
  surface:
    "border-[#2a2f39] bg-[#11141b] text-[#d6d9df] hover:border-[#c7f36b88] hover:text-[var(--vh-accent)]",
  heroPrimary:
    "border-0 bg-[#c7f36b] text-[#11160b] hover:bg-[#d8fa91]",
  heroSecondary:
    "border border-[#ffffff1e] bg-[#ffffff13] text-[#f4f5f6] hover:bg-[#ffffff20]",
  danger:
    "border-[#9d3541] bg-[#7b2732] text-white hover:bg-[#96313d]",
};

/** Shared button primitive; kind and size select accessible visual variants. */
export function Button({
  children,
  kind = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  kind?: ButtonKind;
  size?: ButtonSize;
}) {
  return (
    <button
      className={
        buttonBase +
        " " + buttonSizes[size] +
        " " + buttonKinds[kind] +
        (className ? " " + className : "")
      }
      {...props}
    >
      {children}
    </button>
  );
}

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Accessible confirmation dialog with Escape handling, focus containment and focus restoration. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef({ onConfirm, onCancel });
  const busyRef = useRef(busy);

  useEffect(() => {
    handlersRef.current = { onConfirm, onCancel };
  }, [onConfirm, onCancel]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) handlersRef.current.onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const root = dialogRef.current;
      const focusable = root?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!root || !focusable?.length) {
        event.preventDefault();
        root?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-[#343b46] bg-[#11151c] p-5 text-[#eef1f5] shadow-2xl outline-none sm:p-6"
      >
        <h2 id={titleId} className="m-0 text-base font-semibold">{title}</h2>
        {description !== undefined && (
          <div id={descriptionId} className="mt-3 text-sm leading-6 text-[#a7b0bd]">
            {description}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button kind="secondary" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            kind={danger ? "danger" : "primary"}
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
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
export type NavigationVariant = "sidebar" | "top";

/** Shared route link with host-controlled navigation and platform-specific visual variants. */
export function NavigationItem({
  to,
  active,
  onNavigate,
  icon,
  label,
  variant = "sidebar",
  className = "",
}: {
  to: string;
  active: boolean;
  onNavigate: (path: string) => void;
  icon?: ReactNode;
  label: string;
  variant?: NavigationVariant;
  className?: string;
}) {
  const baseClasses = variant === "sidebar"
    ? "adm-nav-link relative flex items-center gap-[11px] rounded-lg p-3 text-xs no-underline transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)]"
    : "relative flex h-full items-center gap-[7px] text-[13px] no-underline text-[#888d99] transition-colors hover:text-[#f4f5f6] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)]";
  const stateClasses = variant === "sidebar"
    ? active
      ? "bg-[#c7f36b15] text-[var(--vh-accent)] after:absolute after:right-[11px] after:h-[5px] after:w-[5px] after:rounded-full after:bg-[var(--vh-accent)]"
      : "text-[#9aa2af]"
    : active
      ? "text-[#f4f5f6] after:bg-[#c7f36b]"
      : "";
  return (
    <a
      href={to}
      aria-current={active ? "page" : undefined}
      className={baseClasses + " " + stateClasses + (className ? " " + className : "")}
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
export type SearchFieldVariant = "admin" | "public";

/** Search input with optional leading/trailing elements; the input remains controlled by its caller. */
export function SearchField({
  leading,
  trailing,
  variant = "admin",
  className = "",
  wrapperClassName = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  leading?: ReactNode;
  trailing?: ReactNode;
  variant?: SearchFieldVariant;
  wrapperClassName?: string;
}) {
  const wrapperStyle = variant === "public"
    ? "search flex w-[220px] items-center gap-[9px] rounded-[10px] border border-[#242832] bg-[#151820] px-[13px] py-[10px] text-[#858b97]"
    : "adm-search flex h-9 min-w-[190px] flex-1 items-center gap-2 rounded-[7px] border border-[#353d48] bg-[#151a22] px-2.5 text-[#818c9b] focus-within:border-[#718650]";
  const inputStyle = variant === "public"
    ? "w-full min-w-0 border-0 bg-transparent text-[12px] text-[#f3f4f5] outline-none placeholder:text-[#737986]"
    : "min-w-0 flex-1 border-0 bg-transparent text-[11px] text-[#e5e9ef] outline-none placeholder:text-[#626c7a]";
  return (
    <div className={wrapperStyle + " " + wrapperClassName}>
      {leading && <span className="shrink-0">{leading}</span>}
      <input {...props} className={inputStyle + " " + className} />
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
}: HTMLAttributes<HTMLTableRowElement>) {
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

export type ChoiceChipVariant = "standard" | "pill";
export type ChoiceChipSize = "sm" | "md";

export function ChoiceChip({
  selected = false,
  variant = "standard",
  size = "sm",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  variant?: ChoiceChipVariant;
  size?: ChoiceChipSize;
  children: ReactNode;
}) {
  const sizing: Record<ChoiceChipSize, string> = {
    sm: "gap-1 rounded-[5px] px-[9px] py-1.5 text-[10px]",
    md: "gap-2 rounded-full px-[13px] py-2 text-[11px]",
  };
  const variants: Record<ChoiceChipVariant, { selected: string; idle: string }> = {
    standard: {
      selected: "border-[#819e54] bg-[#c7f36b10] text-[var(--vh-accent)]",
      idle: "border-[#353d48] bg-[#181e26] text-[#acb5c2] hover:border-[#718650]",
    },
    pill: {
      selected: "border-[#c7f36b88] bg-[#c7f36b16] text-[var(--vh-accent)]",
      idle: "border-[#292e38] bg-[#11141b] text-[#9aa1ad] hover:border-[#69744f] hover:text-[#eef1e8]",
    },
  };
  return (
    <button
      {...props}
      className={
        "inline-flex items-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vh-accent)] " +
        sizing[size] +
        " " + (selected ? variants[variant].selected : variants[variant].idle) +
        (className ? " " + className : "")
      }
    >
      {children}
    </button>
  );
}


export type MediaCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  poster: string;
  posterAlt?: string;
  title: string;
  metadata?: ReactNode;
  secondaryMetadata?: ReactNode;
  rank?: string;
  playIcon?: ReactNode;
  posterClassName?: string;
};

/** Public catalog card shared by the main grid and related-content sections. */
export function MediaCard({
  poster,
  posterAlt = "",
  title,
  metadata,
  secondaryMetadata,
  rank,
  playIcon,
  className = "",
  posterClassName = "",
  ...buttonProps
}: MediaCardProps) {
  return (
    <button
      {...buttonProps}
      className={
        "group media-card cursor-pointer overflow-hidden rounded-[10px] border border-transparent bg-transparent p-0 text-left text-[inherit] transition-transform duration-200 hover:-translate-y-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7f36b] " +
        className
      }
    >
      <div className={"poster-wrap relative aspect-[16/10] overflow-hidden bg-[#171a22] max-[600px]:aspect-[4/3] " + posterClassName}>
        <img
          className="block h-full w-full object-cover transition-transform duration-[350ms] group-hover:scale-[1.04]"
          src={poster}
          alt={posterAlt}
          loading="lazy"
        />
        {rank && (
          <span className="poster-number absolute left-3 top-3 z-[1] rounded-[4px] border border-white/15 bg-[#080a10a6] px-1.5 py-1 text-[10px] text-white">
            {rank}
          </span>
        )}
        {playIcon && (
          <span className="poster-play absolute bottom-3 right-3 z-[1] grid h-[30px] w-[30px] place-items-center rounded-full bg-[#c7f36b] text-[11px] text-[#10150a] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {playIcon}
          </span>
        )}
      </div>
      <div className="media-info flex flex-col gap-[7px] px-[3px] pt-[13px] pb-3 max-[600px]:pt-[10px]">
        <strong className="overflow-hidden text-ellipsis text-[13px] font-semibold max-[600px]:text-[12px]">{title}</strong>
        {metadata !== undefined && (
          <span className="text-[10px] text-[#818793]">{metadata}</span>
        )}
        {secondaryMetadata !== undefined && (
          <span className="media-type-label text-[10px] tracking-[.15px] text-[#a5adba]">{secondaryMetadata}</span>
        )}
      </div>
    </button>
  );
}
