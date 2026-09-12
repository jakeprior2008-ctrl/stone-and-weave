import { describe, expect, it } from 'vitest';
import { thumb } from '../src/card.tsx';

describe('thumbnail sizing', () => {
  it('downsizes Squarespace images', () => {
    expect(thumb('https://static1.squarespace.com/a/IMG_0211.jpg?format=1500w')).toBe(
      'https://static1.squarespace.com/a/IMG_0211.jpg?format=500w',
    );
  });

  it('adds a size suffix for Shopify, keeping the cache-busting query', () => {
    expect(thumb('https://cdn.shopify.com/s/files/1/DSC01041.jpg?v=123')).toBe(
      'https://cdn.shopify.com/s/files/1/DSC01041_500x.jpg?v=123',
    );
    expect(thumb('https://cdn.shopify.com/s/files/1/DSC01041.jpg')).toBe(
      'https://cdn.shopify.com/s/files/1/DSC01041_500x.jpg',
    );
  });

  it('leaves an unrecognised host alone rather than mangling it', () => {
    const other = 'https://images.example.com/watch.jpg';
    expect(thumb(other)).toBe(other);
  });
});
