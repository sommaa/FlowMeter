import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommentEditorModal } from '@/components/common/CommentEditorModal';

describe('CommentEditorModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    initialComments: 'Initial comment text',
    onApply: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog title and description when open', () => {
    render(<CommentEditorModal {...defaultProps} />);
    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('Add detailed notes and observations for the report')).toBeInTheDocument();
  });

  it('does not render dialog content when isOpen is false', () => {
    render(<CommentEditorModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Comments')).not.toBeInTheDocument();
  });

  it('renders the textarea with initialComments', () => {
    render(<CommentEditorModal {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Enter your detailed comments here...');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Initial comment text');
  });

  it('renders Cancel and Save Comments buttons', () => {
    render(<CommentEditorModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Comments' })).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<CommentEditorModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onApply with the current text and onClose when Save Comments is clicked', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <CommentEditorModal
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Comments' }));
    expect(onApply).toHaveBeenCalledWith('Initial comment text');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows editing the textarea and saves edited text', () => {
    const onApply = vi.fn();
    render(<CommentEditorModal {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText('Enter your detailed comments here...');
    fireEvent.change(textarea, { target: { value: 'Updated comment' } });
    expect(textarea).toHaveValue('Updated comment');
    fireEvent.click(screen.getByRole('button', { name: 'Save Comments' }));
    expect(onApply).toHaveBeenCalledWith('Updated comment');
  });

  it('resets local state to initialComments when modal reopens', () => {
    const { rerender } = render(
      <CommentEditorModal {...defaultProps} isOpen={true} initialComments="First" />
    );
    const textarea = screen.getByPlaceholderText('Enter your detailed comments here...');
    fireEvent.change(textarea, { target: { value: 'Edited' } });
    expect(textarea).toHaveValue('Edited');

    // Close and reopen with new initialComments
    rerender(
      <CommentEditorModal {...defaultProps} isOpen={false} initialComments="Second" />
    );
    rerender(
      <CommentEditorModal {...defaultProps} isOpen={true} initialComments="Second" />
    );
    const reopenedTextarea = screen.getByPlaceholderText('Enter your detailed comments here...');
    expect(reopenedTextarea).toHaveValue('Second');
  });

  it('renders the textarea with spellCheck enabled', () => {
    render(<CommentEditorModal {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Enter your detailed comments here...');
    expect(textarea).toHaveAttribute('spellcheck', 'true');
  });

  it('handles empty initial comments', () => {
    render(<CommentEditorModal {...defaultProps} initialComments="" />);
    const textarea = screen.getByPlaceholderText('Enter your detailed comments here...');
    expect(textarea).toHaveValue('');
  });

  it('renders the MessageSquare icon in the dialog header', () => {
    render(<CommentEditorModal {...defaultProps} />);
    // The icon is rendered within the dialog title area via portal
    const icon = document.body.querySelector('.text-muted-foreground');
    expect(icon).toBeTruthy();
  });
});
