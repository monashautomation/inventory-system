import { adminProcedure, userProcedure, router } from "@/server/trpc";
import { groupRouter } from "./group";
import { consumableRouter } from "./consumable";
import { itemRouter } from "./item";
import { tagRouter } from "./tag";
import { locationRouter } from "./location";
import { itemRecordRouter } from "./itemRecord";
import { dashboardRouter } from "./dashboardRouter";
import { qrRouter } from "./qr";
import z from "zod";
import { chatRouter } from "./chat";
import { printRouter } from "./print";

export const appRouter = router({
  group: groupRouter,
  consumable: consumableRouter,
  item: itemRouter,
  tag: tagRouter,
  location: locationRouter,
  itemRecord: itemRecordRouter,
  dashboard: dashboardRouter,
  qr: qrRouter,
  chat: chatRouter,
  print: printRouter,
  hello: userProcedure.query(() => {
    return "hello world";
  }),
  sayHello: userProcedure
    .meta({ mcp: { enabled: true, description: "Greet the user" } })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello ${input.name}!` };
    }),
  user: adminProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findFirst({
      where: {
        id: ctx.user?.id,
      },
    });

    return user;
  }),
});

export type AppRouter = typeof appRouter;
