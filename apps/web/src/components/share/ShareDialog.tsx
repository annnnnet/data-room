'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LinkTab } from './LinkTab';
import { PeopleTab } from './PeopleTab';

/**
 * Sharing entry point, opened from the Toolbar's "Share" button. A share
 * always targets the folder currently being viewed — its own descendants
 * inherit access through the ancestor-walk the API does, so there's nothing
 * else for this dialog to let the owner pick.
 */
export function ShareDialog({
  node,
  open,
  onOpenChange,
}: {
  node: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate" title={node.name}>
            Share &ldquo;{node.name}&rdquo;
          </DialogTitle>
          <DialogDescription>Anyone given access can only view — never edit.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="link">
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1">
              Link
            </TabsTrigger>
            <TabsTrigger value="people" className="flex-1">
              People
            </TabsTrigger>
          </TabsList>
          <TabsContent value="link" className="pt-4">
            <LinkTab nodeId={node.id} />
          </TabsContent>
          <TabsContent value="people" className="pt-4">
            <PeopleTab nodeId={node.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
