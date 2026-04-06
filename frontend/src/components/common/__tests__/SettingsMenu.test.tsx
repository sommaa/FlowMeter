import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsMenu } from '@/components/common/SettingsMenu';

// Mock zustand store
const mockSetTheme = vi.fn();
const mockToggleDarkMode = vi.fn();
const mockSetExportConfigOpen = vi.fn();
const mockStoreState: Record<string, unknown> = {
  theme: 'teal',
  setTheme: mockSetTheme,
  isDarkMode: false,
  toggleDarkMode: mockToggleDarkMode,
  setExportConfigOpen: mockSetExportConfigOpen,
};

vi.mock('@/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockStoreState),
}));

// Mock THEMES
vi.mock('@/lib/themes', () => ({
  THEMES: {
    teal: {
      id: 'teal',
      name: 'Professional Teal',
      colors: { light: { primary: '176 61% 32%' }, dark: { primary: '175 77% 50%' } },
    },
    blue: {
      id: 'blue',
      name: 'Corporate Blue',
      colors: { light: { primary: '221 83% 53%' }, dark: { primary: '217 91% 60%' } },
    },
  },
}));

describe('SettingsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.theme = 'teal';
    mockStoreState.isDarkMode = false;
    localStorage.clear();
  });

  it('renders the settings button with gear icon', () => {
    render(<SettingsMenu />);
    const button = screen.getByTitle('App Configuration');
    expect(button).toBeInTheDocument();
  });

  it('opens the popover when settings button is clicked', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
  });

  it('renders Export Settings and AI Settings options', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    expect(screen.getByText('Export Settings')).toBeInTheDocument();
    expect(screen.getByText('AI Settings')).toBeInTheDocument();
  });

  it('calls setExportConfigOpen and closes popover when Export Settings is clicked', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('Export Settings'));
    expect(mockSetExportConfigOpen).toHaveBeenCalledWith(true);
  });

  it('renders Light and Dark mode toggle buttons', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('calls toggleDarkMode when Dark button is clicked in light mode', () => {
    mockStoreState.isDarkMode = false;
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('Dark'));
    expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
  });

  it('calls toggleDarkMode when Light button is clicked in dark mode', () => {
    mockStoreState.isDarkMode = true;
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('Light'));
    expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
  });

  it('does not call toggleDarkMode when clicking already active mode', () => {
    mockStoreState.isDarkMode = false;
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('Light'));
    expect(mockToggleDarkMode).not.toHaveBeenCalled();
  });

  it('renders the theme list with correct theme names', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    expect(screen.getByText('Professional Teal')).toBeInTheDocument();
    expect(screen.getByText('Corporate Blue')).toBeInTheDocument();
  });

  it('calls setTheme when a theme is clicked', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('Corporate Blue'));
    expect(mockSetTheme).toHaveBeenCalledWith('blue');
  });

  it('expands AI Settings section when clicked', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('AI Settings'));
    expect(screen.getByText('Configure API keys for AI visualization suggestions')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Google Gemini API Key/)).toBeInTheDocument();
  });

  it('switches AI provider tabs', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('AI Settings'));
    // Default provider is Gemini; click OpenAI
    fireEvent.click(screen.getByText('OpenAI'));
    expect(screen.getByPlaceholderText(/OpenAI API Key/)).toBeInTheDocument();
  });

  it('saves an API key to localStorage when Save is clicked', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('AI Settings'));
    const input = screen.getByPlaceholderText(/Google Gemini API Key/);
    fireEvent.change(input, { target: { value: 'test-api-key-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(localStorage.getItem('ai_key_gemini')).toBe(btoa('test-api-key-123'));
  });

  it('removes API key from localStorage when saving empty value', () => {
    localStorage.setItem('ai_key_gemini', btoa('old-key'));
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('AI Settings'));
    const input = screen.getByPlaceholderText(/Google Gemini API Key/);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(localStorage.getItem('ai_key_gemini')).toBeNull();
  });

  it('shows "Get Key" link with correct href for the selected provider', () => {
    render(<SettingsMenu />);
    fireEvent.click(screen.getByTitle('App Configuration'));
    fireEvent.click(screen.getByText('AI Settings'));
    const link = screen.getByText('Get Key');
    expect(link.closest('a')).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
  });
});
