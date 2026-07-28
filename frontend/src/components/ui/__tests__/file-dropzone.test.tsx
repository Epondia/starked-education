import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileDropzone } from '../file-dropzone';

describe('FileDropzone', () => {
  const mockOnFilesSelected = jest.fn();

  beforeEach(() => {
    mockOnFilesSelected.mockClear();
  });

  it('renders the drop zone with default text', () => {
    render(<FileDropzone onFilesSelected={mockOnFilesSelected} />);
    expect(screen.getByText('Drag files here or click to browse')).toBeInTheDocument();
  });

  it('shows "Drop to upload" text on drag over', () => {
    render(<FileDropzone onFilesSelected={mockOnFilesSelected} />);
    const zone = screen.getByRole('button');
    fireEvent.dragOver(zone);
    expect(screen.getByText('Drop to upload')).toBeInTheDocument();
  });

  it('accepts dropped files', () => {
    render(<FileDropzone onFilesSelected={mockOnFilesSelected} />);
    const zone = screen.getByRole('button');
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(mockOnFilesSelected).toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(<FileDropzone onFilesSelected={mockOnFilesSelected} disabled />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('has accessible role and label', () => {
    render(<FileDropzone onFilesSelected={mockOnFilesSelected} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Upload files');
  });

  it('is keyboard accessible', () => {
    render(<FileDropzone onFilesSelected={mockOnFilesSelected} />);
    const zone = screen.getByRole('button');
    expect(zone).toHaveAttribute('tabindex', '0');
  });
});
