import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";

export default tseslint.config(
    {
        ignores: ["out/**", "generated/**", "**/generated/**", "node_modules/**", "bin/**", "obj/**", "Solution/**"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,tsx}"],
        plugins: { react },
        languageOptions: {
            parserOptions: {
                ecmaFeatures: { jsx: true }
            }
        },
        settings: {
            react: { version: "detect" }
        },
        rules: {
            ...react.configs.recommended.rules,
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off"
        }
    },
    {
        files: ["**/*.test.ts"],
        rules: {
            "@typescript-eslint/no-unused-expressions": "off"
        }
    }
);
