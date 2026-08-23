'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type Crumb = { id: string; name: string };

/**
 * `breadcrumbs` is the full chain from the data room root down to and
 * including the node currently being viewed (`NodeDetail.breadcrumbs`).
 * With more than four entries the middle collapses into an overflow menu
 * so the bar never wraps or grows past its row.
 */
export function Breadcrumbs({ roomId, breadcrumbs }: { roomId: string; breadcrumbs: Crumb[] }) {
  if (breadcrumbs.length === 0) return null;

  const current = breadcrumbs[breadcrumbs.length - 1];
  const ancestors = breadcrumbs.slice(0, -1);
  const collapsed = breadcrumbs.length > 4;
  const first = ancestors[0];
  const middle = collapsed ? ancestors.slice(1) : [];
  const visible = collapsed ? [] : ancestors.slice(1);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {first && (
          <>
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink
                render={<Link href={`/r/${roomId}/f/${first.id}`} />}
                className="max-w-[10rem] truncate"
                title={first.name}
              >
                {first.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {collapsed && (
          <>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<button type="button" aria-label="Show intermediate folders" />}
                >
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {middle.map((crumb) => (
                    <DropdownMenuItem
                      key={crumb.id}
                      render={<Link href={`/r/${roomId}/f/${crumb.id}`} />}
                    >
                      {crumb.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {visible.map((crumb) => (
          // A Fragment, not a wrapper element: BreadcrumbList is a <ul>, so
          // its children must be <li> (BreadcrumbItem/BreadcrumbSeparator)
          // siblings, not nested inside another element.
          <Fragment key={crumb.id}>
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink
                render={<Link href={`/r/${roomId}/f/${crumb.id}`} />}
                className="max-w-[10rem] truncate"
                title={crumb.name}
              >
                {crumb.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}

        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="max-w-[16rem] truncate" title={current.name}>
            {current.name}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
