import { DropdownMenu, DropdownMenuItem, Host, RNHostView, Text } from '@expo/ui/jetpack-compose';
import type { ReactElement } from 'react';

import { useEnvironment } from '@/environment';
import { themes } from '@/theme/tokens';

/** One thing a menu does; a destructive one is brick (Q30). */
export type MenuAction = { label: string; destructive?: boolean; onPress: () => void };

/**
 * Android's own menu (Material 3's `DropdownMenu`, through Expo UI's Compose layer), anchored to the
 * React Native view it wraps. It opens when `open` says so, so the caller chooses how (a long-press);
 * a tap outside or back closes it. Choosing an action closes it first, then runs the action.
 */
export function NativeMenu({
  open,
  onClose,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  actions: MenuAction[];
  children: ReactElement;
}) {
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  return (
    <Host matchContents>
      <DropdownMenu expanded={open} onDismissRequest={onClose} color={theme.surface}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              elementColors={{ textColor: action.destructive ? theme.destructive : theme.text }}
              onClick={() => {
                onClose();
                action.onPress();
              }}
            >
              <DropdownMenuItem.Text>
                <Text>{action.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
