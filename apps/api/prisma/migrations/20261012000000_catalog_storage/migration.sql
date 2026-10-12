CREATE SCHEMA IF NOT EXISTS "visionhub";

CREATE TYPE "visionhub"."catalog_media_type" AS ENUM ('movie', 'series');

CREATE TABLE "visionhub"."catalog_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "poster_url" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "release_year" INTEGER NOT NULL,
    "media_type" "visionhub"."catalog_media_type" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visionhub"."catalog_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visionhub"."catalog_item_categories" (
    "catalog_item_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    CONSTRAINT "catalog_item_categories_pkey" PRIMARY KEY ("catalog_item_id", "category_id")
);

CREATE TABLE "visionhub"."catalog_episodes" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "video_url" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalog_episodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_categories_name_key"
    ON "visionhub"."catalog_categories"("name");
CREATE INDEX "catalog_items_media_type_release_year_idx"
    ON "visionhub"."catalog_items"("media_type", "release_year");
CREATE INDEX "catalog_items_sort_order_idx"
    ON "visionhub"."catalog_items"("sort_order");
CREATE INDEX "catalog_item_categories_category_id_idx"
    ON "visionhub"."catalog_item_categories"("category_id");
CREATE UNIQUE INDEX "catalog_episodes_series_id_episode_number_key"
    ON "visionhub"."catalog_episodes"("series_id", "episode_number");
CREATE INDEX "catalog_episodes_series_id_idx"
    ON "visionhub"."catalog_episodes"("series_id");

ALTER TABLE "visionhub"."catalog_item_categories"
    ADD CONSTRAINT "catalog_item_categories_catalog_item_id_fkey"
    FOREIGN KEY ("catalog_item_id") REFERENCES "visionhub"."catalog_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visionhub"."catalog_item_categories"
    ADD CONSTRAINT "catalog_item_categories_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "visionhub"."catalog_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visionhub"."catalog_episodes"
    ADD CONSTRAINT "catalog_episodes_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "visionhub"."catalog_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
