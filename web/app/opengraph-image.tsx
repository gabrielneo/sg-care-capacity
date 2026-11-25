import { ImageResponse } from "next/og";

import { colors } from "@/lib/palette";
import { SITE } from "@/lib/site";

// The picture shown when the site's link is shared (LinkedIn, Slack, messaging apps). No figures in
// it: a shared image can't carry a date and source, so it states what the site does instead.
export const alt = `${SITE.name}: a public-data analytics project by Gabriel Neo on hospital bed waits and clinic access for Singapore's seniors`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const badge = (label: string, fg: string, bg: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", borderRadius: 999, background: bg, color: fg, fontSize: 28, fontWeight: 600 }}>
      {/* The flat bar (about usual) is drawn: the image's font has no "▬" glyph. */}
      {label.startsWith("▬ ") ? <div style={{ display: "flex", width: 22, height: 7, borderRadius: 2, background: fg }} /> : null}
      {label.startsWith("▬ ") ? label.slice(2) : label}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    padding: "72px 80px", backgroundColor: colors["hero-bg"], color: colors["on-hero"], fontFamily: "sans-serif",
                    // The site's hero: deep purple with one soft royal-blue glow behind the claim.
                    backgroundImage: `radial-gradient(ellipse 760px 320px at 42% 46%, ${colors["brand-royal-600"]}99, ${colors["hero-bg"]} 80%)` }}>
        <div style={{ display: "flex", fontSize: 30, color: colors["on-hero-muted"], fontWeight: 600 }}>{`${SITE.name} · a data analytics project by Gabriel Neo`}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 600, lineHeight: 1.12, maxWidth: 1000 }}>
            Which hospitals take longest to find a ward bed, and where are clinics for seniors scarce?
          </div>
          <div style={{ display: "flex", fontSize: 30, color: colors["on-hero-muted"] }}>
            Public data · automated data checks · two separate measures, side by side
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {/* The chart's own status pills: an arrow and a word, never colour alone. */}
          {badge("▲ Higher than usual", colors["status-higher"], colors["status-higher-soft"])}
          {badge("▬ About usual", colors["status-usual"], colors["status-usual-soft"])}
          {badge("▼ Lower than usual", colors["status-lower"], colors["status-lower-soft"])}
        </div>
      </div>
    ),
    size,
  );
}
