import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColorEnhancedViewer } from '../ColorEnhancedViewer';

describe('ColorEnhancedViewer', () => {
  it('should render enhanced image', () => {
    const enhancedImageBase64 = 'dGVzdC1iYXNlNjQ='; // test-base64
    render(<ColorEnhancedViewer enhancedImageBase64={enhancedImageBase64} />);

    const img = screen.getByAltText('Color Enhanced');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', `data:image/jpeg;base64,${enhancedImageBase64}`);
  });

  it('should display enhancement description', () => {
    const enhancedImageBase64 = 'dGVzdC1iYXNlNjQ=';
    render(<ColorEnhancedViewer enhancedImageBase64={enhancedImageBase64} />);

    expect(
      screen.getByText(/histogram equalization and CLAHE/i)
    ).toBeInTheDocument();
  });
});

