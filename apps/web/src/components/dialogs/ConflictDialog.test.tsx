import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConflictDialog } from './ConflictDialog';

afterEach(() => {
  cleanup();
});

describe('ConflictDialog', () => {
  it('resolves Skip as SKIP, not applied to all', () => {
    const onResolve = vi.fn();
    render(
      <ConflictDialog
        fileName="report.pdf"
        suggestedName="report (2).pdf"
        remainingCount={1}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onResolve).toHaveBeenCalledWith('SKIP', false);
  });

  it('resolves Replace as REPLACE', () => {
    const onResolve = vi.fn();
    render(
      <ConflictDialog
        fileName="report.pdf"
        suggestedName="report (2).pdf"
        remainingCount={1}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onResolve).toHaveBeenCalledWith('REPLACE', false);
  });

  it('resolves Keep both as KEEP_BOTH and shows the suggested name', () => {
    const onResolve = vi.fn();
    render(
      <ConflictDialog
        fileName="report.pdf"
        suggestedName="report (2).pdf"
        remainingCount={1}
        onResolve={onResolve}
      />,
    );

    expect(screen.getByText(/report \(2\)\.pdf/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep both' }));
    expect(onResolve).toHaveBeenCalledWith('KEEP_BOTH', false);
  });

  it('fans "apply to all" out to the remaining conflicts when checked', () => {
    const onResolve = vi.fn();
    render(
      <ConflictDialog
        fileName="report.pdf"
        suggestedName="report (2).pdf"
        remainingCount={3}
        onResolve={onResolve}
      />,
    );

    // Copy names the *other* conflicts, not the one on screen — 3 total minus this one.
    expect(screen.getByText(/Apply to all 2 remaining conflicts/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep both' }));

    expect(onResolve).toHaveBeenCalledWith('KEEP_BOTH', true);
  });

  it('does not offer "apply to all" when this is the only conflict', () => {
    render(
      <ConflictDialog
        fileName="report.pdf"
        suggestedName="report (2).pdf"
        remainingCount={1}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
