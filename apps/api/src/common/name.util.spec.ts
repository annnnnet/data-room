import { splitName, nextAvailableName } from './name.util';

describe('splitName', () => {
  it('splits stem and extension', () => {
    expect(splitName('Report.pdf')).toEqual({ stem: 'Report', ext: '.pdf' });
  });

  it('treats a dotfile as all stem', () => {
    expect(splitName('.env')).toEqual({ stem: '.env', ext: '' });
  });

  it('uses only the final extension', () => {
    expect(splitName('archive.tar.gz')).toEqual({ stem: 'archive.tar', ext: '.gz' });
  });

  it('handles a name with no extension', () => {
    expect(splitName('Financials')).toEqual({ stem: 'Financials', ext: '' });
  });
});

describe('nextAvailableName', () => {
  it('returns the original when nothing is taken', () => {
    expect(nextAvailableName('Report.pdf', [])).toBe('Report.pdf');
  });

  it('appends (2) on first collision', () => {
    expect(nextAvailableName('Report.pdf', ['Report.pdf'])).toBe('Report (2).pdf');
  });

  it('skips to the first free index', () => {
    expect(nextAvailableName('Report.pdf', ['Report.pdf', 'Report (2).pdf'])).toBe('Report (3).pdf');
  });

  it('compares case-insensitively, matching the database index', () => {
    expect(nextAvailableName('Report.pdf', ['report.pdf'])).toBe('Report (2).pdf');
  });

  it('works on names without an extension', () => {
    expect(nextAvailableName('Financials', ['Financials'])).toBe('Financials (2)');
  });
});
