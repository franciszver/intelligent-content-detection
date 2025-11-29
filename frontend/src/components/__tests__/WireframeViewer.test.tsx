import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WireframeViewer } from '../WireframeViewer';

describe('WireframeViewer', () => {
  it('should render wireframe image', () => {
    const wireframeBase64 = 'dGVzdC1iYXNlNjQ='; // test-base64
    render(<WireframeViewer wireframeBase64={wireframeBase64} />);

    const img = screen.getByAltText('Wireframe');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', `data:image/png;base64,${wireframeBase64}`);
  });

  it('should display zones when provided', () => {
    const wireframeBase64 = 'dGVzdC1iYXNlNjQ=';
    const zones = [
      {
        zone_type: 'shingles',
        bbox: [0, 0, 100, 100],
        confidence: 0.95,
      },
      {
        zone_type: 'gutter',
        bbox: [100, 0, 200, 50],
        confidence: 0.85,
      },
    ];

    render(<WireframeViewer wireframeBase64={wireframeBase64} zones={zones} />);

    expect(screen.getByText(/Roof Zones Detected/i)).toBeInTheDocument();
    expect(screen.getByText(/shingles/i)).toBeInTheDocument();
    expect(screen.getByText(/gutter/i)).toBeInTheDocument();
    expect(screen.getByText(/95%/i)).toBeInTheDocument();
    expect(screen.getByText(/85%/i)).toBeInTheDocument();
  });

  it('should not display zones section when zones are empty', () => {
    const wireframeBase64 = 'dGVzdC1iYXNlNjQ=';
    render(<WireframeViewer wireframeBase64={wireframeBase64} zones={[]} />);

    expect(screen.queryByText(/Roof Zones Detected/i)).not.toBeInTheDocument();
  });

  it('should handle zones without confidence', () => {
    const wireframeBase64 = 'dGVzdC1iYXNlNjQ=';
    const zones = [
      {
        zone_type: 'shingles',
        bbox: [0, 0, 100, 100],
      },
    ];

    render(<WireframeViewer wireframeBase64={wireframeBase64} zones={zones} />);

    expect(screen.getByText(/shingles/i)).toBeInTheDocument();
    expect(screen.getByText(/N\/A/i)).toBeInTheDocument();
  });
});

