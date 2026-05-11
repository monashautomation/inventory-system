import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/server/lib/prisma";
import { admin, customSession, genericOAuth } from "better-auth/plugins";
export const auth = betterAuth({
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["authentik"],
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      const role = await prisma.user
        .findUnique({ where: { id: user.id } })
        .then((x) => x?.role);
      return {
        user: {
          ...user,
          role: role,
        },
        session,
      };
    }),
    admin(),
    genericOAuth({
      config: [
        {
          providerId: "authentik", // Matches the callback URL slug
          clientId: process.env.AUTHENTIK_CLIENT_ID ?? "",
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET ?? "",
          discoveryUrl:
            "https://auth.monashautomation.com/application/o/inventory-system/.well-known/openid-configuration",
          scopes: ["openid", "profile", "email"],
        },
      ],
    }),
  ],
  emailAndPassword: {
    enabled: false,
  },
  // TO HAVE AN EMAIL WHITELIST
  // databaseHooks: {
  //   user: {
  //     create: {
  //       before: async (user) => {
  //         const email = user.email?.toLowerCase() ?? "";
  //
  //         if (!(process.env.ALLOWED_EMAILS ?? "").split(",").includes(email)) {
  //           throw new APIError("BAD_REQUEST", {
  //             message: "User not allowed to use platform.",
  //           });
  //         }
  //         return {
  //           data: user,
  //         };
  //       },
  //     },
  //   },
  // },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: [process.env.FRONTEND_URL ?? "http://localhost:5173"],
});
