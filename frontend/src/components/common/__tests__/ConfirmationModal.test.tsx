import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';

describe('ConfirmationModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and message when open', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmationModal
        {...defaultProps}
        confirmLabel="Delete"
        cancelLabel="Keep"
      />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmationModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm and onClose when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmationModal
        {...defaultProps}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the alert icon for danger variant', () => {
    render(
      <ConfirmationModal {...defaultProps} variant="danger" />
    );
    // Dialog renders via portal, so query from document.body
    const svgIcon = document.body.querySelector('.text-destructive');
    expect(svgIcon).toBeTruthy();
  });

  it('does not render the alert icon for primary variant', () => {
    render(
      <ConfirmationModal {...defaultProps} variant="primary" />
    );
    const svgIcon = document.body.querySelector('.text-destructive');
    expect(svgIcon).toBeFalsy();
  });
});
