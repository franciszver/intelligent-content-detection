import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock FileReader
global.FileReader = class FileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  readyState: number = 0;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
  onloadend: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
  onloadstart: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
  onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
  onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(file: Blob): void {
    setTimeout(() => {
      this.result = `data:image/jpeg;base64,test-base64-data`;
      this.readyState = 2; // DONE
      if (this.onload) {
        this.onload({} as ProgressEvent<FileReader>);
      }
      if (this.onloadend) {
        this.onloadend({} as ProgressEvent<FileReader>);
      }
    }, 0);
  }

  readAsText(file: Blob): void {
    setTimeout(() => {
      this.result = 'test text';
      this.readyState = 2;
      if (this.onload) {
        this.onload({} as ProgressEvent<FileReader>);
      }
      if (this.onloadend) {
        this.onloadend({} as ProgressEvent<FileReader>);
      }
    }, 0);
  }

  readAsArrayBuffer(file: Blob): void {
    setTimeout(() => {
      this.result = new ArrayBuffer(0);
      this.readyState = 2;
      if (this.onload) {
        this.onload({} as ProgressEvent<FileReader>);
      }
      if (this.onloadend) {
        this.onloadend({} as ProgressEvent<FileReader>);
      }
    }, 0);
  }

  abort(): void {
    this.readyState = 2;
    if (this.onabort) {
      this.onabort({} as ProgressEvent<FileReader>);
    }
  }
} as any;

