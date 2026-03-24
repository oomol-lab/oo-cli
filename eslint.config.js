import antfu from "@antfu/eslint-config";

export default antfu(
    {
        type: "app",
        typescript: true,
        formatters: true,
        stylistic: {
            indent: 4,
            quotes: "double",
            semi: true,
        },
        ignores: [
            "README.md",
            "CLAUDE.md",
            "docs/plans",
            "docs/rfcs",
            ".sisyphus",
        ],
        toml: false,
    },
    {
        files: ["**/*.{json,jsonc,json5}"],
        rules: {
            "jsonc/indent": ["error", 2],
        },
    },
    {
        files: ["**/*.{yaml,yml}"],
        rules: {
            "yaml/indent": ["error", 2],
        },
    },
    {
        rules: {
            "style/eol-last": ["error", "always"],
            "antfu/no-top-level-await": "off",
        },
    },
);
