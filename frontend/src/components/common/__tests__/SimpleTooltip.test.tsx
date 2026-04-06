import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimpleTooltip } from '@/components/common/SimpleTooltip';

describe('SimpleTooltip', () => {
  it('renders children', () => {
    render(
      <SimpleTooltip content="Tooltip text">
        <button>Hover me</button>
      </SimpleTooltip>
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('does not show tooltip initially', () => {
    render(
      <SimpleTooltip content="Tooltip text">
        <button>Hover me</button>
      </SimpleTooltip>
    );
    expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
  });

  it('shows tooltip on mouse enter', () => {
    render(
      <SimpleTooltip content="Tooltip text">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <SimpleTooltip content="Tooltip text">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
  });

  it('renders tooltip as a portal in document.body', () => {
    render(
      <SimpleTooltip content="Portal tooltip">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByText('Portal tooltip');
    expect(tooltip.parentElement).toBe(document.body);
  });

  it('applies the correct transform for default (right) side', () => {
    render(
      <SimpleTooltip content="Right tooltip">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByText('Right tooltip');
    expect(tooltip.style.transform).toBe('translateY(-50%)');
  });

  it('applies the correct transform for left side', () => {
    render(
      <SimpleTooltip content="Left tooltip" side="left">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByText('Left tooltip');
    expect(tooltip.style.transform).toBe('translate(-100%, -50%)');
  });

  it('applies the correct transform for top side', () => {
    render(
      <SimpleTooltip content="Top tooltip" side="top">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByText('Top tooltip');
    expect(tooltip.style.transform).toBe('translate(-50%, -100%)');
  });

  it('applies the correct transform for bottom side', () => {
    render(
      <SimpleTooltip content="Bottom tooltip" side="bottom">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByText('Bottom tooltip');
    expect(tooltip.style.transform).toBe('translateX(-50%)');
  });

  it('sets high z-index on tooltip', () => {
    render(
      <SimpleTooltip content="High z-index">
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Hover me').parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByText('High z-index');
    expect(tooltip.style.zIndex).toBe('9999');
  });

  it('displays the correct content text', () => {
    render(
      <SimpleTooltip content="Delete visualization">
        <button>Delete</button>
      </SimpleTooltip>
    );

    const trigger = screen.getByText('Delete').parentElement!;
    fireEvent.mouseEnter(trigger);

    expect(screen.getByText('Delete visualization')).toBeInTheDocument();
  });
});
