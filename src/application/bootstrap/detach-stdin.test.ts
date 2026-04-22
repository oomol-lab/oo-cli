import { describe, expect, test } from "bun:test";
import { detachFdToDevNull, shouldDetachTtyFds } from "./detach-stdin.ts";

describe("shouldDetachTtyFds", () => {
    test("skips on win32", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["search", "foo", "--json"],
                platform: "win32",
                stderrIsTTY: true,
                stdoutIsTTY: false,
            }),
        ).toBe(false);
    });

    test("skips when stdout is a TTY (running interactively, no pipe to protect)", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["search", "foo"],
                platform: "linux",
                stderrIsTTY: true,
                stdoutIsTTY: true,
            }),
        ).toBe(false);
    });

    test("skips when both stdout and stderr are TTY", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["search", "foo"],
                platform: "linux",
                stderrIsTTY: true,
                stdoutIsTTY: true,
            }),
        ).toBe(false);
    });

    test("skips for skills subcommand (consumes stdin)", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["skills", "install", "my-package"],
                platform: "linux",
                stderrIsTTY: true,
                stdoutIsTTY: false,
            }),
        ).toBe(false);
    });

    test("detaches for a plain piped --json invocation", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["connector", "search", "send mail", "--json"],
                platform: "linux",
                stderrIsTTY: true,
                stdoutIsTTY: false,
            }),
        ).toBe(true);
    });

    test("detaches when both stdout and stderr are pipes (full redirect)", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["search", "foo"],
                platform: "linux",
                stderrIsTTY: false,
                stdoutIsTTY: false,
            }),
        ).toBe(true);
    });

    test("detaches when argv is empty (help/version paths still safe)", () => {
        expect(
            shouldDetachTtyFds({
                argv: [],
                platform: "linux",
                stderrIsTTY: true,
                stdoutIsTTY: false,
            }),
        ).toBe(true);
    });

    test("detaches on darwin for non-interactive subcommands", () => {
        expect(
            shouldDetachTtyFds({
                argv: ["search", "foo", "--json"],
                platform: "darwin",
                stderrIsTTY: true,
                stdoutIsTTY: false,
            }),
        ).toBe(true);
    });
});

describe("detachFdToDevNull", () => {
    test("opens /dev/null, dup2s it onto the target fd, and releases the source fd", () => {
        const closed: number[] = [];
        const dup2Calls: Array<[number, number]> = [];

        detachFdToDevNull(
            {
                openDevNullFd: () => 7,
                dup2: (src, dst) => {
                    dup2Calls.push([src, dst]);
                    return dst;
                },
                closeFd: (fd) => {
                    closed.push(fd);
                },
            },
            0,
        );

        expect(dup2Calls).toEqual([[7, 0]]);
        expect(closed).toEqual([7]);
    });

    test("can target fd 2 just as easily as fd 0", () => {
        const dup2Calls: Array<[number, number]> = [];

        detachFdToDevNull(
            {
                openDevNullFd: () => 9,
                dup2: (src, dst) => {
                    dup2Calls.push([src, dst]);
                    return dst;
                },
                closeFd: () => {},
            },
            2,
        );

        expect(dup2Calls).toEqual([[9, 2]]);
    });

    test("skips the close when /dev/null happened to land on the target fd directly", () => {
        const closed: number[] = [];

        detachFdToDevNull(
            {
                openDevNullFd: () => 0,
                dup2: () => 0,
                closeFd: (fd) => {
                    closed.push(fd);
                },
            },
            0,
        );

        expect(closed).toEqual([]);
    });

    test("swallows errors from openDevNullFd and never touches close", () => {
        const closed: number[] = [];
        const action = (): void => {
            detachFdToDevNull(
                {
                    openDevNullFd: () => {
                        throw new Error("simulated EMFILE");
                    },
                    dup2: () => 0,
                    closeFd: (fd) => {
                        closed.push(fd);
                    },
                },
                0,
            );
        };

        expect(action).not.toThrow();
        expect(closed).toEqual([]);
    });

    test("still releases the source fd when dup2 throws", () => {
        const closed: number[] = [];
        const action = (): void => {
            detachFdToDevNull(
                {
                    openDevNullFd: () => 7,
                    dup2: () => {
                        throw new Error("simulated EBADF");
                    },
                    closeFd: (fd) => {
                        closed.push(fd);
                    },
                },
                0,
            );
        };

        expect(action).not.toThrow();
        expect(closed).toEqual([7]);
    });
});
