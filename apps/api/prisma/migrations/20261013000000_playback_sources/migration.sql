ALTER TABLE "visionhub"."catalog_items"
  ALTER COLUMN "video_url" DROP NOT NULL,
  ADD COLUMN "playback_sources" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "visionhub"."catalog_episodes"
  ALTER COLUMN "video_url" DROP NOT NULL,
  ADD COLUMN "playback_sources" JSONB NOT NULL DEFAULT '[]'::jsonb;
