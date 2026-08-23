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
import { buildBreadcrumbLayout, type Crumb } from './breadcrumb-utils';

export type { Crumb };

/**
 * `breadcrumbs` is the full chain from the data room root down to and
 * including the node currently being viewed (`NodeDetail.breadcrumbs`).
 * With more than four entries the middle collapses into an overflow menu
 * so the bar never wraps or grows past its row.
 *
 * Per-item widths are capped responsively (tighter below `sm`) and the
 * whole row scrolls within its own container rather than the caps ever
 * being able to push the page wider than the viewport — two items at
 * their `sm`-and-up caps alone would exceed a 375px screen.
 *
 * `basePath` is the folder route prefix each ancestor links under (e.g.
 * `/r/room-1/f` for the owner view, `/s/token/f` for a share) — the caller
 * decides it so this component doesn't need to know which route it's in.
 */
export function Breadcrumbs({ basePath, breadcrumbs }: { basePath: string; breadcrumbs: Crumb[] }) {
  const { first, middle, visible, current, collapsed } = buildBreadcrumbLayout(breadcrumbs);
  if (!current) return null;

  const ancestorMaxWidth = 'max-w-[6rem] sm:max-w-[10rem]';
  const currentMaxWidth = 'max-w-[7rem] sm:max-w-[16rem]';

  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <Breadcrumb className="w-max min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {first && (
            <>
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbLink
                  render={<Link href={`${basePath}/${first.id}`} />}
                  className={`${ancestorMaxWidth} truncate`}
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
                        render={<Link href={`${basePath}/${crumb.id}`} />}
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
                  render={<Link href={`${basePath}/${crumb.id}`} />}
                  className={`${ancestorMaxWidth} truncate`}
                  title={crumb.name}
                >
                  {crumb.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          ))}

          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className={`${currentMaxWidth} truncate`} title={current.name}>
              {current.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
