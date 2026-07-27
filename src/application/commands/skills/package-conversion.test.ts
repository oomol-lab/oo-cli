import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, test } from "bun:test";

import pino from "pino";

import {
    createTemporaryDirectory,
    expectCliUserError,
    requireAbortSignal,
    toRequest,
    useTemporaryDirectoryCleanup,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { createSymbolicLinkForTest } from "./__tests__/helpers.ts";
import {
    convertSkillDirectoryToPackage,
    publishConvertedSkillPackage,
    readLocalSkillPackageMetadata,
    writePublishedSkillMetadata,
} from "./package-conversion.ts";
import skillPackageGitAttributesTemplate from "./package-template-files/gitattributes.template" with { type: "text" };
import skillPackageGitIgnoreTemplate from "./package-template-files/gitignore.template" with { type: "text" };
import {
    installedRegistrySkillCompatibility,
    ooNoticeEndMarker,
    ooNoticeStartMarker,
} from "./registry-skill-markdown.ts";
import { parseSkillMarkdownMatter } from "./skill-frontmatter.ts";

const legacyOoNotice = [
    ooNoticeStartMarker,
    "",
    "Important: legacy cloud task execution guidance.",
    "",
    ooNoticeEndMarker,
].join("\n");

describe("skill package conversion", () => {
    const cleanup = useTemporaryDirectoryCleanup();

    test("converts a reference-style skill into an OOMOL package", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("skill-source");
        const packageRootDirectoryPath = await createTemporaryDirectory("skill-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        const sourceSkillMarkdown = [
            "---",
            "name: xiaohongshu-image-generator",
            "description: Generate 1-10 beautiful infographic series for Xiaohongshu platform from any content, optimized for engagement and visual appeal.",
            `compatibility: ${installedRegistrySkillCompatibility}`,
            "metadata:",
            "  title: Xiaohongshu Image Generator",
            "  icon: ':twemoji:closed-book:'",
            "  packageName: '@old/xiaohongshu-image-generator'",
            "  version: '0.1.2'",
            "---",
            "",
            "# Xiaohongshu Image Generator",
            "",
        ].join("\n");

        await writeSkillFile(sourceDirectoryPath, sourceSkillMarkdown);
        await Bun.write(join(sourceDirectoryPath, ".env"), "local=true\n");
        await Bun.write(join(sourceDirectoryPath, ".env.production"), "TOKEN=secret\n");
        await Bun.write(join(sourceDirectoryPath, ".npmrc"), "//registry.test/:_authToken=secret\n");
        await Bun.write(join(sourceDirectoryPath, ".oo-metadata.json"), "{}\n");
        await Bun.write(join(sourceDirectoryPath, "debug.local"), "local\n");
        await Bun.write(join(sourceDirectoryPath, "token.secret"), "secret\n");
        await mkdir(join(sourceDirectoryPath, ".git"), { recursive: true });
        await Bun.write(join(sourceDirectoryPath, ".git", "config"), "private\n");
        await mkdir(join(sourceDirectoryPath, "assets"), { recursive: true });
        await Bun.write(join(sourceDirectoryPath, "assets", "prompt.txt"), "Prompt\n");

        const result = await convertSkillDirectoryToPackage({
            packageName: "@alice/xiaohongshu-image-generator",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "xiaohongshu-image-generator",
            version: "0.1.3",
        });

        expect(result).toEqual({
            packageName: "@alice/xiaohongshu-image-generator",
            packageRootDirectoryPath,
            skillId: "xiaohongshu-image-generator",
            version: "0.1.3",
        });
        expect(await readFile(join(packageRootDirectoryPath, "package.json"), "utf8")).toBe(
            [
                "{",
                "  \"name\": \"@alice/xiaohongshu-image-generator\",",
                "  \"version\": \"0.1.3\",",
                "  \"displayName\": \"Xiaohongshu Image Generator\",",
                "  \"description\": \"Generate 1-10 beautiful infographic series for Xiaohongshu platform from any content, optimized for engagement and visual appeal.\",",
                "  \"icon\": \":twemoji:closed-book:\",",
                "  \"files\": [",
                "    \"package/.gitattributes\",",
                "    \"package/.gitignore\",",
                "    \"package/package.oo.yaml\",",
                "    \"package/skills\",",
                "    \"package/.oo-thumbnail.json\",",
                "    \"package/.oo-thumbnail.zh-CN.json\"",
                "  ]",
                "}",
                "",
            ].join("\n"),
        );
        expect(
            await readFile(join(packageRootDirectoryPath, "package", "package.oo.yaml"), "utf8"),
        ).toBe(
            [
                "name: \"@alice/xiaohongshu-image-generator\"",
                "version: 0.1.3",
                "displayName: \"Xiaohongshu Image Generator\"",
                "description: \"Generate 1-10 beautiful infographic series for Xiaohongshu platform from any content, optimized for engagement and visual appeal.\"",
                "icon: \":twemoji:closed-book:\"",
                "",
            ].join("\n"),
        );
        expect(
            await readFile(join(packageRootDirectoryPath, "package", ".gitattributes"), "utf8"),
        ).toBe(skillPackageGitAttributesTemplate);
        expect(
            await readFile(join(packageRootDirectoryPath, "package", ".gitignore"), "utf8"),
        ).toBe(skillPackageGitIgnoreTemplate);
        expect(
            await readFile(
                join(
                    packageRootDirectoryPath,
                    "package",
                    "skills",
                    "xiaohongshu-image-generator",
                    "SKILL.md",
                ),
                "utf8",
            ),
        ).toBe(
            [
                "---",
                "name: xiaohongshu-image-generator",
                "description: Generate 1-10 beautiful infographic series for Xiaohongshu platform from any content, optimized for engagement and visual appeal.",
                "metadata:",
                "  title: Xiaohongshu Image Generator",
                "  icon: ':twemoji:closed-book:'",
                "  packageName: '@old/xiaohongshu-image-generator'",
                "  version: '0.1.2'",
                "---",
                "",
                "# Xiaohongshu Image Generator",
                "",
            ].join("\n"),
        );
        expect(await readFile(join(sourceDirectoryPath, "SKILL.md"), "utf8")).toBe(
            sourceSkillMarkdown,
        );
        await Promise.all([
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                ".env",
            )),
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                ".env.production",
            )),
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                ".npmrc",
            )),
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                ".oo-metadata.json",
            )),
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                "debug.local",
            )),
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                "token.secret",
            )),
            expectPathMissing(join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "xiaohongshu-image-generator",
                ".git",
            )),
        ]);
        expect(
            await readFile(
                join(
                    packageRootDirectoryPath,
                    "package",
                    "skills",
                    "xiaohongshu-image-generator",
                    "assets",
                    "prompt.txt",
                ),
                "utf8",
            ),
        ).toBe("Prompt\n");
    });

    test("uses frontmatter title and defaults missing package fields", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("minimal-skill");
        const packageRootDirectoryPath = await createTemporaryDirectory("minimal-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: minimal-skill",
            "description: Use a known package workflow.",
            "metadata:",
            "  title: Minimal Skill Deluxe",
            "---",
            "",
            "# Minimal",
            "",
        ].join("\n"));

        const metadata = await readLocalSkillPackageMetadata({
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "minimal-skill",
        });

        expect(metadata).toEqual({
            description: "Use a known package workflow.",
            displayName: "Minimal Skill Deluxe",
            requestedVersion: "0.0.1",
            skillId: "minimal-skill",
        });

        await convertSkillDirectoryToPackage({
            packageName: "@alice/minimal-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "minimal-skill",
            version: "0.0.1",
        });

        const packageJson = JSON.parse(
            await readFile(join(packageRootDirectoryPath, "package.json"), "utf8"),
        ) as Record<string, unknown>;

        expect(packageJson.displayName).toBe("Minimal Skill Deluxe");
        expect(Object.hasOwn(packageJson, "icon")).toBeFalse();
        expect(
            await readFile(join(packageRootDirectoryPath, "package", "package.oo.yaml"), "utf8"),
        ).not.toContain("icon:");
    });

    test("reads frontmatter package metadata", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("frontmatter-package-skill");

        cleanup.track(sourceDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: frontmatter-package-skill",
            "description: Use a known package workflow.",
            "metadata:",
            "  packageName: '@bob/frontmatter-package-skill'",
            "  version: '1.2.3'",
            "---",
            "",
        ].join("\n"));

        const metadata = await readLocalSkillPackageMetadata({
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "frontmatter-package-skill",
        });

        expect(metadata).toMatchObject({
            packageName: "@bob/frontmatter-package-skill",
            requestedVersion: "1.2.3",
        });
    });

    test("excludes oo metadata even when a skill gitignore does not exclude it", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("metadata-skill");
        const packageRootDirectoryPath = await createTemporaryDirectory("metadata-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: metadata-skill",
            "description: Use a known package workflow.",
            "---",
            "",
            "# Metadata",
            "",
        ].join("\n"));
        await Bun.write(join(sourceDirectoryPath, ".gitignore"), "debug.local\n");
        await Bun.write(
            join(sourceDirectoryPath, ".oo-metadata.json"),
            "{ \"kind\": \"local\", \"schemaVersion\": 1 }\n",
        );

        await convertSkillDirectoryToPackage({
            packageName: "@alice/metadata-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "metadata-skill",
            version: "0.0.1",
        });

        await expectPathMissing(join(
            packageRootDirectoryPath,
            "package",
            "skills",
            "metadata-skill",
            ".oo-metadata.json",
        ));
    });

    test("uses source gitignore rules when converting a skill package", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("gitignore-skill");
        const packageRootDirectoryPath = await createTemporaryDirectory("gitignore-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: gitignore-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));
        await Bun.write(join(sourceDirectoryPath, ".gitignore"), [
            "private-note.md",
            "scratch/",
            "",
        ].join("\n"));
        await Bun.write(join(sourceDirectoryPath, "private-note.md"), "local\n");
        await mkdir(join(sourceDirectoryPath, "scratch"), { recursive: true });
        await Bun.write(join(sourceDirectoryPath, "scratch", "debug.txt"), "debug\n");
        await Bun.write(join(sourceDirectoryPath, "published-note.md"), "publish\n");

        await convertSkillDirectoryToPackage({
            packageName: "@alice/gitignore-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "gitignore-skill",
            version: "0.0.1",
        });

        const convertedSkillDirectoryPath = join(
            packageRootDirectoryPath,
            "package",
            "skills",
            "gitignore-skill",
        );

        await Promise.all([
            expectPathMissing(join(convertedSkillDirectoryPath, "private-note.md")),
            expectPathMissing(join(convertedSkillDirectoryPath, "scratch")),
        ]);
        expect(
            await readFile(join(convertedSkillDirectoryPath, "published-note.md"), "utf8"),
        ).toBe("publish\n");
        expect(
            await readFile(join(convertedSkillDirectoryPath, ".gitignore"), "utf8"),
        ).toBe("private-note.md\nscratch/\n");
    });

    test("publishes converted package metadata to the OOMOL registry", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("publish-source");
        const packageRootDirectoryPath = await createTemporaryDirectory("publish-package");
        const requests: Request[] = [];

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: demo-skill",
            "description: Use a known package workflow.",
            "metadata:",
            "  title: Demo Skill",
            "---",
            "",
            "# Demo",
            "",
        ].join("\n"));
        await Bun.write(join(sourceDirectoryPath, ".gitignore"), [
            ".env",
            "debug.local",
            "pack-only.txt",
            "token.secret",
            "",
        ].join("\n"));

        await convertSkillDirectoryToPackage({
            packageName: "@alice/demo-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "demo-skill",
            version: "0.0.2",
        });
        await Bun.write(
            join(packageRootDirectoryPath, "package", "skills", "demo-skill", ".env"),
            "local=true\n",
        );
        await Bun.write(
            join(packageRootDirectoryPath, "package", "skills", "demo-skill", "debug.local"),
            "local\n",
        );
        await Bun.write(
            join(packageRootDirectoryPath, "package", "skills", "demo-skill", "token.secret"),
            "secret\n",
        );
        await Bun.write(
            join(packageRootDirectoryPath, "package", "skills", "demo-skill", "pack-only.txt"),
            "pack\n",
        );

        await publishConvertedSkillPackage({
            account: {
                apiKey: "secret-1",
                endpoint: "example.test",
            },
            context: {
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response("", { status: 201 });
                },
                logger: pino({ enabled: false }),
                translator: createTranslator("en"),
            },
            packageRootDirectoryPath,
            visibility: "public",
        });

        expect(requests).toHaveLength(1);
        expect(requests[0]!.method).toBe("PUT");
        expect(requests[0]!.url).toBe("https://registry.example.test/@alice%2fdemo-skill");
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]!.headers.get("Content-Type")).toBe("application/json");
        expect(requests[0]!.headers.get("npm-command")).toBe("publish");
        expect(requests[0]!.headers.get("User-Agent")).toStartWith("npm/10.0.0 ");

        const metadata = await requests[0]!.json() as PublishMetadataForTest;
        const versionManifest = metadata.versions["0.0.2"]!;
        const attachment = metadata._attachments["demo-skill-0.0.2.tgz"]!;
        const tarballBytes = Buffer.from(attachment.data, "base64");

        expect(metadata._attachments["@alice/demo-skill-0.0.2.tgz"]).toBeUndefined();
        expect(metadata).toMatchObject({
            "_id": "@alice/demo-skill",
            "name": "@alice/demo-skill",
            "description": "Use a known package workflow.",
            "dist-tags": {
                latest: "0.0.2",
            },
            "access": "public",
        });
        expect(versionManifest).toMatchObject({
            _id: "@alice/demo-skill@0.0.2",
            name: "@alice/demo-skill",
            version: "0.0.2",
            displayName: "Demo Skill",
            description: "Use a known package workflow.",
        });
        expect(versionManifest.dist).toEqual({
            integrity: `sha512-${createHash("sha512").update(tarballBytes).digest("base64")}`,
            shasum: createHash("sha1").update(tarballBytes).digest("hex"),
            tarball: "https://registry.example.test/@alice/demo-skill/-/meta/demo-skill-0.0.2.tgz",
        });
        expect(attachment.length).toBe(tarballBytes.length);
        const tarEntryNames = readTarEntryNames(gunzipSync(tarballBytes));

        expect(tarEntryNames).toEqual(expect.arrayContaining([
            "package/package/.gitattributes",
            "package/package/.gitignore",
            "package/package/package.oo.yaml",
            "package/package/skills/",
            "package/package/skills/demo-skill/",
            "package/package/skills/demo-skill/SKILL.md",
            "package/package.json",
        ]));
        expect(tarEntryNames).not.toContain("package/package/skills/demo-skill/.env");
        expect(tarEntryNames).not.toContain("package/package/skills/demo-skill/debug.local");
        expect(tarEntryNames).not.toContain("package/package/skills/demo-skill/pack-only.txt");
        expect(tarEntryNames).not.toContain("package/package/skills/demo-skill/token.secret");
        expect(tarEntryNames).not.toContain("package/package/.oo-thumbnail.json");
        expect(tarEntryNames).not.toContain("package/package/.oo-thumbnail.zh-CN.json");
    });

    test("rejects symlinks while creating publish tarballs", async () => {
        const cases = [
            {
                expectedPath: posix.join("package", "skills", "demo-skill", "linked-secret.txt"),
                linkKind: "file",
                linkName: "linked-secret.txt",
                name: "file",
            },
            {
                expectedPath: posix.join("package", "skills", "demo-skill", "linked-secret"),
                linkKind: "directory",
                linkName: "linked-secret",
                name: "directory",
            },
        ] as const;

        for (const testCase of cases) {
            const sourceDirectoryPath = await createTemporaryDirectory(
                `publish-symlink-${testCase.name}-source`,
            );
            const packageRootDirectoryPath = await createTemporaryDirectory(
                `publish-symlink-${testCase.name}-package`,
            );
            const externalPath = await createTemporaryDirectory(
                `publish-symlink-${testCase.name}-external`,
            );
            let requestCount = 0;

            cleanup.track(sourceDirectoryPath);
            cleanup.track(packageRootDirectoryPath);
            cleanup.track(externalPath);

            await writeSkillFile(sourceDirectoryPath, [
                "---",
                "name: demo-skill",
                "description: Use a known package workflow.",
                "---",
                "",
            ].join("\n"));

            await convertSkillDirectoryToPackage({
                packageName: "@alice/demo-skill",
                packageRootDirectoryPath,
                skillDirectoryPath: sourceDirectoryPath,
                skillId: "demo-skill",
                version: "0.0.2",
            });

            await createSymbolicLinkForTest(
                join(externalPath, "secret"),
                join(
                    packageRootDirectoryPath,
                    "package",
                    "skills",
                    "demo-skill",
                    testCase.linkName,
                ),
                testCase.linkKind,
            );

            const error = await expectCliUserError(publishConvertedSkillPackage({
                account: {
                    apiKey: "secret-1",
                    endpoint: "example.test",
                },
                context: {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response("", { status: 201 });
                    },
                    logger: pino({ enabled: false }),
                    translator: createTranslator("en"),
                },
                packageRootDirectoryPath,
                visibility: "public",
            }));

            expect(error.key).toBe("errors.skills.publish.invalidPackageMetadata");
            expect(error.params).toMatchObject({
                message: `Package entries must not be symbolic links: ${testCase.expectedPath}.`,
            });
            expect(requestCount).toBe(0);
        }
    });

    test("reports failed registry publish responses", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("publish-failed-source");
        const packageRootDirectoryPath = await createTemporaryDirectory("publish-failed-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: demo-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        await convertSkillDirectoryToPackage({
            packageName: "@alice/demo-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "demo-skill",
            version: "0.0.2",
        });

        await expect(publishConvertedSkillPackage({
            account: {
                apiKey: "secret-1",
                endpoint: "oomol.com",
            },
            context: {
                fetcher: async () => new Response("conflict", { status: 409 }),
                logger: pino({ enabled: false }),
                translator: createTranslator("en"),
            },
            packageRootDirectoryPath,
            visibility: "private",
        })).rejects.toMatchObject({
            key: "errors.skills.publish.requestFailed",
            params: {
                message: "conflict",
                status: 409,
            },
        });
    });

    test("aborts registry publish requests after the request timeout", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("publish-timeout-source");
        const packageRootDirectoryPath = await createTemporaryDirectory("publish-timeout-package");
        let publishRequestAborted = false;

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: demo-skill",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        await convertSkillDirectoryToPackage({
            packageName: "@alice/demo-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "demo-skill",
            version: "0.0.2",
        });

        const error = await expectCliUserError(publishConvertedSkillPackage({
            account: {
                apiKey: "secret-1",
                endpoint: "oomol.com",
            },
            context: {
                fetcher: (_input, init) => new Promise<Response>((_, reject) => {
                    const signal = requireAbortSignal(init);

                    signal.addEventListener("abort", () => {
                        publishRequestAborted = true;

                        const error = new Error("Publish request aborted.");

                        error.name = "AbortError";
                        reject(error);
                    }, { once: true });
                }),
                logger: pino({ enabled: false }),
                translator: createTranslator("en"),
            },
            packageRootDirectoryPath,
            requestTimeoutMs: 5,
            visibility: "private",
        }));

        expect(publishRequestAborted).toBeTrue();
        expect(error.key).toBe("errors.skills.publish.requestError");
        expect(error.params).toMatchObject({
            message: "Publish request aborted.",
        });
    });

    test("removes managed OO artifacts from the converted skill only", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("notice-skill");
        const packageRootDirectoryPath = await createTemporaryDirectory("notice-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        const sourceSkillMarkdown = [
            "---",
            "name: notice-skill",
            "description: Use a known package workflow.",
            `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
            "---",
            "",
            "# Notice Skill",
            "",
            "Keep this introduction.",
            "",
            legacyOoNotice,
            "",
            "Keep this tail.",
            "",
        ].join("\n");

        await writeSkillFile(sourceDirectoryPath, sourceSkillMarkdown);

        await convertSkillDirectoryToPackage({
            packageName: "@alice/notice-skill",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "notice-skill",
            version: "0.0.1",
        });

        const convertedSkillMarkdown = await readFile(
            join(
                packageRootDirectoryPath,
                "package",
                "skills",
                "notice-skill",
                "SKILL.md",
            ),
            "utf8",
        );

        expect(convertedSkillMarkdown).toBe(
            [
                "---",
                "name: notice-skill",
                "description: Use a known package workflow.",
                "---",
                "",
                "# Notice Skill",
                "",
                "Keep this introduction.",
                "",
                "Keep this tail.",
                "",
            ].join("\n"),
        );
        expect(await readFile(join(sourceDirectoryPath, "SKILL.md"), "utf8")).toBe(
            sourceSkillMarkdown,
        );
    });

    test("derives the display name from the skill id when metadata title is missing", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("derived-title");

        cleanup.track(sourceDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: derived-title",
            "description: Use a known package workflow.",
            "---",
            "",
        ].join("\n"));

        await expect(readLocalSkillPackageMetadata({
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "derived-title",
        })).resolves.toMatchObject({
            displayName: "Derived Title",
        });
    });

    test("does not write output when source validation fails", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("invalid-source");
        const packageRootDirectoryPath = await createTemporaryDirectory("invalid-package");

        cleanup.track(sourceDirectoryPath);
        cleanup.track(packageRootDirectoryPath);

        await writeSkillFile(sourceDirectoryPath, [
            "---",
            "name: invalid-source",
            "---",
            "",
        ].join("\n"));

        await expectCliUserError(convertSkillDirectoryToPackage({
            packageName: "@alice/invalid-source",
            packageRootDirectoryPath,
            skillDirectoryPath: sourceDirectoryPath,
            skillId: "invalid-source",
            version: "0.0.1",
        }));
        await expect(
            stat(join(packageRootDirectoryPath, "package.json")),
        ).rejects.toMatchObject({
            code: "ENOENT",
        });
        await expect(
            stat(join(packageRootDirectoryPath, "package")),
        ).rejects.toMatchObject({
            code: "ENOENT",
        });
    });

    test("rejects invalid publish frontmatter", async () => {
        const cases = [
            {
                content: "# Missing frontmatter\n",
                message: "Frontmatter must be a YAML dictionary.",
                name: "missing frontmatter",
            },
            {
                content: [
                    "---",
                    "name: other-skill",
                    "description: Use a known package workflow.",
                    "---",
                    "",
                ].join("\n"),
                message: "Frontmatter name \"other-skill\" must match skill id \"broken-skill\".",
                name: "name mismatch",
            },
            {
                content: [
                    "---",
                    "name: broken-skill",
                    "description: Use a known package workflow.",
                    "metadata:",
                    "  version: not-semver",
                    "---",
                    "",
                ].join("\n"),
                message: "Frontmatter metadata.version field must be a valid semver string if provided.",
                name: "invalid version",
            },
        ] as const;

        for (const testCase of cases) {
            const sourceDirectoryPath = await createTemporaryDirectory(testCase.name);

            cleanup.track(sourceDirectoryPath);
            await writeSkillFile(sourceDirectoryPath, testCase.content);

            const error = await expectCliUserError(readLocalSkillPackageMetadata({
                skillDirectoryPath: sourceDirectoryPath,
                skillId: "broken-skill",
            }));

            expect(error.key).toBe("errors.skills.publish.invalidSkillFile");
            expect(error.params).toMatchObject({
                message: testCase.message,
            });
        }
    });

    test("writes published package metadata without changing the markdown body", async () => {
        const sourceDirectoryPath = await createTemporaryDirectory("writeback-skill");

        cleanup.track(sourceDirectoryPath);

        const originalSkillMarkdown = [
            "---",
            "name: writeback-skill",
            "description: Use a known package workflow.",
            "metadata:",
            "  title: Existing Title",
            "---",
            "",
            "# Existing Title",
            "",
            "Body stays here.",
            "",
        ].join("\n");
        const originalContent = parseSkillMarkdownMatter(originalSkillMarkdown).content;

        await writeSkillFile(sourceDirectoryPath, originalSkillMarkdown);

        await writePublishedSkillMetadata({
            packageName: "@alice/writeback-skill",
            skillDirectoryPath: sourceDirectoryPath,
            version: "0.2.0",
        });

        const parsed = parseSkillMarkdownMatter(
            await readFile(join(sourceDirectoryPath, "SKILL.md"), "utf8"),
        );

        expect(parsed.data.metadata).toMatchObject({
            packageName: "@alice/writeback-skill",
            title: "Existing Title",
            version: "0.2.0",
        });
        expect(parsed.content).toBe(originalContent);
    });
});

interface PublishMetadataForTest {
    "_attachments": Record<string, {
        data: string;
        length: number;
    }>;
    "_id": string;
    "access": string;
    "description": string;
    "dist-tags": Record<string, string>;
    "name": string;
    "versions": Record<string, {
        _id: string;
        description: string;
        displayName: string;
        dist: {
            integrity: string;
            shasum: string;
            tarball: string;
        };
        name: string;
        version: string;
    }>;
}

function readTarEntryNames(bytes: Uint8Array): string[] {
    const buffer = Buffer.from(bytes);
    const names: string[] = [];
    let offset = 0;

    while (offset + 512 <= buffer.length) {
        const name = readTarString(buffer, offset, 100);

        if (name === "") {
            break;
        }

        const prefix = readTarString(buffer, offset + 345, 155);
        const sizeText = readTarString(buffer, offset + 124, 12).trim();
        const size = sizeText === "" ? 0 : Number.parseInt(sizeText, 8);

        names.push(prefix === "" ? name : `${prefix}/${name}`);

        offset += 512 + Math.ceil(size / 512) * 512;
    }

    return names;
}

function readTarString(
    buffer: Buffer,
    offset: number,
    length: number,
): string {
    const endOffset = buffer.indexOf(0, offset);
    const boundedEndOffset = endOffset < 0 || endOffset > offset + length
        ? offset + length
        : endOffset;

    return buffer.toString("utf8", offset, boundedEndOffset);
}

async function writeSkillFile(
    directoryPath: string,
    content: string,
): Promise<void> {
    await mkdir(directoryPath, { recursive: true });
    await Bun.write(join(directoryPath, "SKILL.md"), content);
}

async function expectPathMissing(path: string): Promise<void> {
    await expect(stat(path)).rejects.toMatchObject({
        code: "ENOENT",
    });
}
