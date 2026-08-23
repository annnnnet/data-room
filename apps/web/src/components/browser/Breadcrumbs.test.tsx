import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './Breadcrumbs';

const chain = [
  { id: 'root', name: 'Room Root' },
  { id: 'a', name: 'Folder A' },
  { id: 'b', name: 'Folder B' },
];

describe('Breadcrumbs', () => {
  it('renders ancestors as links and the current folder as plain text', () => {
    render(<Breadcrumbs basePath="/r/room-1/f" breadcrumbs={chain} />);

    const rootLink = screen.getByRole('link', { name: 'Room Root' });
    expect(rootLink).toHaveAttribute('href', '/r/room-1/f/root');

    const ancestorLink = screen.getByRole('link', { name: 'Folder A' });
    expect(ancestorLink).toHaveAttribute('href', '/r/room-1/f/a');

    // The current crumb renders as a disabled, non-navigable span — never
    // an anchor — even though the design system marks it `role="link"` for
    // consistent breadcrumb semantics.
    const current = screen.getByText('Folder B');
    expect(current.tagName).not.toBe('A');
    expect(current).not.toHaveAttribute('href');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders nothing for an empty chain', () => {
    const { container } = render(<Breadcrumbs basePath="/r/room-1/f" breadcrumbs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
