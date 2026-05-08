// Database-mimicking mock data generation using Prisma types
import { faker } from "@faker-js/faker";
import { Prisma, PrismaClient } from "@prisma/client";
import type {
  Location as PrismaLocation,
  Tag as PrismaTag,
  Consumable as PrismaConsumable,
  ItemRecord as PrismaItemRecord,
  User as PrismaUser,
  Group as PrismaGroup,
  Session as PrismaSession,
  Account as PrismaAccount,
  Verification as PrismaVerification,
} from "@prisma/client";

// ============================================
// TYPE EXPORTS (Matching your schema exactly)
// ============================================

export type Item = Prisma.ItemGetPayload<{
  include: {
    location: true;
    tags: true;
    consumable: true;
    ItemRecords: true;
  };
}>;

export type Location = PrismaLocation;
export type Tag = PrismaTag;
export type Consumable = PrismaConsumable;
export type ItemRecord = PrismaItemRecord;
export type User = PrismaUser;
export type Group = PrismaGroup;
export type Session = PrismaSession;
export type Account = PrismaAccount;
export type Verification = PrismaVerification;

// ============================================
// DATABASE MIMICKING FACTORY
// ============================================

/**
 * Factory that creates mock data matching exact database constraints and relations
 */
export class DatabaseMockFactory {
  private createdIds = {
    users: new Set<string>(),
    groups: new Set<string>(),
    locations: new Set<string>(),
    tags: new Set<string>(),
    items: new Set<string>(),
  };

  constructor(seed?: number) {
    if (seed !== undefined) {
      faker.seed(seed);
    }
  }

  // ============================================
  // GROUP MODEL
  // ============================================

  createGroup(overrides?: Partial<Group>): Group {
    const id = overrides?.id ?? faker.string.uuid();
    this.createdIds.groups.add(id);

    return {
      id,
      name: overrides?.name ?? faker.company.name(),
      parentId: overrides?.parentId ?? null,
      createdAt: overrides?.createdAt ?? faker.date.past(),
      updatedAt: overrides?.updatedAt ?? faker.date.recent(),
      ...overrides,
    } satisfies Group;
  }

  // ============================================
  // USER MODEL
  // ============================================

  createUser(overrides?: Partial<User>): User {
    const id = overrides?.id ?? faker.string.uuid();
    this.createdIds.users.add(id);

    return {
      id,
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      emailVerified: faker.datatype.boolean({ probability: 0.8 }),
      image: faker.helpers.maybe(() => faker.image.avatar()) ?? null,
      groupId: overrides?.groupId ?? null,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      role: faker.helpers.arrayElement(["user", "admin", "moderator"]),
      banned: faker.datatype.boolean({ probability: 0.05 }) ? true : null,
      banReason: null,
      banExpires: null,
      ...overrides,
      studentNumber: overrides?.studentNumber ?? null,
    } satisfies User;
  }

  createBannedUser(overrides?: Partial<User>): User {
    const banDate = faker.date.recent();
    return this.createUser({
      banned: true,
      banReason: faker.helpers.arrayElement([
        "Violation of terms of service",
        "Inappropriate behavior",
        "Spam",
        "Security violation",
      ]),
      banExpires: faker.date.future({ years: 1, refDate: banDate }),
      ...overrides,
    });
  }

  // ============================================
  // SESSION MODEL
  // ============================================

  createSession(userId: string, overrides?: Partial<Session>): Session {
    const createdAt = faker.date.recent({ days: 7 });
    return {
      id: faker.string.uuid(),
      expiresAt: faker.date.future({ years: 1, refDate: createdAt }),
      token: faker.string.alphanumeric(64),
      createdAt,
      updatedAt: createdAt,
      ipAddress: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      userId,
      impersonatedBy: null,
      ...overrides,
    } satisfies Session;
  }

  // ============================================
  // ACCOUNT MODEL
  // ============================================

