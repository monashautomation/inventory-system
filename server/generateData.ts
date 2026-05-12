import type { Location } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from "../src/server/lib/prisma.ts"


async function generateTestData() {
  try {
    // Require existing users — never wipe auth tables
    const users = await prisma.user.findMany();
    if (users.length === 0) {
      throw new Error('No users found. Sign in to create an account first, then run generate.');
    }

    // Clear inventory data only, in dependency order
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.consumableRequest.deleteMany();
    await prisma.consumableSupplier.deleteMany();
    await prisma.itemRecord.deleteMany();
    await prisma.consumable.deleteMany();
    await prisma.item.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.tagGroup.deleteMany();
    await prisma.location.deleteMany();

    // Generate Locations with hierarchy
    const locations: Location[] = [];
    for (let i = 0; i < 10; i++) {
      const location = await prisma.location.create({
        data: {
          name: `${faker.location.city()} ${faker.string.alphanumeric(6)} Warehouse`,
          parentId: i > 0 ? faker.helpers.arrayElement(locations).id : null,
        },
      });
      locations.push(location);
    }

    // Generate Tags
    const tags = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        prisma.tag.create({
          data: {
            name: faker.commerce.productAdjective(),
            type: faker.helpers.arrayElement(['category', 'status', 'priority']),
            colour: faker.color.rgb({ prefix: '#' }),
          },
        })
      )
    );

    // Generate Items and Consumables
    const items = await Promise.all(
      Array.from({ length: 50 }).map(() =>
        prisma.item.createSerial({
          data: {
            name: faker.commerce.productName(),
            image: faker.image.urlPicsumPhotos({ width: 1024, height: 1024 }),
            locationId: faker.helpers.arrayElement(locations).id,
            stored: faker.datatype.boolean(),
            cost: faker.number.int({ min: 0, max: 1000 }),
            tags: {
              connect: faker.helpers.arrayElements(tags, { min: 1, max: 4 }).map(tag => ({
                id: tag.id
              }))
            },
            consumable: faker.datatype.boolean(0.3) ? {
              create: {
                available: faker.number.int({ min: 0, max: 100 }),
                total: faker.number.int({ min: 100, max: 1000 }),
              },
            } : undefined,
          },
        })
      )
    );

    // Generate ItemRecords using existing users
    await Promise.all(
      items.map((item) =>
        prisma.itemRecord.create({
          data: {
            loaned: faker.datatype.boolean(),
            actionByUserId: faker.helpers.arrayElement(users).id,
            itemId: item.id,
            notes: faker.datatype.boolean(0.7) ? faker.lorem.paragraph() : null,
            quantity: faker.number.int({ min: 1, max: 10 }),
          },
        })
      )
    );

    console.log(`Test data generated successfully using ${users.length} existing user(s).`);
  } catch (error) {
    console.error('Error generating test data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

generateTestData();
