import { expect, test, describe } from "bun:test";
import { timeToSeconds, secondsToTime } from "./time";

describe("timeToSeconds", () => {
    test("converts HH:MM:SS to seconds", () => {
        expect(timeToSeconds("01:02:03")).toBe(3723);
    });

    test("converts MM:SS to seconds", () => {
        expect(timeToSeconds("05:30")).toBe(330);
    });

    test("converts SS to seconds", () => {
        expect(timeToSeconds("45")).toBe(45);
    });

    test("handles milliseconds", () => {
        expect(timeToSeconds("00:00:01.500")).toBe(1.5);
    });

    test("handles empty string", () => {
        expect(timeToSeconds("")).toBe(0);
    });
});

describe("secondsToTime", () => {
    test("converts seconds to HH:MM:SS.mmm", () => {
        expect(secondsToTime(3723)).toBe("01:02:03.000");
    });

    test("handles fractional seconds", () => {
        expect(secondsToTime(1.5)).toBe("00:00:01.500");
    });
});
