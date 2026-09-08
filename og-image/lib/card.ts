/**
 * The Open Graph card as a Satori element tree (1200x630).
 *
 * Mirrors the site's live panel: avatar in a violet glow, presence dot,
 * now-playing / osu! / Steam / local-time chips. Pure function — the handler
 * and the local render script both feed it a {@link CardData}.
 */
import type { CardData, Status } from "./data";

/* Minimal hyperscript. Satori only needs `{ type, props: { style, children } }`. */
type El = { type: string; props: Record<string, unknown> };
type Child = El | string | null | undefined | false;

function h(
  type: string,
  props: Record<string, unknown> = {},
  ...children: Child[]
): El {
  const kids = children.filter((c): c is El | string => Boolean(c));
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } };
}

const C = {
  bg: "#110c1c",
  ink: "#ededf2",
  white: "#ffffff",
  mute: "#a7a5b4",
  violet: "#7c3aed",
  violetLift: "#b96cff",
  chipBg: "rgba(255, 255, 255, 0.05)",
  chipLine: "rgba(255, 255, 255, 0.09)",
};

const STATUS_COLOR: Record<Status, string> = {
  online: "#43b581",
  idle: "#faa61a",
  dnd: "#f04747",
  offline: "#747f8d",
};
const STATUS_WORD: Record<Status, string> = {
  online: "online",
  idle: "idle",
  dnd: "do not disturb",
  offline: "offline",
};

const MONO = "JetBrains Mono";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function compact(n: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 0,
  })
    .format(n)
    .toLowerCase();
}

function svgIcon(svg: string): El {
  return h("img", {
    width: 22,
    height: 22,
    src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
  });
}

const noteIcon = svgIcon(
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${C.violetLift}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l10-2v11"/><circle cx="6" cy="18" r="3" fill="${C.violetLift}"/><circle cx="16" cy="16" r="3" fill="${C.violetLift}"/></svg>`,
);
const clockIcon = svgIcon(
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${C.violetLift}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
);

type Part = { t: string; accent?: boolean };

function chip(icon: El | null, parts: Part[]): El {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 24,
        padding: "13px 26px",
        borderRadius: 999,
        background: C.chipBg,
        border: `1px solid ${C.chipLine}`,
      },
    },
    icon,
    h(
      "div",
      { style: { display: "flex" } },
      ...parts.map((p) =>
        h(
          "span",
          {
            style: {
              fontFamily: MONO,
              fontWeight: p.accent ? 700 : 400,
              color: p.accent ? C.violetLift : C.ink,
              whiteSpace: "pre",
            },
          },
          p.t,
        ),
      ),
    ),
  );
}

function chips(d: CardData): El[] {
  const out: El[] = [];

  if (d.music) {
    out.push(
      chip(noteIcon, [
        { t: truncate(d.music.title, 22), accent: true },
        { t: `  ·  ${truncate(d.music.artist, 18)}` },
      ]),
    );
  }

  if (d.osu) {
    out.push(
      chip(null, [
        { t: "osu!  " },
        { t: `#${compact(d.osu.rank)}`, accent: true },
        { t: `  ·  ${d.osu.pp.toLocaleString("en-US")}pp` },
      ]),
    );
  }

  if (d.steam) {
    out.push(
      "playing" in d.steam
        ? chip(null, [{ t: "Steam  " }, { t: truncate(d.steam.playing, 18), accent: true }])
        : chip(null, [{ t: "Steam  " }, { t: `Lv ${d.steam.level}`, accent: true }]),
    );
  }

  out.push(
    chip(clockIcon, [
      { t: d.time, accent: true },
      { t: `  ${d.city}` },
    ]),
  );

  return out;
}

function avatar(d: CardData): El {
  const glow = "0 0 0 6px rgba(124, 58, 237, 0.35), 0 0 60px rgba(150, 90, 255, 0.55)";
  if (d.avatar) {
    return h("img", {
      src: d.avatar,
      width: 132,
      height: 132,
      style: { borderRadius: 999, boxShadow: glow },
    });
  }
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 132,
        height: 132,
        borderRadius: 999,
        backgroundImage: "linear-gradient(135deg, #7c3aed, #b96cff)",
        color: "#140f22",
        fontFamily: "Roboto",
        fontWeight: 900,
        fontSize: 48,
        boxShadow: glow,
      },
    },
    "JJ",
  );
}

function head(d: CardData): El {
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 32 } },
    avatar(d),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h(
        "div",
        {
          style: {
            fontFamily: "Roboto",
            fontWeight: 900,
            fontSize: 72,
            letterSpacing: -1,
            color: C.white,
            lineHeight: 1,
          },
        },
        d.name,
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            marginTop: 20,
            fontSize: 22,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: C.mute,
          },
        },
        h("div", {
          style: {
            display: "flex",
            width: 18,
            height: 18,
            borderRadius: 999,
            background: STATUS_COLOR[d.status],
            marginRight: 14,
            boxShadow: `0 0 16px ${STATUS_COLOR[d.status]}`,
          },
        }),
        h("span", { style: { whiteSpace: "pre" } },
          `${STATUS_WORD[d.status]}  ·  application dev  ·  ${d.city}`),
      ),
    ),
  );
}

function foot(d: CardData): El {
  return h(
    "div",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 20,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: C.mute,
      },
    },
    h("span", { style: { color: C.violetLift } }, "jayjayzzzzzz.me"),
    h("span", {}, `updated ${d.time} ${d.tz}`),
  );
}

export function buildCard(d: CardData): El {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "64px 84px",
        background: C.bg,
        backgroundImage:
          "radial-gradient(50% 65% at 88% -5%, rgba(124, 58, 237, 0.38), rgba(17, 12, 28, 0))",
        borderLeft: `16px solid ${C.violet}`,
        color: C.ink,
        fontFamily: MONO,
        fontSize: 22,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 44,
          marginTop: "auto",
          marginBottom: "auto",
        },
      },
      head(d),
      h(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: 18 } },
        ...chips(d),
      ),
    ),
    foot(d),
  );
}
