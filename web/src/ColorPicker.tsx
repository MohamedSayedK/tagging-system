import { useEffect, useId, useRef, useState } from "react";
import { hexToHsv, hsvToHex, normalizeHex } from "./colorMath";
import { TOPIC_COLORS } from "./topicColors";

const START = "#3e63dd";

/** value is "" for no colour. A colour outside the palette (set freely or through the API) gets a "Custom" swatch. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inPalette = value === "" || TOPIC_COLORS.some((c) => c.value.toLowerCase() === value.toLowerCase());
  const options: { label: string; value: string }[] = [
    { label: "None", value: "" },
    ...TOPIC_COLORS.map((c) => ({ label: c.name, value: c.value })),
    ...(inPalette ? [] : [{ label: `Custom ${value}`, value }]),
  ];

  return (
    <fieldset className="color-picker">
      <legend>Topic color</legend>
      <div className="color-row">
        {options.map((o) => (
          <label key={o.label} className={o.value === "" ? "swatch none" : "swatch"} title={o.label}>
            <input
              type="radio"
              name="topic-color"
              aria-label={o.label}
              checked={value.toLowerCase() === o.value.toLowerCase()}
              onChange={() => onChange(o.value)}
            />
            <span style={o.value ? { background: o.value } : undefined} />
          </label>
        ))}
        <button
          ref={triggerRef}
          type="button"
          className="swatch custom-trigger"
          aria-label="Custom color"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Custom color"
          onClick={() => setOpen((o) => !o)}
        >
          <span />
        </button>
        {open && (
          <CustomColor
            start={normalizeHex(value) ?? START}
            onChange={onChange}
            onClose={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            triggerRef={triggerRef}
          />
        )}
      </div>
    </fieldset>
  );
}

function CustomColor(props: {
  start: string;
  onChange: (v: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { start, onChange, onClose, triggerRef } = props;
  const [hsv, setHsv] = useState(() => hexToHsv(start));
  const [text, setText] = useState(start);
  const [invalid, setInvalid] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const titleId = useId();
  const current = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    hexRef.current?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !triggerRef.current?.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    setText(hex);
    setInvalid(false);
    onChange(hex);
  };

  const fromPoint = (clientX: number, clientY: number) => {
    const r = squareRef.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
    const v = Math.min(1, Math.max(0, 1 - (clientY - r.top) / (r.height || 1)));
    apply({ h: hsv.h, s, v });
  };

  const step = (e: React.KeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const m = move[e.key];
    if (!m) return;
    e.preventDefault();
    apply({ h: hsv.h, s: Math.min(1, Math.max(0, hsv.s + m[0])), v: Math.min(1, Math.max(0, hsv.v + m[1])) });
  };

  const typed = (raw: string) => {
    setText(raw);
    const hex = normalizeHex(raw);
    if (!hex) return setInvalid(true);
    setInvalid(false);
    setHsv(hexToHsv(hex));
    onChange(hex);
  };

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Choose a custom color"
      className="color-pop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="pop-label" id={titleId}>
        Selected color
      </p>
      <div className="pop-hex">
        <span className="preview" style={{ background: invalid ? start : current }} aria-hidden="true" />
        <label>
          Hex #
          <input
            ref={hexRef}
            aria-label="Hex color"
            value={text}
            maxLength={7}
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${titleId}-err` : undefined}
            onChange={(e) => typed(e.target.value)}
          />
        </label>
      </div>
      {invalid && (
        <p className="pop-error" id={`${titleId}-err`}>
          Enter a six-digit hex color, like #9980fa.
        </p>
      )}
      <div className="pop-body">
        <div
          ref={squareRef}
          className="sv"
          role="application"
          aria-label="Saturation and brightness"
          aria-roledescription="2D color area"
          aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
          tabIndex={0}
          style={{ ["--hue" as string]: `hsl(${hsv.h} 100% 50%)` }}
          onKeyDown={step}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            fromPoint(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => dragging.current && fromPoint(e.clientX, e.clientY)}
          onPointerUp={() => (dragging.current = false)}
        >
          <span className="thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
        </div>
        <input
          type="range"
          className="hue"
          aria-label="Hue"
          aria-orientation="vertical"
          min={0}
          max={360}
          value={Math.round(hsv.h)}
          onChange={(e) => apply({ h: Number(e.target.value), s: hsv.s, v: hsv.v })}
        />
      </div>
      <p className="pop-label">Predefined colors</p>
      <div className="pop-palette">
        {TOPIC_COLORS.map((c) => (
          <button
            key={c.name}
            type="button"
            aria-label={c.name}
            title={c.name}
            style={{ background: c.value }}
            onClick={() => {
              const hsv2 = hexToHsv(c.value);
              setHsv(hsv2);
              setText(c.value);
              setInvalid(false);
              onChange(c.value);
            }}
          />
        ))}
      </div>
    </div>
  );
}