import { describe, it, expect } from 'vitest';
import { formatBytes, formatRelative } from './format';

describe('formatBytes', () => {
  it('renders zero as a dash so empty folders read cleanly', () => {
    expect(formatBytes(0)).toBe('—');
  });
  it('renders bytes', () => { expect(formatBytes(512)).toBe('512 B'); });
  it('renders kilobytes with one decimal', () => { expect(formatBytes(2048)).toBe('2.0 KB'); });
  it('renders megabytes', () => { expect(formatBytes(5_242_880)).toBe('5.0 MB'); });
  it('renders gigabytes', () => { expect(formatBytes(3_221_225_472)).toBe('3.0 GB'); });
});

describe('formatRelative', () => {
  it('renders very recent times as "just now"', () => {
    expect(formatRelative(new Date().toISOString())).toBe('just now');
  });
  it('renders minutes ago', () => {
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
  });
  it('renders hours ago', () => {
    expect(formatRelative(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 h ago');
  });
  it('renders days ago', () => {
    expect(formatRelative(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2 d ago');
  });
});
