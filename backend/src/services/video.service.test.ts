import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { adjustSubtitleTimestamps } from "./video.service";
import fs from "fs";
import path from "path";
import os from "os";

describe("adjustSubtitleTimestamps", () => {
    let dir: string;
    let inputPath: string;
    let outputPath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-vtt-"));
        inputPath = path.join(dir, "in.vtt");
        outputPath = path.join(dir, "out.vtt");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test("adjusts timestamps correctly for HH:MM:SS format", async () => {
        fs.writeFileSync(inputPath, "00:01:30.000 --> 00:01:35.000\nHello\n", "utf-8");
        await adjustSubtitleTimestamps(inputPath, outputPath, "00:01:00");
        const content = fs.readFileSync(outputPath, "utf-8");
        expect(content).toContain("00:00:30.000 --> 00:00:35.000");
    });

    test("adjusts timestamps correctly for MM:SS format", async () => {
        fs.writeFileSync(inputPath, "01:30.000 --> 01:35.000\nHello\n", "utf-8");
        await adjustSubtitleTimestamps(inputPath, outputPath, "01:00");
        const content = fs.readFileSync(outputPath, "utf-8");
        expect(content).toContain("00:00:30.000 --> 00:00:35.000");
    });
});
