interface OpenFlowInvocation {
    readonly args: readonly string[];
    readonly commandIndex: number;
    readonly teamFlag?: string;
}

// Kept apart from the `flow` command module so startup can detect a Flow
// invocation without loading the Open Flow runtime.
export function resolveOpenFlowInvocation(argv: readonly string[]): OpenFlowInvocation | undefined {
    let commandIndex = 0;
    let teamFlag: string | undefined;

    while (commandIndex < argv.length) {
        const argument = argv[commandIndex];

        if (argument === "--debug" || argument?.startsWith("--lang=")) {
            commandIndex += 1;
            continue;
        }

        if (argument === "--lang") {
            commandIndex += 2;
            continue;
        }

        if (argument === "--team") {
            teamFlag = argv[commandIndex + 1];
            commandIndex += 2;
            continue;
        }

        if (argument?.startsWith("--team=")) {
            teamFlag = argument.slice("--team=".length);
            commandIndex += 1;
            continue;
        }

        break;
    }

    if (argv[commandIndex] !== "flow") {
        return undefined;
    }

    return {
        args: argv.slice(commandIndex + 1),
        commandIndex,
        ...(teamFlag === undefined ? {} : { teamFlag }),
    };
}
