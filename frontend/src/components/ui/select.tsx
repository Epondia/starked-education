'use client';

import * as React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  onValueChange?: (value: string) => void;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', onChange, onValueChange, ...props }, ref) => (
    <select
      ref={ref}
      className={`flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onChange={(e) => {
        onChange?.(e);
        onValueChange?.(e.target.value);
      }}
      {...props}
    />
  )
);
Select.displayName = 'Select';

export const SelectTrigger = Select;
export const SelectValue = Select;

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const SelectContent: React.FC<SelectContentProps> = ({ children, ...props }) => (
  <div {...props}>{children}</div>
);

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const SelectItem: React.FC<SelectItemProps> = ({ value, children, ...props }) => (
  <div data-value={value} {...props}>{children}</div>
);
