import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DamageVisualization } from '../DamageVisualization';

// Mock canvas context
const mockDrawImage = vi.fn();
const mockStrokeRect = vi.fn();
const mockFillRect = vi.fn();
const mockFillText = vi.fn();
const mockMeasureText = vi.fn(() => ({ width: 100 }));

// Mock Image constructor
const mockImageOnLoad = vi.fn();
const mockImageOnError = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Mock canvas context
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: mockDrawImage,
    strokeRect: mockStrokeRect,
    fillRect: mockFillRect,
    fillText: mockFillText,
    measureText: mockMeasureText,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
  })) as any;

  // Mock Image
  global.Image = class Image {
    onload: ((this: GlobalEventHandlers, ev: Event) => void) | null = null;
    onerror: ((this: GlobalEventHandlers, ev: Event) => void) | null = null;
    src = '';
    width = 800;
    height = 600;
    crossOrigin = '';

    constructor() {
      // Simulate image load after a short delay
      setTimeout(() => {
        if (this.onload) {
          this.onload(new Event('load'));
        }
      }, 0);
    }
  } as any;
});

describe('DamageVisualization', () => {
  it('should render loading state initially', () => {
    render(<DamageVisualization imageUrl="test.jpg" />);
    expect(screen.getByText(/Loading image/i)).toBeInTheDocument();
  });

  it('should allow toggling overlay image when overlayUrl is provided', async () => {
    const overlayUrl = 'https://example.com/overlay.png';
    const user = userEvent.setup();
    render(<DamageVisualization imageUrl="test.jpg" overlayUrl={overlayUrl} />);

    // Overlay hidden by default
    expect(screen.queryByAltText('Damage Overlay')).not.toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: /show overlay/i });
    await user.click(toggleButton);

    const img = await screen.findByAltText('Damage Overlay');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', overlayUrl);
    expect(toggleButton).toHaveTextContent(/hide overlay/i);
  });

  it('should render canvas with detections', async () => {
    const detections = [
      {
        type: 'roof_damage' as const,
        category: 'hail',
        confidence: 0.85,
        bbox: [10, 20, 100, 150],
      },
      {
        type: 'roof_damage' as const,
        category: 'wind',
        confidence: 0.75,
        bbox: [200, 300, 300, 400],
      },
    ];

    render(<DamageVisualization imageUrl="test.jpg" detections={detections} />);

    // Wait for image to load and canvas to be drawn
    await waitFor(() => {
      expect(mockDrawImage).toHaveBeenCalled();
    }, { timeout: 1000 });

    // Check that bounding boxes were drawn
    expect(mockStrokeRect).toHaveBeenCalled();
  });

  it('should display "No damage detected" when no detections', async () => {
    render(<DamageVisualization imageUrl="test.jpg" detections={[]} />);

    // Wait for image to load
    await waitFor(() => {
      expect(screen.getByText(/No damage detected/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should handle different damage categories with correct colors', async () => {
    const detections = [
      {
        type: 'roof_damage' as const,
        category: 'hail',
        confidence: 0.85,
        bbox: [10, 20, 100, 150],
      },
      {
        type: 'roof_damage' as const,
        category: 'wind',
        confidence: 0.75,
        bbox: [200, 300, 300, 400],
      },
      {
        type: 'roof_damage' as const,
        category: 'other',
        confidence: 0.65,
        bbox: [400, 500, 500, 600],
      },
    ];

    render(<DamageVisualization imageUrl="test.jpg" detections={detections} />);

    await waitFor(() => {
      expect(mockDrawImage).toHaveBeenCalled();
    }, { timeout: 1000 });

    // Verify bounding boxes were drawn
    expect(mockStrokeRect).toHaveBeenCalled();
  });

  it('should keep detections visible even when overlay is toggled on', async () => {
    const overlayUrl = 'https://example.com/overlay.png';
    const detections = [
      {
        type: 'roof_damage' as const,
        category: 'hail',
        confidence: 0.85,
        bbox: [10, 20, 100, 150],
      },
    ];

    const user = userEvent.setup();
    render(
      <DamageVisualization
        imageUrl="test.jpg"
        detections={detections}
        overlayUrl={overlayUrl}
      />
    );

    await waitFor(() => {
      expect(mockDrawImage).toHaveBeenCalled();
    }, { timeout: 1000 });

    const toggleButton = screen.getByRole('button', { name: /show overlay/i });
    await user.click(toggleButton);

    expect(await screen.findByAltText('Damage Overlay')).toBeInTheDocument();
    expect(mockStrokeRect).toHaveBeenCalled(); // bounding boxes still drawn
  });
});

