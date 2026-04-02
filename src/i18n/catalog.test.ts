import { describe, expect, test } from "bun:test";

import { enMessages, zhMessages } from "./catalog.ts";

describe("message catalog", () => {
    test("uses shared keys for consolidated labels and errors", () => {
        expect(enMessages["auth.account.loggedIn"]).toBe(
            "Logged in to {endpoint} account {name}",
        );
        expect(enMessages["auth.account.activeAccountMissing"]).toBe(
            "The active account is missing from the auth store.",
        );
        expect(enMessages["errors.shared.invalidFormat"]).toBe(
            "Invalid format: {value}. Use json.",
        );
        expect(enMessages["errors.shared.invalidPositiveIntegerOption"]).toBe(
            "Invalid value for {option}: {value}. Use an integer greater than or equal to 1.",
        );
        expect(enMessages["labels.blocks"]).toBe("Blocks:");
        expect(enMessages["labels.status"]).toBe("Status");
        expect(enMessages["labels.version"]).toBe("Version");
        expect(zhMessages["auth.account.loggedIn"]).toBe(
            "已登录 {endpoint} 账号 {name}",
        );
        expect(zhMessages["auth.account.activeAccountMissing"]).toBe(
            "当前激活账号不存在于认证数据中。",
        );
        expect(zhMessages["errors.shared.invalidFormat"]).toBe(
            "无效的 format：{value}。请使用 json。",
        );
        expect(zhMessages["errors.shared.invalidPositiveIntegerOption"]).toBe(
            "{option} 的值无效：{value}。请使用大于等于 1 的整数。",
        );
        expect(zhMessages["labels.blocks"]).toBe("功能块：");
        expect(zhMessages["labels.status"]).toBe("状态");
        expect(zhMessages["labels.version"]).toBe("版本");
    });

    test("does not keep removed duplicate keys", () => {
        const removedKeys = [
            "auth.login.success",
            "auth.status.loggedIn",
            "auth.status.missing",
            "errors.auth.activeAccountMissing",
            "errors.cloudTask.invalidFormat",
            "errors.cloudTaskLog.invalidPage",
            "errors.file.invalidFormat",
            "errors.fileList.invalidLimit",
            "errors.packageInfo.invalidFormat",
            "errors.search.invalidFormat",
            "errors.skillsSearch.invalidFormat",
            "cloudTask.text.status",
            "file.text.status",
            "packageInfo.text.blocks",
            "search.text.blocks",
            "skills.list.version",
            "versionInfo.version",
        ] as const;

        for (const key of removedKeys) {
            expect(Object.hasOwn(enMessages, key)).toBeFalse();
            expect(Object.hasOwn(zhMessages, key)).toBeFalse();
        }
    });
});
