import { describe, expect, test } from "bun:test";
import { detachFdToDevNull, shouldDetachTtyFds } from "./detach-stdin.ts";

describe("shouldDetachTtyFds", () => {
    test("skips on win32 (the mitigation targets POSIX /dev/pts behavior)", () => {
        expect(
            shouldDetachTtyFds({
                platform: "win32",
                stdoutIsTTY: false,
            }),
        ).toBe(false);
    });

    test("skips when stdout is a TTY (no downstream pager to protect)", () => {
        expect(
            shouldDetachTtyFds({
                platform: "linux",
                stdoutIsTTY: true,
            }),
        ).toBe(false);
    });

    test("detaches on linux when stdout is piped", () => {
        expect(
            shouldDetachTtyFds({
                platform: "linux",
                stdoutIsTTY: false,
            }),
        ).toBe(true);
    });

    test("detaches on darwin when stdout is piped", () => {
        expect(
            shouldDetachTtyFds({
                platform: "darwin",
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
