// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, fireEvent, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import VideoPreview from './VideoPreview';

// Mock dependencies
vi.mock('react-youtube', () => ({
    default: ({ onReady }: any) => {
        // Simulate ready immediately
        setTimeout(() => {
            onReady({
                target: {
                    getDuration: () => 100, // 100 seconds
                    getCurrentTime: () => 10, // 10 seconds
                    seekTo: vi.fn(),
                    playVideo: vi.fn(),
                    pauseVideo: vi.fn(),
                }
            });
        }, 0);
        return <div data-testid="youtube-player">YouTube Player</div>;
    }
}));

vi.mock('@/lib/utils', () => ({
    getVideoId: () => 'test-video-id',
    timeToSeconds: (str: string) => {
        if (str.startsWith('00:00:10')) return 10;
        return 0;
    },
    secondsToTime: (sec: number) => {
        if (Math.abs(sec - 10) < 0.001) return '00:00:10.000';
        return '00:00:00.000';
    },
    cn: (...args: any[]) => args.join(' '),
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, ...props }: any) => (
        <button onClick={onClick} {...props}>{children}</button>
    ),
}));

vi.mock('lucide-react', () => ({
    Timer: () => <span>Timer</span>,
    Scissors: () => <span>Scissors</span>,
    Play: () => <span>Play</span>,
    Pause: () => <span>Pause</span>,
    Info: () => <span>Info</span>,
}));

vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/components/editor/TimelineSlider', () => ({
    TimelineSlider: ({ duration, startTime, endTime }: any) => (
        <div data-testid="timeline-slider">
            Slider Dur: {duration} Start: {startTime} End: {endTime}
        </div>
    ),
}));

vi.mock('@/components/editor/KeyboardShortcutsInfo', () => ({
    KeyboardShortcutsInfo: () => <div data-testid="shortcuts-info">Shortcuts</div>,
}));

describe('VideoPreview', () => {
    const defaultProps = {
        isLoading: false,
        title: 'Test Video',
        url: 'https://youtube.com/watch?v=test',
        startTime: '00:00:00',
        endTime: '00:00:00',
        onSetStartTime: vi.fn(),
        onSetEndTime: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders player and timeline', async () => {
        render(<VideoPreview {...defaultProps} />);
        expect(await screen.findByTestId('youtube-player')).toBeTruthy();
        expect(await screen.findByTestId('timeline-slider')).toBeTruthy();
        expect(screen.getByTestId('shortcuts-info')).toBeTruthy();
    });

    it('buttons trigger set start/end', async () => {
        render(<VideoPreview {...defaultProps} />);
        await screen.findByTestId('youtube-player');
        // Allow onReady mock (setTimeout 0) to attach playerRef
        await new Promise((r) => setTimeout(r, 10));

        const buttons = await screen.findAllByRole('button');
        const startBtn = buttons.find(b => b.textContent?.toLowerCase().includes('set start'));
        const endBtn = buttons.find(b => b.textContent?.toLowerCase().includes('set end'));

        if (startBtn) fireEvent.click(startBtn);
        expect(defaultProps.onSetStartTime).toHaveBeenCalled();

        if (endBtn) fireEvent.click(endBtn);
        expect(defaultProps.onSetEndTime).toHaveBeenCalled();
    });
});
