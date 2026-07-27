import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    compareSkillDirectoryContent,
    resolveHostControlState,
} from "./info-inventory.ts";

describe("compareSkillDirectoryContent", () => {
    test("returns equal for identical directory contents", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-equal");
        const left = join(root, "left");
        const right = join(root, "right");

        await mkdir(left, { recursive: true });
        await mkdir(right, { recursive: true });
        await writeFile(join(left, "SKILL.md"), "hello\n");
        await writeFile(join(right, "SKILL.md"), "hello\n");

        const verdict = await compareSkillDirectoryContent(left, right);

        expect(verdict).toBe("equal");
    });

    test("returns different when a file body differs", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-diff");
        const left = join(root, "left");
        const right = join(root, "right");

        await mkdir(left, { recursive: true });
        await mkdir(right, { recursive: true });
        await writeFile(join(left, "SKILL.md"), "hello\n");
        await writeFile(join(right, "SKILL.md"), "goodbye\n");

        const verdict = await compareSkillDirectoryContent(left, right);

        expect(verdict).toBe("different");
    });

    test("returns different when one side is missing a file", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-missing");
        const left = join(root, "left");
        const right = join(root, "right");

        await mkdir(left, { recursive: true });
        await mkdir(right, { recursive: true });
        await writeFile(join(left, "SKILL.md"), "hello\n");
        await writeFile(join(left, "extra.txt"), "extra\n");
        await writeFile(join(right, "SKILL.md"), "hello\n");

        const verdict = await compareSkillDirectoryContent(left, right);

        expect(verdict).toBe("different");
    });

    test("returns unreadable when a side does not exist", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-unreadable");
        const left = join(root, "left");
        const right = join(root, "missing");

        await mkdir(left, { recursive: true });
        await writeFile(join(left, "SKILL.md"), "hello\n");

        const verdict = await compareSkillDirectoryContent(left, right);

        expect(verdict).toBe("unreadable");
    });

    test("returns different when host contains a symlink not present in source", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-inner-symlink");
        const host = join(root, "host");
        const source = join(root, "source");
        const target = join(root, "target.txt");

        await mkdir(host, { recursive: true });
        await mkdir(source, { recursive: true });
        await writeFile(target, "outside\n");
        await writeFile(join(host, "SKILL.md"), "hello\n");
        await writeFile(join(source, "SKILL.md"), "hello\n");
        await symlink(target, join(host, "extra.txt"));

        const verdict = await compareSkillDirectoryContent(host, source);

        expect(verdict).toBe("different");
    });

    test("returns equal for nested directories with identical files", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-nested");
        const left = join(root, "left");
        const right = join(root, "right");

        await mkdir(join(left, "references"), { recursive: true });
        await mkdir(join(right, "references"), { recursive: true });
        await writeFile(join(left, "SKILL.md"), "hello\n");
        await writeFile(join(left, "references", "ref.md"), "body\n");
        await writeFile(join(right, "SKILL.md"), "hello\n");
        await writeFile(join(right, "references", "ref.md"), "body\n");

        const verdict = await compareSkillDirectoryContent(left, right);

        expect(verdict).toBe("equal");
    });
});

describe("resolveHostControlState", () => {
    const basePath = "/tmp/host/path";

    test("returns non-managed when metadata file is absent", async () => {
        const verdict = await resolveHostControlState({
            copy: { path: basePath, state: "unmanaged" },
            sourcePath: null,
            kind: "registry",
        });

        expect(verdict).toBe("non-managed");
    });

    test("returns unknown when metadata is present but unparseable", async () => {
        const verdict = await resolveHostControlState({
            copy: { path: basePath, state: "unparseable" },
            sourcePath: null,
            kind: "registry",
        });

        expect(verdict).toBe("unknown");
    });

    test("returns controlled for local skill with metadata regardless of sourcePath", async () => {
        const verdict = await resolveHostControlState({
            copy: { path: basePath, state: "managed" },
            sourcePath: null,
            kind: "local",
        });

        expect(verdict).toBe("controlled");
    });

    test("returns unknown when sourcePath is null for non-local kind", async () => {
        const verdict = await resolveHostControlState({
            copy: { path: basePath, state: "managed" },
            sourcePath: null,
            kind: "registry",
        });

        expect(verdict).toBe("unknown");
    });

    test("returns unknown when sourcePath directory does not exist", async () => {
        const verdict = await resolveHostControlState({
            copy: { path: basePath, state: "managed" },
            sourcePath: "/nonexistent/source/path",
            kind: "registry",
        });

        expect(verdict).toBe("unknown");
    });

    test("returns controlled when host and source contents match", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-state-controlled");
        const hostPath = join(root, "host");
        const sourcePath = join(root, "source");

        await mkdir(hostPath, { recursive: true });
        await mkdir(sourcePath, { recursive: true });
        await writeFile(join(hostPath, "SKILL.md"), "hello\n");
        await writeFile(join(sourcePath, "SKILL.md"), "hello\n");

        const verdict = await resolveHostControlState({
            copy: { path: hostPath, state: "managed" },
            sourcePath,
            kind: "registry",
        });

        expect(verdict).toBe("controlled");
    });

    test("returns modified when host content diverges from source", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-state-modified");
        const hostPath = join(root, "host");
        const sourcePath = join(root, "source");

        await mkdir(hostPath, { recursive: true });
        await mkdir(sourcePath, { recursive: true });
        await writeFile(join(hostPath, "SKILL.md"), "user-edited\n");
        await writeFile(join(sourcePath, "SKILL.md"), "original\n");

        const verdict = await resolveHostControlState({
            copy: { path: hostPath, state: "managed" },
            sourcePath,
            kind: "registry",
        });

        expect(verdict).toBe("modified");
    });

    test("returns modified when host contains a symlink absent from source", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-state-tampered-symlink");
        const hostPath = join(root, "host");
        const sourcePath = join(root, "source");
        const target = join(root, "target.txt");

        await mkdir(hostPath, { recursive: true });
        await mkdir(sourcePath, { recursive: true });
        await writeFile(target, "outside\n");
        await writeFile(join(hostPath, "SKILL.md"), "hello\n");
        await writeFile(join(sourcePath, "SKILL.md"), "hello\n");
        await symlink(target, join(hostPath, "extra.txt"));

        const verdict = await resolveHostControlState({
            copy: { path: hostPath, state: "managed" },
            sourcePath,
            kind: "registry",
        });

        expect(verdict).toBe("modified");
    });

    test("symlink fast-path returns controlled when host realpath equals source", async () => {
        const root = await createTemporaryDirectory("oo-skills-info-state-symlink");
        const realPath = join(root, "real");
        const linkPath = join(root, "link");

        await mkdir(realPath, { recursive: true });
        await writeFile(join(realPath, "SKILL.md"), "hello\n");
        await symlink(realPath, linkPath, "dir");

        const verdict = await resolveHostControlState({
            copy: { path: linkPath, state: "managed" },
            sourcePath: realPath,
            kind: "registry",
        });

        expect(verdict).toBe("controlled");
    });
});
