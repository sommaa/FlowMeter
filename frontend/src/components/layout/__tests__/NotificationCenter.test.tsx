import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationCenter } from '@/components/layout/NotificationCenter';

// Mock zustand store
const mockMarkNotificationRead = vi.fn();
const mockClearNotification = vi.fn();
const mockClearAllNotifications = vi.fn();
const mockStoreState: Record<string, unknown> = {
  notifications: [],
  markNotificationRead: mockMarkNotificationRead,
  clearNotification: mockClearNotification,
  clearAllNotifications: mockClearAllNotifications,
};

vi.mock('@/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockStoreState),
}));

const createNotification = (overrides = {}) => ({
  id: 'notif-1',
  type: 'info' as const,
  message: 'Test notification',
  timestamp: new Date(),
  read: false,
  ...overrides,
});

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.notifications = [];
  });

  it('renders the bell button', () => {
    render(<NotificationCenter />);
    // The button is a popover trigger; find it by its implicit role
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show unread badge when there are no notifications', () => {
    render(<NotificationCenter />);
    // Badge text like "1", "2", etc. should not be present
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('9+')).not.toBeInTheDocument();
  });

  it('shows unread count badge when there are unread notifications', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1', read: false }),
      createNotification({ id: '2', read: false }),
    ];
    render(<NotificationCenter />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows "9+" when unread count exceeds 9', () => {
    const notifications = Array.from({ length: 12 }, (_, i) =>
      createNotification({ id: `notif-${i}`, read: false })
    );
    mockStoreState.notifications = notifications;
    render(<NotificationCenter />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('does not count read notifications in the badge', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1', read: true }),
      createNotification({ id: '2', read: false }),
    ];
    render(<NotificationCenter />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows empty state when popover is opened with no notifications', () => {
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders notification messages when popover is opened', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1', message: 'Upload completed successfully' }),
      createNotification({ id: '2', message: 'Export failed', type: 'error' }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(screen.getByText('Upload completed successfully')).toBeInTheDocument();
    expect(screen.getByText('Export failed')).toBeInTheDocument();
  });

  it('shows "Clear all" button when notifications exist', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1' }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('does not show "Clear all" button when no notifications exist', () => {
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('calls clearAllNotifications when "Clear all" is clicked', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1' }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    fireEvent.click(screen.getByText('Clear all'));
    expect(mockClearAllNotifications).toHaveBeenCalledTimes(1);
  });

  it('calls markNotificationRead for unread notifications when popover opens', () => {
    mockStoreState.notifications = [
      createNotification({ id: 'a', read: false }),
      createNotification({ id: 'b', read: true }),
      createNotification({ id: 'c', read: false }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    // Should mark 'a' and 'c' as read
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('a');
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('c');
    expect(mockMarkNotificationRead).not.toHaveBeenCalledWith('b');
  });

  it('displays relative timestamp "Just now" for recent notifications', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1', timestamp: new Date() }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('displays relative timestamp in minutes for older notifications', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    mockStoreState.notifications = [
      createNotification({ id: '1', timestamp: tenMinutesAgo }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    expect(screen.getByText('10m')).toBeInTheDocument();
  });

  it('renders different icons for different notification types', () => {
    mockStoreState.notifications = [
      createNotification({ id: '1', type: 'success', message: 'Success msg' }),
      createNotification({ id: '2', type: 'error', message: 'Error msg' }),
      createNotification({ id: '3', type: 'warning', message: 'Warning msg' }),
      createNotification({ id: '4', type: 'info', message: 'Info msg' }),
    ];
    render(<NotificationCenter />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    // Check that type-specific color classes exist in the rendered output
    const popoverContent = document.body;
    expect(popoverContent.querySelector('.text-emerald-500')).toBeTruthy(); // success
    expect(popoverContent.querySelector('.text-red-500')).toBeTruthy(); // error
    expect(popoverContent.querySelector('.text-amber-500')).toBeTruthy(); // warning
    expect(popoverContent.querySelector('.text-cyan-500')).toBeTruthy(); // info
  });
});
