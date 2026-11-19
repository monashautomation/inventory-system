import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ItemRowActions } from "@/components/data-table/item-row-actions";

const base = {
  consumable: false,
  loanState: "stored" as const,
  heldByMe: false,
  inCart: false,
  onAddToCart: vi.fn(),
  onModify: vi.fn(),
  onDelete: vi.fn(),
};

const renderActions = (props: Partial<Parameters<typeof ItemRowActions>[0]>) =>
  render(
    <MemoryRouter>
      <ItemRowActions {...base} {...props} />
    </MemoryRouter>,
  );

describe("ItemRowActions", () => {
  it("equipment in storage: Add to loan, never 'cart'", () => {
    const onAddToCart = vi.fn();
    renderActions({ onAddToCart });
    fireEvent.click(screen.getByRole("button", { name: /add to loan/i }));
    expect(onAddToCart).toHaveBeenCalledOnce();
    expect(screen.queryByText(/cart/i)).toBeNull();
  });

  it("equipment already added shows as on your loan, and is disabled", () => {
    renderActions({ inCart: true });
    expect(
      screen.getByRole("button", { name: /on your loan/i }),
    ).toBeDisabled();
  });

  it("equipment you hold: Return link to Check in", () => {
    renderActions({ loanState: "loaned", heldByMe: true });
    expect(screen.getByRole("link", { name: /return/i })).toHaveAttribute(
      "href",
      "/checkin",
    );
  });

  it("equipment held by someone else or lab use: no action", () => {
    const { unmount } = renderActions({ loanState: "loaned" });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    unmount();
    renderActions({ loanState: "lab" });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("consumable: Request more (members cannot take consumables)", () => {
    const onAddToCart = vi.fn();
    renderActions({ consumable: true, onAddToCart });
    fireEvent.click(screen.getByRole("button", { name: /request more/i }));
    expect(onAddToCart).toHaveBeenCalledOnce();
    expect(screen.queryByText(/loan|cart/i)).toBeNull();
  });

  it("admins get an edit/delete menu", () => {
    renderActions({ isAdmin: true });
    expect(
      screen.getByRole("button", { name: /more actions/i }),
    ).toBeInTheDocument();
  });
});
