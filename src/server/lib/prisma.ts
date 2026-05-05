import { PrismaClient, Prisma } from "@prisma/client";

function getFourCharHash(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash += str.charCodeAt(i) * (i + 1);
  }
  hash = (hash * 31) % 65536;
  return hash.toString(16).padStart(4, "0").toUpperCase().slice(-4);
}

function toBase36Suffix(n: number): string {
  return n.toString(36).toUpperCase().padStart(4, "0");
}

// Parses both legacy decimal suffixes (e.g. "0042") and new base-36 suffixes.
// parseInt with radix 36 handles both: decimal digits are valid base-36.
function parseSuffix(suffix: string): number {
  const n = parseInt(suffix, 36);
  return isNaN(n) ? 0 : n;
}

type ItemCreateSerialInput = Omit<Prisma.ItemCreateInput, "serial"> & {
  serial?: never;
};
type ItemUncheckedCreateSerialInput = Omit<
  Prisma.ItemUncheckedCreateInput,
  "serial"
> & {
  serial?: never;
};

// Initialize base Prisma Client
const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  model: {
    item: {
      async createSerial(
        args: Omit<Prisma.ItemCreateArgs, "data"> & {
          data: Prisma.XOR<
            ItemCreateSerialInput,
            ItemUncheckedCreateSerialInput
          >;
        },
      ) {
        return await basePrisma.$transaction(async (tx) => {
          const prefix = getFourCharHash(args.data.name);

          const latest = await tx.item.findFirst({
            where: { serial: { startsWith: prefix } },
            orderBy: { serial: "desc" },
            select: { serial: true },
          });

          const nextNum = latest?.serial
            ? parseSuffix(latest.serial.slice(4)) + 1
            : 1;

          return tx.item.create({
            ...args,
            data: {
              ...args.data,
              serial: `${prefix}${toBase36Suffix(nextNum)}`,
            },
          });
        });
      },
    },
  },
});
