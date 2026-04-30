export function renderSkillTitle(skillName: string): string {
    return skillName
        .split("-")
        .filter(part => part !== "")
        .map(capitalizeAsciiWord)
        .join(" ");
}

function capitalizeAsciiWord(value: string): string {
    const firstChar = value[0];

    if (firstChar === undefined) {
        return value;
    }

    return `${firstChar.toUpperCase()}${value.slice(1)}`;
}
