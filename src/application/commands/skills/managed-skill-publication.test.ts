import { mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";

import {
    isManagedSkillPublicationCurrent,
} from "./managed-skill-publication.ts";

describe("managed skill publication state", () => {
    test("treats a copied target as current", async () => {
        const skillDirectoryPath = join(
            tmpdir(),
            `oo-managed-skill-publication-target-${Bun.randomUUIDv7()}`,
        );

        try {
            await mkdir(skillDirectoryPath, { recursive: true });

            await expect(
                isManagedSkillPublicationCurrent(skillDirectoryPath),
            ).resolves.toBeTrue();
        }
        finally {
            await rm(skillDirectoryPath, { force: true, recursive: true });
        }
    });

    test("treats a symlink target as not current", async () => {
        const rootDirectoryPath = join(
            tmpdir(),
            `oo-linked-managed-skill-publication-target-${Bun.randomUUIDv7()}`,
        );
        const canonicalSkillDirectoryPath = join(rootDirectoryPath, "canonical");
        const installedSkillDirectoryPath = join(rootDirectoryPath, "installed");

        try {
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });
            await symlink(
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
                process.platform === "win32" ? "junction" : "dir",
            );

            await expect(
                isManagedSkillPublicationCurrent(installedSkillDirectoryPath),
            ).resolves.toBeFalse();
        }
        finally {
            await rm(rootDirectoryPath, { force: true, recursive: true });
        }
    });

    test("treats a missing target as not current", async () => {
        const missingSkillDirectoryPath = join(
            tmpdir(),
            `oo-missing-managed-skill-publication-target-${Bun.randomUUIDv7()}`,
        );

        await expect(
            isManagedSkillPublicationCurrent(missingSkillDirectoryPath),
        ).resolves.toBeFalse();
    });
});