  createAccount(userId: string, overrides?: Partial<Account>): Account {
    const now = new Date();
    const provider =
      overrides?.providerId ??
      faker.helpers.arrayElement(["google", "github", "email"]);

    return {
      id: faker.string.uuid(),
      accountId: faker.string.uuid(),
      providerId: provider,
      userId,
      accessToken: provider !== "email" ? faker.string.alphanumeric(40) : null,
      refreshToken: provider !== "email" ? faker.string.alphanumeric(40) : null,
      idToken: provider !== "email" ? faker.string.alphanumeric(200) : null,
      accessTokenExpiresAt: provider !== "email" ? faker.date.future() : null,
      refreshTokenExpiresAt:
        provider !== "email" ? faker.date.future({ years: 1 }) : null,
      scope: provider !== "email" ? "openid profile email" : null,
      password:
        provider === "email" ? faker.internet.password({ length: 20 }) : null,
      createdAt: faker.date.past(),
      updatedAt: now,
      ...overrides,
    } satisfies Account;
  }

  // ============================================
  // VERIFICATION MODEL
  // ============================================

  createVerification(overrides?: Partial<Verification>): Verification {
    return {
      id: faker.string.uuid(),
      identifier: faker.internet.email().toLowerCase(),
      value: faker.string.alphanumeric(32),
      expiresAt: faker.date.future({ years: 0.1 }), // Expires in ~1 month
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } satisfies Verification;
  }

  // ============================================
  // LOCATION MODEL (Hierarchical)
  // ============================================

  createLocation(overrides?: Partial<Location>): Location {
    const id = overrides?.id ?? faker.string.uuid();
    this.createdIds.locations.add(id);

    return {
      id,
      name: faker.helpers.arrayElement([
        `Building ${faker.location.buildingNumber()}`,
        `Floor ${faker.number.int({ min: 1, max: 10 })}`,
        `Room ${faker.string.alphanumeric(3).toUpperCase()}`,
        faker.location.county(),
        `${faker.company.name()} Warehouse`,
        `Storage ${faker.string.alpha({ length: 1 }).toUpperCase()}`,
      ]),
      parentId: overrides?.parentId ?? null,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    } satisfies Location;
  }

  createLocationHierarchy(): { root: Location; children: Location[] } {
    const root = this.createLocation({
      name: `Building ${faker.location.buildingNumber()}`,
    });
    const floors = Array.from({ length: 3 }, (_, i) =>
      this.createLocation({
        name: `Floor ${i + 1}`,
        parentId: root.id,
      }),
    );
    const rooms = floors.flatMap((floor) =>
      Array.from({ length: 4 }, (_, i) =>
        this.createLocation({
          name: `Room ${floor.name.replace("Floor ", "")}${String(i + 1).padStart(2, "0")}`,
          parentId: floor.id,
        }),
      ),
    );

    return {
      root,
      children: [...floors, ...rooms],
    };
  }

  // ============================================
  // TAG MODEL
  // ============================================

