import { ImageResponse } from "next/og";

import { colors } from "@/lib/palette";

// The picture shown when the site's link is shared (LinkedIn, Slack, messaging apps). No figures in
// it: a shared image can't carry a date and source, so it states what the site does instead.
export const alt = "Right-siting care: a public-data analytics project by Gabriel Neo on emergency department bed waits and clinic access for Singapore's seniors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const badge = (label: string, fg: string, bg: string) => (
    <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: bg, color: fg, fontSize: 28, fontWeight: 600 }}>
      {label}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    padding: "72px 80px", background: colors.page, color: colors.ink, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, color: colors.accent, fontWeight: 600 }}>A data analytics project by Gabriel Neo</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.12, maxWidth: 1000 }}>
            Where do Singapore&apos;s hospital waits run longest, and where are clinics for seniors scarce?
          </div>
          <div style={{ display: "flex", fontSize: 30, color: colors.muted }}>
            Weekly pipeline · automated data checks · tested findings
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {badge("▲▲ Much higher than usual", colors.bad, colors["bad-soft"])}
          {badge("▲ Higher than usual", colors.warn, colors["warn-soft"])}
          {badge("● About usual", colors.ok, colors["ok-soft"])}
        </div>
      </div>
    ),
    size,
  );
}
