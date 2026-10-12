import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { MOCK_CATALOG, MOCK_EPISODES } from "../src/catalog/mock/catalog.mock-data.js";

const CATEGORY_IDS: Record<string, string> = {
  科幻: "science-fiction",
  剧情: "drama",
  悬疑: "mystery",
  电影: "movie",
  短剧: "short-series",
  纪录: "documentary",
  海洋: "ocean",
};

function categoryId(name: string): string {
  return CATEGORY_IDS[name] ?? "category-" + Buffer.from(name, "utf8").toString("hex");
}

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required before seeding the catalog.");
  }
  return connectionString;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }, { schema: "visionhub" }),
});

async function seed(): Promise<void> {
  const categoryNames = [...new Set(MOCK_CATALOG.flatMap((item) => item.categories))];

  await prisma.$transaction(async (tx) => {
    for (const name of categoryNames) {
      await tx.catalogCategory.upsert({
        where: { name },
        create: { id: categoryId(name), name },
        update: {},
      });
    }

    for (const [sortOrder, item] of MOCK_CATALOG.entries()) {
      const episodes = MOCK_EPISODES[item.id] ?? [];
      const commonData = {
        title: item.title,
        description: item.description,
        posterUrl: item.poster,
        videoUrl: item.videoUrl,
        year: item.year,
        mediaType: item.mediaType,
        sortOrder,
      };
      const categoryLinks = {
        create: item.categories.map((name) => ({
          category: { connect: { id: categoryId(name) } },
        })),
      };
      const episodeRecords = {
        create: episodes.map((episode) => ({
          id: episode.id,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          summary: episode.summary,
          videoUrl: episode.videoUrl,
          durationMinutes: episode.durationMinutes,
        })),
      };

      await tx.catalogItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          ...commonData,
          categoryLinks,
          episodes: episodeRecords,
        },
        update: {
          ...commonData,
          categoryLinks: {
            deleteMany: {},
            ...categoryLinks,
          },
          episodes: {
            deleteMany: {},
            ...episodeRecords,
          },
        },
      });
    }
  });

  const [itemCount, episodeCount, categoryCount] = await Promise.all([
    prisma.catalogItem.count(),
    prisma.catalogEpisode.count(),
    prisma.catalogCategory.count(),
  ]);
  console.log(
    `Catalog seed complete: ${itemCount} items, ${episodeCount} episodes, ${categoryCount} categories.`,
  );
}

void seed()
  .catch((error: unknown) => {
    console.error("Catalog seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
