import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AUTHOR_LINKS } from "@/lib/author";

import { AuthorByline } from "./AuthorByline";

describe("AuthorByline", () => {
  it("names the author and links the CV, LinkedIn, GitHub and email", () => {
    render(<AuthorByline />);
    expect(screen.getByTestId("author-byline")).toHaveTextContent("Built by Gabriel Neo");
    for (const l of AUTHOR_LINKS) {
      expect(screen.getByRole("link", { name: new RegExp(l.label) })).toHaveAttribute("href", l.href);
    }
  });

  it("opens outside links safely in a new tab, and says so to screen readers", () => {
    render(<AuthorByline />);
    const cv = screen.getByRole("link", { name: /CV/ });
    expect(cv).toHaveAttribute("target", "_blank");
    expect(cv).toHaveAttribute("rel", "noopener noreferrer");
    expect(cv).toHaveTextContent("(opens in a new tab)");
    expect(screen.getByRole("link", { name: "Email" })).not.toHaveAttribute("target");
  });

  it("keeps the owner id out of the CV link", () => {
    expect(AUTHOR_LINKS.find((l) => l.id === "cv")?.href).not.toContain("ouid");
  });
});
