import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoUpload } from '../PhotoUpload';

describe('PhotoUpload', () => {
  it('should render upload area', () => {
    const onFileSelect = vi.fn();
    render(<PhotoUpload onFileSelect={onFileSelect} />);

    expect(screen.getByText(/Click to upload/i)).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
  });

  it('should call onFileSelect when file is selected via input', async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    render(<PhotoUpload onFileSelect={onFileSelect} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    await user.upload(input, file);
    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledWith(file);
    });
  });

  it('should handle drag and drop', async () => {
    const onFileSelect = vi.fn();
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    render(<PhotoUpload onFileSelect={onFileSelect} />);

    const dropZone = screen.getByText(/Click to upload/i).closest('div');
    expect(dropZone).toBeInTheDocument();

    if (dropZone) {
      // Simulate drag over
      fireEvent.dragOver(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });

      // Simulate drop
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(file);
      });
    }
  });

  it('should not call onFileSelect for non-image files', async () => {
    const onFileSelect = vi.fn();
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    render(<PhotoUpload onFileSelect={onFileSelect} />);

    const dropZone = screen.getByText(/Click to upload/i).closest('div');
    expect(dropZone).toBeInTheDocument();

    if (dropZone) {
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(onFileSelect).not.toHaveBeenCalled();
      });
    }
  });

  it('should be disabled when disabled prop is true', () => {
    const onFileSelect = vi.fn();
    render(<PhotoUpload onFileSelect={onFileSelect} disabled />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('should not handle drop when disabled', async () => {
    const onFileSelect = vi.fn();
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    render(<PhotoUpload onFileSelect={onFileSelect} disabled />);

    const dropZone = screen.getByText(/Click to upload/i).closest('div');
    expect(dropZone).toBeInTheDocument();

    if (dropZone) {
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(onFileSelect).not.toHaveBeenCalled();
      });
    }
  });
});

