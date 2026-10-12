import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogService } from '../dist/catalog/catalog.service.js';

const sampleEpisode = {
  id: 'episode-1',
  episodeNumber: 1,
  title: 'Pilot',
  summary: 'First episode',
  videoUrl: 'https://example.com/video.mp4',
  durationMinutes: 20,
};

function createService(item, episodes = []) {
  const calls = [];
  const prisma = {
    catalogItem: { findUnique: async () => item },
    catalogEpisode: {
      findMany: async (query) => {
        calls.push(query);
        return episodes;
      },
    },
  };
  return { service: new CatalogService({ catalog: { pageSize: 8 } }, prisma), calls };
}

test('returns no episodes for a movie without querying episode storage', async () => {
  const { service, calls } = createService({ id: 'movie-1', mediaType: 'movie' });
  assert.deepEqual(await service.getEpisodes('movie-1'), []);
  assert.equal(calls.length, 0);
});

test('returns ordered episode records for a series', async () => {
  const { service, calls } = createService({ id: 'series-1', mediaType: 'series' }, [sampleEpisode]);
  assert.deepEqual(await service.getEpisodes('series-1'), [sampleEpisode]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, { seriesId: 'series-1' });
  assert.deepEqual(calls[0].orderBy, { episodeNumber: 'asc' });
});

test('returns 404 for an unknown catalog item', async () => {
  const { service, calls } = createService(null);
  await assert.rejects(service.getEpisodes('missing'), (error) => error?.getStatus?.() === 404);
  assert.equal(calls.length, 0);
});
