/**
 * Notification Center component for displaying system notifications and alerts.
 *
 * This component provides a bell-icon popover interface for viewing and managing
 * notifications. It displays a badge with unread count and auto-marks notifications
 * as read when the popover opens.
 *
 * Notification Types:
 * - **Success**: Green checkmark (data upload, export completion, etc.)
 * - **Error**: Red alert circle (API failures, validation errors)
 * - **Warning**: Amber triangle (non-critical issues, deprecation notices)
 * - **Info**: Cyan info circle (general information, tips)
 *
 * Features:
 * - Unread count badge on bell icon (red circle with count)
 * - Auto-mark as read on popover open
 * - Individual notification dismissal (hover X button)
 * - Clear all notifications button
 * - Relative timestamps ("Just now", "5m", "2h", "3d")
 * - Type-specific color-coded icons
 * - Scrollable notification list (max 320px)
 * - Empty state with centered bell icon
 *
 * Notifications are created by Zustand actions throughout the app and stored
 * in global state with timestamps and read status.
 *
 * @module components/layout/NotificationCenter
 */

import React from 'react';
import { Bell, X, CheckCircle, AlertCircle, Info, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';
import { Button } from '@/components/common';
import type { NotificationItem } from '@/store/slices/uiSlice';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Notification Center component.
 *
 * Renders a bell icon button with notification popover:
 *
 * **Bell Button** (PopoverTrigger):
 * - Secondary variant button
 * - Size: 36x36 px (w-9 h-9, p-0)
 * - Rounded-full (circular)
 * - Bell icon: 16x16 px (w-4 h-4)
 * - Shadow-sm for subtle elevation
 * - **Unread Badge**:
 *   - Positioned absolute: -top-1 -right-1
 *   - Size: 16x16 px (h-4 w-4)
 *   - Background: bg-red-500
 *   - Text: text-[10px] font-bold text-white
 *   - Border: 2px border-background (creates ring effect)
 *   - Content: Count (or "9+" if count > 9)
 *   - Only visible if unreadCount > 0
 *
 * **Popover Content**:
 * - Width: 320px (w-80)
 * - Padding: p-0 (sections manage own padding)
 * - Align: end (right-aligned to button)
 * - Max height: 320px scrollable list
 *
 * **Header** (sticky at top):
 * - Title: "Notifications" (text-xs font-semibold)
 * - Background: bg-muted/30
 * - Border-bottom separator
 * - Padding: p-3
 * - **Clear All Button**:
 *   - Only visible if notifications.length > 0
 *   - Trash2 icon (w-3 h-3)
 *   - Text: "CLEAR ALL" (uppercase, tracking-wide)
 *   - Size: text-[10px]
 *   - Hover: text-destructive
 *   - Calls: clearAllNotifications()
 *
 * **Notifications List**:
 * - Max height: 320px with overflow-y-auto
 * - Padding: p-1 (outer container)
 * - Space-y-0.5 between items
 *
 * **Individual Notification Card**:
 * - Layout: Flex row with gap-3
 * - Padding: p-2.5
 * - Rounded-md
 * - **Unread state**: bg-accent/30 (highlighted)
 * - **Read state**: bg-transparent
 * - Hover: bg-accent hover:text-accent-foreground
 * - **Icon** (left):
 *   - Size: 14x14 px (w-3.5 h-3.5)
 *   - Color-coded by type:
 *     - Success: text-emerald-500 (CheckCircle)
 *     - Error: text-red-500 (AlertCircle)
 *     - Warning: text-amber-500 (AlertTriangle)
 *     - Info: text-cyan-500 (Info)
 *   - Positioned: shrink-0 mt-0.5 (aligns with first line)
 * - **Content** (center):
 *   - Message: text-sm text-foreground (main text)
 *   - Timestamp: text-[10px] text-muted-foreground (relative time)
 *   - Flex-1 min-w-0 (allows truncation)
 *   - Padding-right: pr-6 (space for X button)
 * - **Dismiss Button** (right):
 *   - X icon: w-3 h-3
 *   - Positioned: absolute right-2 top-2
 *   - Opacity: 0 (invisible by default)
 *   - Group-hover: opacity-100 (reveal on card hover)
 *   - Hover: bg-destructive/10 hover:text-destructive
 *   - Rounded-md
 *   - Calls: clearNotification(notification.id)
 *
 * **Empty State**:
 * - Centered layout (py-8 px-4)
 * - Bell icon: w-8 h-8 text-muted-foreground/20 (large, faded)
 * - Text: "No notifications" (text-xs text-muted-foreground)
 *
 * **Auto-Mark Read Logic**:
 * - useEffect watches `open` state
 * - On popover open (open=true):
 *   - Filters unread notifications
 *   - Calls markNotificationRead(id) for each
 *   - Batch updates unread status
 * - Result: Badge count drops to 0 when opened
 * - User sees notifications highlighted (unread background)
 * - Subsequent opens show no highlights
 *
 * **Relative Timestamp Logic**:
 * - getTimeAgo(date): Calculates time difference from now
 * - < 1 minute: "Just now"
 * - < 60 minutes: "{minutes}m" (e.g., "5m")
 * - < 24 hours: "{hours}h" (e.g., "2h")
 * - >= 24 hours: "{days}d" (e.g., "3d")
 * - No absolute dates (keeps UI compact)
 *
 * **Icon Selection**:
 * - getIcon(type): Returns appropriate icon component
 * - Switch statement on notification.type
 * - Each icon has consistent size and type-specific color
 * - Icons visually distinguish notification importance
 *
 * **State Management**:
 * - **Zustand Store**:
 *   - `notifications`: Array<NotificationItem>
 *     - id: string (UUID)
 *     - type: 'success' | 'error' | 'warning' | 'info'
 *     - message: string
 *     - timestamp: Date
 *     - read: boolean
 *   - `markNotificationRead(id)`: Sets read=true
 *   - `clearNotification(id)`: Removes notification
 *   - `clearAllNotifications()`: Removes all
 * - **Local State**:
 *   - `open`: Popover open/closed state
 *   - Managed by Popover component
 *
 * **Notification Creation**:
 * - Created by `setNotification(message, type)` action
 * - Called throughout app: upload success, export completion, errors, etc.
 * - Automatically assigned UUID and timestamp
 * - Defaults to unread (read=false)
 *
 * **Persistence**:
 * - Notifications cleared on app reload (session-only)
 * - No localStorage persistence
 * - Prevents stale notifications accumulating
 *
 * @returns {JSX.Element} Notification center popover
 *
 * @example
 * ```tsx
 * // Rendered in TopBar
 * <NotificationCenter />
 * ```
 */
export const NotificationCenter: React.FC = () => {
    const notifications = useStore((state) => state.notifications);
    const markNotificationRead = useStore((state) => state.markNotificationRead);
    const clearNotification = useStore((state) => state.clearNotification);
    const clearAllNotifications = useStore((state) => state.clearAllNotifications);

    const unreadCount = notifications.filter(n => !n.read).length;
    const [open, setOpen] = React.useState(false);

    // Mark all as read when opening
    React.useEffect(() => {
        if (open) {
            const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
            if (unreadIds.length > 0) {
                // Batch updates or just loop (since store updates are sync/fast usually)
                unreadIds.forEach(id => markNotificationRead(id));
            }
        }
    }, [open, notifications, markNotificationRead]);

    const getIcon = (type: NotificationItem['type']) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
            case 'error':
                return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
            case 'warning':
                return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
            case 'info':
                return <Info className="w-3.5 h-3.5 text-cyan-500" />;
        }
    };

    const getTimeAgo = (date: Date) => {
        const now = new Date();
        const diffMs = now.getTime() - new Date(date).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        return `${diffDays}d`;
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className="relative w-8 h-8 p-0 rounded-lg flex items-center justify-center transition-colors duration-150"
                >
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-background">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                    <h3 className="font-semibold text-xs text-foreground">Notifications</h3>
                    {notifications.length > 0 && (
                        <button
                            onClick={clearAllNotifications}
                            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors uppercase font-medium tracking-wide"
                        >
                            <Trash2 className="w-3 h-3" />
                            Clear all
                        </button>
                    )}
                </div>

                {/* Notifications List */}
                <div className="max-h-[320px] overflow-y-auto p-1">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                            <Bell className="w-8 h-8 text-muted-foreground/20 mb-2" />
                            <p className="text-xs text-muted-foreground">No notifications</p>
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={cn(
                                        "flex items-start gap-3 p-2.5 rounded-md transition-colors group relative",
                                        "hover:bg-accent hover:text-accent-foreground",
                                        !notification.read ? "bg-accent/30" : "bg-transparent"
                                    )}
                                >
                                    <div className="shrink-0 mt-0.5">
                                        {getIcon(notification.type)}
                                    </div>

                                    <div className="flex-1 min-w-0 pr-6">
                                        <p className="text-sm text-foreground leading-snug">{notification.message}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                                            {getTimeAgo(notification.timestamp)}
                                        </p>
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            clearNotification(notification.id);
                                        }}
                                        className="absolute right-2 top-2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
