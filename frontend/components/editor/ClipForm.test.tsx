// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import ClipForm from './ClipForm';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Loader2: () => <div data-testid="loader">Loader</div>,
    ArrowDown: () => <div data-testid="arrow-down">Arrow</div>,
    ChevronLeft: () => <span>&lt;</span>,
    ChevronRight: () => <span>&gt;</span>,
    ChevronsLeft: () => <span>&lt;&lt;</span>,
    ChevronsRight: () => <span>&gt;&gt;</span>,
    ArrowRight: () => <span>-&gt;</span>,
}));

// Mock framer-motion/motion
vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock shadcn components
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
    Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
    Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: (props: any) => <input type="checkbox" {...props} />,
}));

describe('ClipForm Smoke Test', () => {
    const defaultProps = {
        url: '',
        setUrl: vi.fn(),
        startTime: '00:00:00',
        setStartTime: vi.fn(),
        endTime: '00:00:00',
        setEndTime: vi.fn(),
        addSubs: false,
        setAddSubs: vi.fn(),
        loading: false,
        handleSubmit: vi.fn(),
        formats: [],
        selectedFormat: '',
        setSelectedFormat: vi.fn(),
        isBulk: false,
        setIsBulk: vi.fn(),
        bulkTimestamps: '',
        setBulkTimestamps: vi.fn(),
    };

    it('renders correctly', () => {
        render(<ClipForm {...defaultProps} />);
        expect(screen.getByPlaceholderText('Paste video url here...')).toBeTruthy();
    });
});
