import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlaybackSources, readStoredPlaybackSources } from '../dist/catalog/playback-sources.js';

test('validates direct and provider playback sources with a narrow allowlisted shape', () => {
  assert.deepEqual(parsePlaybackSources([
    { id: 'primary', label: 'Primary', kind: 'direct', url: 'https://media.example.test/movie.m3u8?token=sample' },
    { id: 'external', label: 'External', kind: 'provider', providerId: 'example-source', contentId: 'film/123' },
  ]), [
    { id: 'primary', label: 'Primary', kind: 'direct', url: 'https://media.example.test/movie.m3u8?token=sample' },
    { id: 'external', label: 'External', kind: 'provider', providerId: 'example-source', contentId: 'film/123' },
  ]);
});

test('rejects non-HTTPS credentials, javascript URLs, duplicate IDs, extra executable fields and oversized lists', () => {
  for (const value of [
    [{ id: 'x', label: 'X', kind: 'direct', url: 'javascript:alert(1)' }],
    [{ id: 'x', label: 'X', kind: 'direct', url: 'https://user:pass@media.example.test/movie.mp4' }],
    [{ id: 'x', label: 'X', kind: 'provider', providerId: 'source', contentId: '1', script: 'alert(1)' }],
    [
      { id: 'x', label: 'One', kind: 'direct', url: 'https://media.example.test/1.mp4' },
      { id: 'x', label: 'Two', kind: 'direct', url: 'https://media.example.test/2.mp4' },
    ],
    Array.from({ length: 21 }, (_, i) => ({ id: 'src' + i, label: 'Source ' + i, kind: 'direct', url: 'https://media.example.test/' + i + '.mp4' })),
  ]) {
    assert.throws(() => parsePlaybackSources(value));
  }
});

test('legacy or invalid stored metadata safely resolves to an empty source list', () => {
  assert.deepEqual(readStoredPlaybackSources(null), []);
  assert.deepEqual(readStoredPlaybackSources({ untrusted: true }), []);
  assert.deepEqual(readStoredPlaybackSources([{ id: 'x', kind: 'provider', script: 'run this' }]), []);
});