  createTag(overrides?: Partial<Tag>): Tag {
    const id = overrides?.id ?? faker.string.uuid();
    this.createdIds.tags.add(id);

    const type =
      overrides?.type ??
      faker.helpers.arrayElement([
        "category",
        "status",
        "priority",
        "department",
        "condition",
        "warranty",
      ]);

    // Type-specific names
    const nameByType: Record<string, string> = {
      category: faker.helpers.arrayElement([
        "Electronics",
        "Furniture",
        "Tools",
        "Supplies",
        "Equipment",
      ]),
      status: faker.helpers.arrayElement([
        "Available",
        "In Use",
        "Maintenance",
        "Reserved",
        "Retired",
      ]),
      priority: faker.helpers.arrayElement([
        "High",
        "Medium",
        "Low",
        "Critical",
      ]),
      department: faker.helpers.arrayElement([
        "IT",
        "HR",
        "Finance",
        "Operations",
        "Sales",
      ]),
      condition: faker.helpers.arrayElement([
        "New",
        "Good",
        "Fair",
        "Poor",
        "Repair Needed",
      ]),
      warranty: faker.helpers.arrayElement([
        "Under Warranty",
        "Extended Warranty",
        "No Warranty",
        "Expired",
      ]),
    };

    return {
      id,
      name: overrides?.name ?? nameByType[type] ?? faker.word.noun(),
      type,
      colour:
        overrides?.colour ?? faker.color.rgb({ prefix: "#" }).toUpperCase(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      ...overrides,
    } satisfies Tag;
  }

  // ============================================
  // CONSUMABLE MODEL
  // ============================================

  createConsumable(
    itemId: string,
    overrides?: Partial<Consumable>,
  ): Consumable {
    const total = overrides?.total ?? faker.number.int({ min: 10, max: 500 });
    const available =
      overrides?.available ?? faker.number.int({ min: 5, max: total });

    return {
      id: faker.string.uuid(),
      itemId,
      available,
      total,
      ...overrides,
    } satisfies Consumable;
  }

  // ============================================
  // ITEM RECORD MODEL (Audit Trail)
  // ============================================

  createItemRecord(
    itemId: string,
    actionByUserId: string,
    overrides?: Partial<ItemRecord>,
  ): ItemRecord {
    return {
      id: faker.string.uuid(),
      loaned: faker.datatype.boolean(),
      consumed: faker.datatype.boolean(),
      actionByUserId,
      itemId,
      notes: faker.helpers.maybe(() => faker.lorem.sentence()) ?? null,
      performedByUserId: null,
      quantity: faker.number.int({ min: 1, max: 10 }),
      createdAt: faker.date.recent({ days: 30 }),
      ...overrides,
    } satisfies ItemRecord;
  }

  // ============================================
  // ITEM MODEL (Complex with Relations)
  // ============================================

  createItem(options?: {
    location?: Location;
    tags?: Tag[];
    user?: User;
    isConsumable?: boolean;
    isLoaned?: boolean;
    overrides?: Partial<Item>;
  }): Item {
    const id = options?.overrides?.id ?? faker.string.uuid();
    this.createdIds.items.add(id);

    // Ensure we have required relations
    const location = options?.location ?? this.createLocation();
    const user = options?.user ?? this.createUser();
    const tags = options?.tags ?? [this.createTag()];
    const isConsumable =
      options?.isConsumable ?? faker.datatype.boolean({ probability: 0.3 });

    // Create consumable if needed
    const consumable = isConsumable ? this.createConsumable(id) : null;

    // Create item record (audit trail) - Note: unique constraint on itemId
    const itemRecord = this.createItemRecord(id, user.id, {
      loaned: options?.isLoaned ?? faker.datatype.boolean(),
    });

    // Generate serial number (following database unique constraint)
    const serial = faker.string.alphanumeric(10).toUpperCase();

    const baseItem: Item = {
      id,
      serial,
      image:
        faker.helpers.maybe(() => faker.image.url(), { probability: 0.6 }) ??
        null,
      name: faker.commerce.productName(),
      locationId: location.id,
      stored: !itemRecord.loaned, // If loaned, it's not stored
      cost: faker.number.int({ min: 10, max: 50000 }),
      createdAt: faker.date.past({ years: 2 }),
      updatedAt: faker.date.recent(),
      deleted: faker.datatype.boolean({ probability: 0.05 }),
      notes: null,
      notesUpdatedByUserId: null,
      notesUpdatedAt: null,
      // Relations
      location,
      tags, // Changed from itemTag to tags
      consumable,
      ItemRecords: [itemRecord],
    };

    return {
      ...baseItem,
      ...options?.overrides,
    } satisfies Item;
  }

  // ============================================
  // SPECIALIZED ITEM FACTORIES
  // ============================================

  createConsumableItem(overrides?: Partial<Item>): Item {
    return this.createItem({
      isConsumable: true,
      overrides,
    });
  }

  createAssetItem(overrides?: Partial<Item>): Item {
    return this.createItem({
      isConsumable: false,
      overrides,
    });
  }

  createLoanedAsset(user: User, overrides?: Partial<Item>): Item {
    return this.createItem({
      isConsumable: false,
      isLoaned: true,
      user,
      overrides: {
        stored: false,
        ...overrides,
      },
    });
  }

  createAvailableAsset(overrides?: Partial<Item>): Item {
    return this.createItem({
      isConsumable: false,
      isLoaned: false,
      overrides: {
        stored: true,
        ...overrides,
      },
    });
  }

  // ============================================
  // PRISMA CREATE INPUT GENERATORS
  // ============================================

  /**
   * Generate Prisma-ready input for creating an item with all relations
   */
  generateItemCreateInput(options?: {
    locationId?: string;
    tagIds?: string[];
    userId?: string;
  }): Prisma.ItemCreateInput {
    const serial = faker.string.alphanumeric(10).toUpperCase();
    const isConsumable = faker.datatype.boolean({ probability: 0.3 });
    const isLoaned = faker.datatype.boolean();

    return {
      serial,
      image: faker.helpers.maybe(() => faker.image.url()),
      name: faker.commerce.productName(),
      stored: !isLoaned,
      cost: faker.number.int({ min: 10, max: 50000 }),
      deleted: false,
      location: options?.locationId
        ? { connect: { id: options.locationId } }
        : { create: this.createLocation() },
      tags: options?.tagIds
        ? {
            connect: options.tagIds.map((id) => ({ id })),
          }
        : {
            create: Array.from(
              { length: faker.number.int({ min: 1, max: 3 }) },
              () => this.createTag(),
            ),
          },
      consumable: isConsumable
        ? {
            create: {
              available: faker.number.int({ min: 0, max: 100 }),
              total: faker.number.int({ min: 100, max: 500 }),
            },
          }
        : undefined,
      ItemRecords: {
        create: {
          loaned: isLoaned,
          actionBy: {
            connect: { id: options?.userId ?? faker.string.uuid() },
          },
          notes: faker.helpers.maybe(() => faker.lorem.sentence()),
          quantity: isConsumable ? faker.number.int({ min: 1, max: 10 }) : 1,
        },
      },
    };
  }

  /**
   * Generate a complete user with all relations
   */
  generateUserCreateInput(groupId?: string): Prisma.UserCreateInput {
    const email = faker.internet.email().toLowerCase();
    const provider = faker.helpers.arrayElement(["google", "github", "email"]);

    return {
      name: faker.person.fullName(),
      email,
      emailVerified: faker.datatype.boolean({ probability: 0.8 }),
      image: faker.helpers.maybe(() => faker.image.avatar()),
      role: faker.helpers.weightedArrayElement([
        { weight: 70, value: "user" },
        { weight: 20, value: "moderator" },
        { weight: 10, value: "admin" },
      ]),
      group: groupId ? { connect: { id: groupId } } : undefined,
      accounts: {
        create: {
          id: faker.string.uuid(),
          accountId: faker.string.uuid(),
          providerId: provider,
          accessToken:
            provider !== "email" ? faker.string.alphanumeric(40) : null,
          refreshToken:
            provider !== "email" ? faker.string.alphanumeric(40) : null,
          password:
            provider === "email"
              ? faker.internet.password({ length: 20 })
              : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      sessions: {
        create: {
          id: faker.string.uuid(),
          token: faker.string.alphanumeric(64),
          expiresAt: faker.date.future(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ipAddress: faker.internet.ip(),
          userAgent: faker.internet.userAgent(),
        },
      },
    };
  }

  // ============================================
  // BATCH CREATION METHODS
  // ============================================

  createCompleteDataset(options?: {
    userCount?: number;
    groupCount?: number;
    locationCount?: number;
    tagCount?: number;
    itemCount?: number;
  }) {
    const {
      userCount = 5,
      groupCount = 3,
      locationCount = 10,
      tagCount = 15,
      itemCount = 20,
    } = options ?? {};

    // Create groups
    const groups = Array.from({ length: groupCount }, () => this.createGroup());

    // Create users with groups
    const users = Array.from({ length: userCount }, () =>
      this.createUser({
        groupId:
          faker.helpers.maybe(() => faker.helpers.arrayElement(groups).id) ??
          null,
      }),
    );

    // Create location hierarchy
    const locationHierarchies = Array.from(
      { length: Math.ceil(locationCount / 4) },
      () => this.createLocationHierarchy(),
    );
    const locations = locationHierarchies.flatMap((h) => [
      h.root,
      ...h.children,
    ]);

    // Create diverse tags
    const tagTypes = [
      "category",
      "status",
      "priority",
      "department",
      "condition",
      "warranty",
    ];
    const tags = tagTypes
      .flatMap((type) =>
        Array.from({ length: Math.ceil(tagCount / tagTypes.length) }, () =>
          this.createTag({ type }),
        ),
      )
      .slice(0, tagCount);

    // Create items with varied configurations
    const items: Item[] = [];
    for (let i = 0; i < itemCount; i++) {
      const item = this.createItem({
        location: faker.helpers.arrayElement(locations),
        tags: faker.helpers.arrayElements(tags, { min: 1, max: 4 }),
        user: faker.helpers.arrayElement(users),
        isConsumable: i % 3 === 0, // Every third item is consumable
        isLoaned: i % 5 === 0, // Every fifth item is loaned
      });
      items.push(item);
    }

    return {
      groups,
      users,
      locations,
      tags,
      items,
      stats: {
        totalGroups: groups.length,
        totalUsers: users.length,
        totalLocations: locations.length,
        totalTags: tags.length,
        totalItems: items.length,
        consumableItems: items.filter((i) => i.consumable !== null).length,
        loanedItems: items.filter((i) => i.ItemRecords[0]?.loaned).length,
        deletedItems: items.filter((i) => i.deleted).length,
      },
    };
  }
}

// ============================================
// DEFAULT INSTANCE & EXPORTS
// ============================================

export const mockFactory = new DatabaseMockFactory();

// Convenience exports
export const createItem = (
  options?: Parameters<DatabaseMockFactory["createItem"]>[0],
) => mockFactory.createItem(options);
export const createUser = (overrides?: Partial<User>) =>
  mockFactory.createUser(overrides);
export const createLocation = (overrides?: Partial<Location>) =>
  mockFactory.createLocation(overrides);
export const createTag = (overrides?: Partial<Tag>) =>
  mockFactory.createTag(overrides);
export const createGroup = (overrides?: Partial<Group>) =>
  mockFactory.createGroup(overrides);
export const createConsumable = (
  itemId: string,
  overrides?: Partial<Consumable>,
) => mockFactory.createConsumable(itemId, overrides);
export const createItemRecord = (
  itemId: string,
  actionByUserId: string,
  overrides?: Partial<ItemRecord>,
) => mockFactory.createItemRecord(itemId, actionByUserId, overrides);

// Specialized item exports
export const createConsumableItem = (overrides?: Partial<Item>) =>
  mockFactory.createConsumableItem(overrides);
export const createAssetItem = (overrides?: Partial<Item>) =>
  mockFactory.createAssetItem(overrides);
export const createLoanedAsset = (user: User, overrides?: Partial<Item>) =>
  mockFactory.createLoanedAsset(user, overrides);
export const createAvailableAsset = (overrides?: Partial<Item>) =>
  mockFactory.createAvailableAsset(overrides);

// ============================================
// SEED DATABASE
// ============================================

export async function seedDatabase(
  prisma: PrismaClient,
  options?: {
    seed?: number;
    userCount?: number;
    itemCount?: number;
    clean?: boolean;
  },
) {
  const {
    seed = 12345,
    userCount = 10,
    itemCount = 50,
    clean = false,
  } = options ?? {};

  if (clean) {
    // Clean database in correct order (respecting foreign keys)
    await prisma.itemRecord.deleteMany();
    await prisma.consumable.deleteMany();
    await prisma.item.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.location.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
    await prisma.group.deleteMany();
    await prisma.verification.deleteMany();
  }

  const factory = new DatabaseMockFactory(seed);

  // Create groups first (some with parent relationships)
  const rootGroups = Array.from({ length: 3 }, () => factory.createGroup());

  for (const group of rootGroups) {
    await prisma.group.create({ data: group });
  }

  // Create sub-groups
  const subGroups = Array.from({ length: 2 }, () =>
    factory.createGroup({
      parentId: faker.helpers.arrayElement(rootGroups).id,
    }),
  );

  for (const group of subGroups) {
    await prisma.group.create({ data: group });
  }

  const allGroups = [...rootGroups, ...subGroups];

  // Create users
  const users: User[] = [];
  for (let i = 0; i < userCount; i++) {
    const groupId =
      faker.helpers.maybe(() => faker.helpers.arrayElement(allGroups).id) ??
      null;

    const user = factory.createUser({ groupId });
    users.push(user);

    // Create user without relations first
    await prisma.user.create({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        groupId: user.groupId,
      },
    });

    // Create related accounts and sessions
    if (faker.datatype.boolean({ probability: 0.8 })) {
      const account = factory.createAccount(user.id);
      await prisma.account.create({ data: account });
    }

    if (faker.datatype.boolean({ probability: 0.6 })) {
      const session = factory.createSession(user.id);
      await prisma.session.create({ data: session });
    }
  }

  // Create location hierarchy
  const locationHierarchies = Array.from({ length: 3 }, () =>
    factory.createLocationHierarchy(),
  );

  const locations: Location[] = [];
  for (const hierarchy of locationHierarchies) {
    // Create root location first
    await prisma.location.create({ data: hierarchy.root });
    locations.push(hierarchy.root);

    // Then create children
    for (const child of hierarchy.children) {
      await prisma.location.create({ data: child });
      locations.push(child);
    }
  }

  // Create tags
  const tagTypes = [
    "category",
    "status",
    "priority",
    "department",
    "condition",
    "warranty",
  ];
  const tags: Tag[] = [];

  for (const type of tagTypes) {
    for (let i = 0; i < 3; i++) {
      const tag = factory.createTag({ type });
      tags.push(tag);
      await prisma.tag.create({ data: tag });
    }
  }

  // Create items with relations
  for (let i = 0; i < itemCount; i++) {
    const selectedTags = faker.helpers.arrayElements(tags, { min: 1, max: 3 });
    const location = faker.helpers.arrayElement(locations);
    const user = faker.helpers.arrayElement(users);
    const isConsumable = i % 3 === 0;
    const isLoaned = i % 5 === 0;

    await prisma.item.create({
      data: {
        serial: faker.string.alphanumeric(10).toUpperCase(),
        name: faker.commerce.productName(),
        image: faker.helpers.maybe(() => faker.image.url()),
        stored: !isLoaned,
        cost: faker.number.int({ min: 10, max: 50000 }),
        deleted: false,
        location: {
          connect: { id: location.id },
        },
        tags: {
          connect: selectedTags.map((tag) => ({ id: tag.id })),
        },
        consumable: isConsumable
          ? {
              create: {
                available: faker.number.int({ min: 0, max: 100 }),
                total: faker.number.int({ min: 100, max: 500 }),
              },
            }
          : undefined,
        ItemRecords: {
          create: {
            loaned: isLoaned,
            actionBy: {
              connect: { id: user.id },
            },
            notes: faker.helpers.maybe(() => faker.lorem.sentence()),
            quantity: isConsumable ? faker.number.int({ min: 1, max: 10 }) : 1,
          },
        },
      },
    });
  }

  // Get stats
  const itemCount_ = await prisma.item.count();
  const consumableCount = await prisma.consumable.count();
  const loanedCount = await prisma.itemRecord.count({
    where: { loaned: true },
  });
  const deletedCount = await prisma.item.count({ where: { deleted: true } });

  const stats = {
    totalGroups: allGroups.length,
    totalUsers: users.length,
    totalLocations: locations.length,
    totalTags: tags.length,
    totalItems: itemCount_,
    consumableItems: consumableCount,
    loanedItems: loanedCount,
    deletedItems: deletedCount,
  };

  console.log("✅ Database seeded:", stats);
  return stats;
}
