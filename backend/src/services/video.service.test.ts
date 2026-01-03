import { expect, test, describe, mock } from "bun:test";
import { adjustSubtitleTimestamps } from "./video.service";
import fs from "fs";

describe("adjustSubtitleTimestamps", () => {
    test("adjusts timestamps correctly for HH:MM:SS format", async () => {
        const input = "00:01:30.000 --> 00:01:35.000\nHello";
        const startTime = "00:01:00";

        mock.module("fs", () => ({
            promises: {
                readFile: async () => input,
                writeFile: async (path: string, content: string) => {
                    expect(content).toContain("00:00:30.000 --> 00:00:35.000");
                }
            }
        }));

        await adjustSubtitleTimestamps("mock.vtt", "output.vtt", startTime);
    });

    test("adjusts timestamps correctly for MM:SS format", async () => {
        const input = "01:30.000 --> 01:35.000\nHello";
        const startTime = "01:00";

        // Reset mock for this test
        mock.module("fs", () => ({
            promises: {
                readFile: async () => input,
                writeFile: async (path: string, content: string) => {
                    expect(content).toContain("00:00:30.000 --> 00:00:35.000");
                }
            }
        }));

        await adjustSubtitleTimestamps("mock.vtt", "output.vtt", startTime);
    });
});
