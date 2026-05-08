import { userProcedure, router } from "@/server/trpc";
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
import { userRouter } from "./user";
import { kioskRouter } from "./kiosk";

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
  kiosk: kioskRouter,
  hello: userProcedure.query(() => {
    return "hello world";
  }),
  greeting: userProcedure
    .meta({
      mcp: {
        enabled: true,
        description:
          "Greet the user by name. Use this when the user says hello, hi, hey, or any greeting.",
      },
    })
    .output(z.object({ greeting: z.string() }))
    .query(({ ctx }) => {
      const hour = new Date().getHours();
      let timeGreeting: string;
      if (hour < 12) timeGreeting = "Good morning";
      else if (hour < 17) timeGreeting = "Good afternoon";
      else timeGreeting = "Good evening";
      return {
        greeting: `${timeGreeting}, ${ctx.user.name}! How can I help you with the inventory today?`,
      };
    }),
  user: userRouter,
});

export type AppRouter = typeof appRouter;
