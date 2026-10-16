import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc";
import { notificationRouter } from "../notification";
import prismaMock from "@/server/lib/__mocks__/prisma";

// prisma is globally mocked in vitest.setup.ts

const sessionUser = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  role: "user",
};

const ctxWith = (
  apiToken: null | {
    id: string;
    name: string;
    readOnly: boolean;
    ownerId: string;
    owner: { id: string; name: string; email: string; role: string };
  },
) => ({
  prisma: prismaMock as never,
  user: sessionUser,
  apiToken,
  req: new Request("http://localhost"),
  res: {} as Response,
});

const caller = createCallerFactory(notificationRouter);

const readOnlyToken = {
  id: "tok-ro",
  name: "cli",
  readOnly: true,
  ownerId: "user-1",
  owner: {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    role: "user",
  },
};

describe("read-only API token enforcement", () => {
  it("allows queries through a read-only token", async () => {
    prismaMock.notification.findMany.mockResolvedValue([] as never);
    const c = caller(ctxWith(readOnlyToken));
    await expect(c.list({})).resolves.toEqual([]);
  });

  it("blocks mutations through a read-only token", async () => {
    const c = caller(ctxWith(readOnlyToken));
    await expect(
      c.markRead({ ids: ["00000000-0000-4000-8000-000000000001"] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This API token is read-only.",
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("allows mutations with a read-write token", async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 } as never);
    const c = caller(ctxWith({ ...readOnlyToken, readOnly: false }));
    await expect(
      c.markRead({ ids: ["00000000-0000-4000-8000-000000000001"] }),
    ).resolves.toBeUndefined();
  });

  it("allows mutations with a normal browser session", async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 } as never);
    const c = caller(ctxWith(null));
    await expect(
      c.markRead({ ids: ["00000000-0000-4000-8000-000000000001"] }),
    ).resolves.toBeUndefined();
  });
});
